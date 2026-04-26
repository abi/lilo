import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { UploadedChatFile } from "../chat/chat.request.js";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { readCsvEnv, readRequiredEnv } from "../../shared/config/env.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { ASK_USER_QUESTION_TOOL_NAME } from "../../shared/tools/askUserQuestionTool.js";
import { readWorkspaceAppPrefs } from "../../shared/workspace/appPrefs.js";
import { resolveDailyWhatsAppChatId, storeDailyWhatsAppChatId } from "./threadStore.js";

const getWhatsAppThreadTimezone = async (): Promise<string> => {
  const workspacePrefs = await readWorkspaceAppPrefs(WORKSPACE_ROOT);
  return workspacePrefs.timeZone ?? "America/New_York";
};

const normalizeWhatsAppAddress = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.toLowerCase().startsWith("whatsapp:")
    ? trimmed
    : `whatsapp:${trimmed}`;
};

const secureCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const validateTwilioSignature = (url: string, form: TwilioWebhookBody, signature: string): boolean => {
  const authToken = readRequiredEnv("TWILIO_AUTH_TOKEN");
  const sortedEntries = Object.entries(form)
    .filter(([, value]) => typeof value === "string")
    .sort(([left], [right]) => left.localeCompare(right));
  const signedPayload = sortedEntries.reduce(
    (accumulator, [key, value]) => accumulator + key + value,
    url,
  );
  const expectedSignature = createHmac("sha1", authToken)
    .update(signedPayload)
    .digest("base64");

  return secureCompare(signature, expectedSignature);
};

const getAllowedWhatsAppSenders = (): string[] => {
  const allowedSenders = readCsvEnv("LILO_WHATSAPP_ALLOWED_SENDERS").map(
    normalizeWhatsAppAddress,
  );

  if (allowedSenders.length === 0) {
    throw new Error("LILO_WHATSAPP_ALLOWED_SENDERS is not configured");
  }

  return allowedSenders;
};

const twimlOk = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const resolveExternalRequestUrl = (requestUrl: string, headers: Headers): string => {
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (!forwardedProto || !forwardedHost) {
    return requestUrl;
  }

  const url = new URL(requestUrl);
  url.protocol = `${forwardedProto}:`;
  url.host = forwardedHost;
  return url.toString();
};

const MAX_WHATSAPP_REPLY_CHARS = 1_500;

const isImageMimeType = (value: string): boolean =>
  value.trim().toLowerCase().startsWith("image/");

const MEDIA_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "audio/aac": ".aac",
  "audio/amr": ".amr",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "text/plain": ".txt",
  "video/3gpp": ".3gp",
  "video/mp4": ".mp4",
  "video/mpeg": ".mpeg",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

const getMediaExtension = (mimeType: string): string =>
  MEDIA_EXTENSION_BY_MIME_TYPE[mimeType.trim().toLowerCase()] ?? ".bin";

type AskUserQuestionDetails = {
  question: string;
  options: string[];
  allowSkip: boolean;
};

interface TwilioErrorResponse {
  code?: unknown;
  message?: unknown;
  more_info?: unknown;
  status?: unknown;
}

class TwilioWhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly twilioCode: string | null,
    readonly twilioMessage: string | null,
    readonly moreInfo: string | null,
  ) {
    super(message);
    this.name = "TwilioWhatsAppSendError";
  }
}

const twilioFetch = async (
  accountSid: string,
  authToken: string,
  resource: string,
  init?: RequestInit,
): Promise<Response> => {
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Basic ${basicAuth}`);

  return fetch(resource, {
    ...init,
    headers,
  });
};

const TWILIO_RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const findWhatsAppReplySplitIndex = (text: string): number => {
  const search = text.slice(0, MAX_WHATSAPP_REPLY_CHARS + 1);
  const minimumCleanBoundary = Math.floor(MAX_WHATSAPP_REPLY_CHARS * 0.45);
  const boundaries = [
    { pattern: "\n", offset: 0 },
    { pattern: ". ", offset: 1 },
    { pattern: "? ", offset: 1 },
    { pattern: "! ", offset: 1 },
    { pattern: "; ", offset: 1 },
    { pattern: ", ", offset: 1 },
    { pattern: " ", offset: 0 },
  ];

  let best = -1;
  for (const boundary of boundaries) {
    const index = search.lastIndexOf(boundary.pattern);
    if (index >= minimumCleanBoundary && index > best) {
      best = index + boundary.offset;
    }
  }

  return best > 0 ? best : MAX_WHATSAPP_REPLY_CHARS;
};

const splitOversizedWhatsAppText = (text: string): string[] => {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > MAX_WHATSAPP_REPLY_CHARS) {
    const splitIndex = findWhatsAppReplySplitIndex(remaining);
    const chunk = remaining.slice(0, splitIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
};

const splitWhatsAppReply = (body: string): string[] => {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  const appendChunk = (chunk: string) => {
    const trimmed = chunk.trim();
    if (trimmed.length === 0) {
      return;
    }

    if (trimmed.length > MAX_WHATSAPP_REPLY_CHARS) {
      splitOversizedWhatsAppText(trimmed).forEach(appendChunk);
      return;
    }

    const previous = chunks[chunks.length - 1];
    const joined = previous ? `${previous}\n\n${trimmed}` : trimmed;
    if (previous && joined.length <= MAX_WHATSAPP_REPLY_CHARS) {
      chunks[chunks.length - 1] = joined;
      return;
    }

    chunks.push(trimmed);
  };

  paragraphs.forEach(appendChunk);
  return chunks;
};

const sendWhatsAppReply = async (
  to: string,
  body: string,
  meta: { chunkIndex?: number; chunkCount?: number } = {},
): Promise<{ sid: string | null; status: string | null }> => {
  const accountSid = readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = readRequiredEnv("TWILIO_AUTH_TOKEN");
  const from = normalizeWhatsAppAddress(
    readRequiredEnv("LILO_WHATSAPP_AGENT_NUMBER"),
  );

  const params = new URLSearchParams({
    To: normalizeWhatsAppAddress(to),
    From: from,
    Body: body,
  });

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await twilioFetch(
        accountSid,
        authToken,
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      const responseText = await response.text();
      let responseJson: Record<string, unknown> | null = null;
      if (responseText.trim().length > 0) {
        try {
          responseJson = JSON.parse(responseText) as Record<string, unknown>;
        } catch {
          responseJson = null;
        }
      }

      if (response.ok) {
        return {
          sid: typeof responseJson?.sid === "string" ? responseJson.sid : null,
          status: typeof responseJson?.status === "string" ? responseJson.status : null,
        };
      }

      const errorResponse = responseJson as TwilioErrorResponse | null;
      const twilioCode =
        typeof errorResponse?.code === "number" || typeof errorResponse?.code === "string"
          ? String(errorResponse.code)
          : null;
      const twilioMessage =
        typeof errorResponse?.message === "string" ? errorResponse.message : null;
      const moreInfo =
        typeof errorResponse?.more_info === "string" ? errorResponse.more_info : null;
      const error = new TwilioWhatsAppSendError(
        [
          `Twilio WhatsApp send failed with status ${response.status}`,
          twilioCode ? `code ${twilioCode}` : null,
          twilioMessage,
        ]
          .filter(Boolean)
          .join(": "),
        response.status,
        twilioCode,
        twilioMessage,
        moreInfo,
      );
      lastError = error;
      const isRetryable = TWILIO_RETRYABLE_STATUS_CODES.has(response.status) && attempt < 3;

      console.error(
        `[whatsapp] Twilio send failed attempt=${attempt} status=${response.status} twilioCode=${twilioCode ?? "unknown"} retryable=${isRetryable} message=${twilioMessage ?? responseText}`,
      );

      if (!isRetryable) {
        captureBackendException(error, {
          tags: {
            area: "whatsapp",
            provider: "twilio",
            operation: "send_reply",
            to: normalizeWhatsAppAddress(to),
            from,
            status_code: response.status,
            attempt,
            ...(twilioCode ? { twilio_code: twilioCode } : {}),
          },
          extras: {
            responseBody: responseText,
            responseJson,
            messageLength: body.length,
            maxReplyChunkChars: MAX_WHATSAPP_REPLY_CHARS,
            chunkIndex: meta.chunkIndex ?? null,
            chunkCount: meta.chunkCount ?? null,
            twilioMessage,
            moreInfo,
          },
          level: "error",
          fingerprint: [
            "whatsapp",
            "twilio",
            "send_reply",
            String(response.status),
            twilioCode ?? "unknown_code",
          ],
        });
        throw error;
      }
    } catch (error) {
      if (error instanceof TwilioWhatsAppSendError) {
        throw error;
      }

      lastError = error;
      const isNetworkFailure = !(error instanceof Error && /status \d+/.test(error.message));

      console.error(
        `[whatsapp] Twilio send threw attempt=${attempt} retryable=${attempt < 3} error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (attempt >= 3 || !isNetworkFailure) {
        captureBackendException(error, {
          tags: {
            area: "whatsapp",
            provider: "twilio",
            operation: "send_reply",
            to: normalizeWhatsAppAddress(to),
            from,
            attempt,
          },
          extras: {
            messageLength: body.length,
            maxReplyChunkChars: MAX_WHATSAPP_REPLY_CHARS,
            chunkIndex: meta.chunkIndex ?? null,
            chunkCount: meta.chunkCount ?? null,
          },
          level: "error",
          fingerprint: ["whatsapp", "twilio", "send_reply", "thrown"],
        });
        throw error;
      }
    }

    await sleep(500 * attempt);
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error("Twilio WhatsApp send failed for an unknown reason"));
};

const sendWhatsAppReplyChunked = async (
  to: string,
  body: string,
): Promise<Array<{ sid: string | null; status: string | null }>> => {
  const chunks = splitWhatsAppReply(body);
  const results: Array<{ sid: string | null; status: string | null }> = [];

  for (const [index, chunk] of chunks.entries()) {
    results.push(
      await sendWhatsAppReply(to, chunk, {
        chunkIndex: index + 1,
        chunkCount: chunks.length,
      }),
    );
  }

  return results;
};

const sendWhatsAppTypingIndicator = async (messageId: string): Promise<void> => {
  const accountSid = readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = readRequiredEnv("TWILIO_AUTH_TOKEN");
  const params = new URLSearchParams({
    messageId,
    channel: "whatsapp",
  });

  const response = await twilioFetch(
    accountSid,
    authToken,
    "https://messaging.twilio.com/v2/Indicators/Typing.json",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Twilio WhatsApp typing indicator failed with status ${response.status}: ${await response.text()}`,
    );
  }
};

const startWhatsAppTypingIndicatorLoop = (
  messageId: string | null,
): (() => void) => {
  if (!messageId) {
    return () => undefined;
  }

  let stopped = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    try {
      await sendWhatsAppTypingIndicator(messageId);
      console.log(`[whatsapp] sent typing indicator messageId=${messageId}`);
    } catch (error) {
      console.warn(
        `[whatsapp] failed to send typing indicator messageId=${messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  void tick();
  interval = setInterval(() => {
    if (!stopped) {
      void tick();
    }
  }, 20_000);

  return () => {
    stopped = true;
    if (interval) {
      clearInterval(interval);
    }
  };
};

const parseNumMedia = (value: FormDataEntryValue | undefined): number => {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

type TwilioWebhookBody = Record<string, string | File>;

const buildInboundWhatsAppPrompt = (body: string): string =>
  [
    "Channel: WhatsApp",
    "If you need a follow-up answer, ask it in plain WhatsApp prose. Number any options so the user can reply by number or text.",
    "",
    `WhatsApp message from user: ${body || "(empty message)"}`,
  ].join("\n");

const getInboundMessageSid = (form: TwilioWebhookBody): string | null => {
  const candidates = [form.MessageSid, form.SmsMessageSid, form.SmsSid];
  const sid = candidates.find(
    (value): value is string => typeof value === "string" && /^(SM|MM)[0-9a-fA-F]{32}$/.test(value),
  );

  return sid ?? null;
};

const getInboundMediaName = (mimeType: string, index: number): string =>
  `whatsapp-media-${index + 1}${getMediaExtension(mimeType)}`;

const loadInboundMedia = async (form: TwilioWebhookBody): Promise<UploadedChatFile[]> => {
  const accountSid = readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = readRequiredEnv("TWILIO_AUTH_TOKEN");
  const numMedia = parseNumMedia(form.NumMedia);
  const uploads: UploadedChatFile[] = [];

  for (let index = 0; index < numMedia; index += 1) {
    const mediaUrl = form[`MediaUrl${index}`];
    const mediaContentType = form[`MediaContentType${index}`];

    if (typeof mediaUrl !== "string") {
      continue;
    }

    const mimeType =
      typeof mediaContentType === "string" && mediaContentType.trim().length > 0
        ? mediaContentType.trim()
        : "application/octet-stream";

    try {
      const response = await twilioFetch(accountSid, authToken, mediaUrl);
      if (!response.ok) {
        console.warn("[whatsapp] failed to download inbound media", {
          index,
          mimeType,
          status: response.status,
        });
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer).toString("base64");
      const image: ImageContent | undefined = isImageMimeType(mimeType)
        ? {
            type: "image",
            mimeType,
            data,
          }
        : undefined;

      uploads.push({
        originalName: getInboundMediaName(mimeType, index),
        mimeType,
        size: arrayBuffer.byteLength,
        bytes: new Uint8Array(arrayBuffer),
        image,
      });
    } catch (error) {
      console.warn("[whatsapp] failed to process inbound media", {
        index,
        mimeType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return uploads;
};

const getAskUserQuestionDetails = (value: unknown): AskUserQuestionDetails | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const details = value as {
    question?: unknown;
    options?: unknown;
    allowSkip?: unknown;
  };
  const question = typeof details.question === "string" ? details.question.trim() : "";
  const options = Array.isArray(details.options)
    ? details.options
        .filter((option): option is string => typeof option === "string")
        .map((option) => option.trim())
        .filter(Boolean)
    : [];

  if (!question && options.length === 0) {
    return null;
  }

  return {
    question,
    options,
    allowSkip: typeof details.allowSkip === "boolean" ? details.allowSkip : true,
  };
};

const formatWhatsAppQuestionFallback = (details: AskUserQuestionDetails): string => {
  const parts = [
    details.question || "Could you reply with a bit more information?",
  ];

  if (details.options.length > 0) {
    parts.push(
      "",
      "Reply with one of these options:",
      ...details.options.map((option, index) => `${index + 1}. ${option}`),
    );
  }

  if (details.allowSkip) {
    parts.push("", "You can also reply with \"skip\" if you want me to choose a reasonable default.");
  }

  return parts.join("\n");
};

export const registerWhatsAppRoutes = (app: Hono, chatService: PiSdkChatService): void => {
  app.post("/api/inbound-whatsapp", async (c) => {
    const form = (await c.req.parseBody()) as TwilioWebhookBody;
    const from = typeof form.From === "string" ? normalizeWhatsAppAddress(form.From) : "";
    const body = typeof form.Body === "string" ? form.Body.trim() : "";
    const signature = c.req.header("X-Twilio-Signature")?.trim() ?? "";
    const externalUrl = resolveExternalRequestUrl(c.req.url, c.req.raw.headers);

    if (!from) {
      return c.text("Missing From", 400);
    }

    try {
      if (!signature || !validateTwilioSignature(externalUrl, form, signature)) {
        captureBackendException(new Error("Inbound WhatsApp rejected due to invalid Twilio signature"), {
          tags: {
            area: "whatsapp",
            provider: "twilio",
            operation: "reject_inbound_signature",
          },
          extras: {
            from,
            hasSignature: Boolean(signature),
            requestUrl: c.req.url,
            externalUrl,
          },
          level: "error",
          fingerprint: ["whatsapp", "twilio", "reject_inbound", "signature"],
        });
        return c.text("Invalid signature", 401);
      }
    } catch (error) {
      captureBackendException(error, {
        tags: {
          area: "whatsapp",
          provider: "twilio",
          operation: "validate_inbound_signature",
        },
        extras: {
          from,
          requestUrl: c.req.url,
          externalUrl,
        },
        level: "error",
        fingerprint: ["whatsapp", "twilio", "validate_inbound_signature"],
      });
      console.error("[whatsapp] Failed to validate inbound signature:", error);
      return c.text("Signature validation failed", 500);
    }

    try {
      const allowedSenders = getAllowedWhatsAppSenders();
      if (!allowedSenders.includes(from)) {
        captureBackendException(new Error("Inbound WhatsApp rejected by sender allowlist"), {
          tags: {
            area: "whatsapp",
            provider: "twilio",
            operation: "reject_inbound_sender",
          },
          extras: {
            from,
            allowedSenders,
          },
          level: "error",
          fingerprint: ["whatsapp", "twilio", "reject_inbound", "sender_allowlist"],
        });
        c.header("Content-Type", "text/xml");
        return c.body(twimlOk, 200);
      }
    } catch (error) {
      captureBackendException(error, {
        tags: {
          area: "whatsapp",
          provider: "twilio",
          operation: "sender_allowlist_config_error",
        },
        extras: {
          from,
        },
        level: "error",
        fingerprint: ["whatsapp", "twilio", "sender_allowlist_config_error"],
      });
      console.error("[whatsapp] Sender allowlist configuration error:", error);
      return c.text("Sender allowlist configuration error", 500);
    }

    const processWhatsApp = async () => {
      const stopTypingIndicator = startWhatsAppTypingIndicatorLoop(
        getInboundMessageSid(form),
      );

      try {
        const now = new Date();
        const timezone = await getWhatsAppThreadTimezone();
        const inboundMedia = await loadInboundMedia(form);
        console.log(
          `[whatsapp] inbound from=${from} bodyLength=${body.length} mediaCount=${inboundMedia.length} timezone=${timezone}`,
        );

        let chatId = await resolveDailyWhatsAppChatId(from, now, timezone);
        if (!chatId || !(await chatService.hasChat(chatId))) {
          const chat = await chatService.createChat();
          chatId = chat.id;
          await storeDailyWhatsAppChatId(from, now, timezone, chatId);
          console.log(`[whatsapp] created chat=${chatId} from=${from} timezone=${timezone}`);
        }

        const resolvedUploads = inboundMedia.length > 0
          ? await chatService.resolveUploads(
              chatId,
              await chatService.storeUploads(chatId, inboundMedia),
            )
          : { images: [], attachments: [] };
        console.log(
          `[whatsapp] resolved media chat=${chatId} imageCount=${resolvedUploads.images.length} attachmentCount=${resolvedUploads.attachments.length}`,
        );

        const currentChat = await chatService.getChat(chatId);
        if (currentChat?.status === "streaming") {
          console.log(`[whatsapp] steering active chat=${chatId} from=${from}`);
          await chatService.steerChat(chatId, {
            message: buildInboundWhatsAppPrompt(body),
            images: resolvedUploads.images,
            attachments: resolvedUploads.attachments,
            context: {},
          });
          console.log(`[whatsapp] steer accepted chat=${chatId} from=${from}`);
          return;
        }

        let responseText = "";
        let currentAssistantMessageText = "";
        let sentMessageCount = 0;
        let completionReason: string | null = null;
        let sendQueue = Promise.resolve();

        const enqueueWhatsAppSend = (
          text: string,
          kind: "assistant" | "question_fallback",
        ) => {
          const bodyToSend = text.trim();
          if (bodyToSend.length === 0) {
            return;
          }

          sendQueue = sendQueue.then(async () => {
            const sendResults = await sendWhatsAppReplyChunked(from, bodyToSend);
            sentMessageCount += sendResults.length;
            const lastSendResult = sendResults[sendResults.length - 1];
            console.log(
              `[whatsapp] replied chat=${chatId} to=${from} mode=prompt kind=${kind} chunks=${sendResults.length} sentMessageCount=${sentMessageCount} sid=${
                lastSendResult?.sid ?? "unknown"
              } status=${lastSendResult?.status ?? "unknown"}`,
            );
          });
        };

        const flushAssistantMessage = () => {
          const text = currentAssistantMessageText.trim();
          currentAssistantMessageText = "";
          enqueueWhatsAppSend(text, "assistant");
        };

        await chatService.promptChat(
          chatId,
          {
            message: buildInboundWhatsAppPrompt(body),
            images: resolvedUploads.images,
            attachments: resolvedUploads.attachments,
            context: {},
          },
          (event: SseEvent) => {
            if (event.event === "assistant_message_start") {
              currentAssistantMessageText = "";
            }

            if (event.event === "text_delta") {
              const delta = (event.data as { delta?: string }).delta ?? "";
              responseText += delta;
              currentAssistantMessageText += delta;
            }

            if (event.event === "assistant_message_end") {
              flushAssistantMessage();
            }

            if (event.event === "tool_result") {
              const toolName = (event.data as { toolName?: unknown }).toolName;
              if (toolName === ASK_USER_QUESTION_TOOL_NAME) {
                flushAssistantMessage();
                const details = getAskUserQuestionDetails(
                  (event.data as { details?: unknown }).details,
                );
                if (details) {
                  const fallback = formatWhatsAppQuestionFallback(details);
                  responseText += `\n\n${fallback}`;
                  enqueueWhatsAppSend(fallback, "question_fallback");
                }
              }
            }

            if (event.event === "done") {
              completionReason =
                typeof (event.data as { reason?: unknown }).reason === "string"
                  ? (event.data as { reason: string }).reason
                  : "completed";
            }

            if (event.event === "error") {
              completionReason = "error";
            }
          },
        );

        flushAssistantMessage();
        await sendQueue;

        console.log(
          `[whatsapp] prompt finished chat=${chatId} from=${from} completionReason=${
            completionReason ?? "unknown"
          } responseLength=${responseText.trim().length} sentMessageCount=${sentMessageCount}`,
        );

        if (completionReason !== "completed" || sentMessageCount === 0) {
          const reason = completionReason ?? "unknown";
          const severity = completionReason === "aborted" ? "warning" : "error";
          const skipError = new Error(
            `WhatsApp reply skipped for chat=${chatId} because completionReason=${reason} sentMessageCount=${sentMessageCount} responseLength=${responseText.trim().length}`,
          );
          captureBackendException(skipError, {
            tags: {
              area: "whatsapp",
              provider: "twilio",
              operation: "skip_reply",
              from,
              completion_reason: reason,
            },
            extras: {
              chatId,
              responseText,
              responseLength: responseText.trim().length,
              sentMessageCount,
              imageCount: resolvedUploads.images.length,
              attachmentCount: resolvedUploads.attachments.length,
              bodyLength: body.length,
            },
            level: severity,
            fingerprint: ["whatsapp", "skip_reply", reason],
          });
          console.error(
            `[whatsapp] skipped reply chat=${chatId} to=${from} mode=prompt completionReason=${reason} sentMessageCount=${sentMessageCount} responseLength=${responseText.trim().length}`,
          );
        }
      } catch (error) {
        if (error instanceof TwilioWhatsAppSendError) {
          console.error(
            `[whatsapp] Failed to send outbound WhatsApp reply from=${from} status=${error.status} twilioCode=${error.twilioCode ?? "unknown"} message=${error.twilioMessage ?? error.message}`,
          );
          return;
        }

        captureBackendException(error, {
          tags: {
            area: "whatsapp",
            provider: "twilio",
            operation: "process_inbound",
            from,
          },
          level: "error",
        });
        console.error("[whatsapp] Failed to process inbound WhatsApp:", error);
      } finally {
        stopTypingIndicator();
      }
    };

    void processWhatsApp();

    c.header("Content-Type", "text/xml");
    return c.body(twimlOk, 200);
  });
};
