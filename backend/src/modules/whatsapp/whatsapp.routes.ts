import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { UploadedChatFile } from "../chat/chat.request.js";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { backendConfig, requireConfigValue } from "../../shared/config/config.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import {
  AudioTranscriptionUnavailableError,
  isAudioMimeType,
  normalizeMediaMimeType,
  transcribeAudioWithOpenAi,
} from "../../shared/audio/transcription.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { ASK_USER_QUESTION_TOOL_NAME } from "../../shared/tools/askUserQuestionTool.js";
import {
  CHANNEL_RESPONSE_TOOL_NAME,
  isSendChannelResponseDetails,
  type SendChannelResponseDetails,
} from "../../shared/tools/channelResponseTool.js";
import { readWorkspaceAppPrefs } from "../../shared/workspace/appPrefs.js";
import { formatMessagingOutput } from "../channels/channelOutput.format.js";
import {
  getPublicUrlForChannelMedia,
  prepareChannelResponseMedia,
} from "../channels/channelResponse.js";
import { normalizeWhatsAppAddress } from "./whatsapp.address.js";
import { resolveDailyWhatsAppChatId, storeDailyWhatsAppChatId } from "./threadStore.js";

const getWhatsAppThreadTimezone = async (): Promise<string> => {
  const workspacePrefs = await readWorkspaceAppPrefs(WORKSPACE_ROOT);
  return workspacePrefs.timeZone ?? "America/New_York";
};

const secureCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

interface TwilioSignatureValidationResult {
  isValid: boolean;
  expectedSignature: string;
}

const compareTwilioNames = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

const compareTwilioParamNames = ([left]: [string, unknown], [right]: [string, unknown]): number =>
  compareTwilioNames(left, right);

const validateTwilioSignature = (
  url: string,
  form: TwilioWebhookBody,
  signature: string,
): TwilioSignatureValidationResult => {
  const authToken = requireConfigValue(
    backendConfig.channels.whatsapp.twilioAuthToken,
    "TWILIO_AUTH_TOKEN",
  );
  const sortedEntries = Object.entries(form)
    .filter(([, value]) => typeof value === "string")
    .sort(compareTwilioParamNames);
  const signedPayload = sortedEntries.reduce(
    (accumulator, [key, value]) => accumulator + key + value,
    url,
  );
  const expectedSignature = createHmac("sha1", authToken)
    .update(signedPayload)
    .digest("base64");

  return {
    isValid: secureCompare(signature, expectedSignature),
    expectedSignature,
  };
};

const getAllowedWhatsAppSenders = (): string[] => {
  const allowedSenders = backendConfig.channels.whatsapp.allowedSenders.map(
    normalizeWhatsAppAddress,
  );

  if (allowedSenders.length === 0) {
    throw new Error("LILO_WHATSAPP_ALLOWED_SENDERS is not configured");
  }

  return allowedSenders;
};

const twimlOk = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const resolveExternalRequestUrl = (requestUrl: string, headers: Headers): string => {
  const publicAppUrl = backendConfig.server.publicAppUrl;
  if (publicAppUrl) {
    try {
      const request = new URL(requestUrl);
      const url = new URL(publicAppUrl);
      url.pathname = request.pathname;
      url.search = request.search;
      return url.toString();
    } catch {
      console.warn("[whatsapp] Ignoring invalid LILO_PUBLIC_APP_URL for signature validation", {
        publicAppUrl,
      });
    }
  }

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

const maskSignature = (signature: string): string =>
  signature.length <= 8
    ? "[redacted]"
    : `${signature.slice(0, 4)}...${signature.slice(-4)}`;

const maskWhatsAppAddress = (address: string): string => {
  const [prefix, value = address] = address.split(":");
  const visibleTail = value.slice(-4);
  return `${prefix === value ? "whatsapp" : prefix}:***${visibleTail}`;
};

const MAX_WHATSAPP_REPLY_CHARS = 1_500;

const isImageMimeType = (value: string): boolean =>
  normalizeMediaMimeType(value).startsWith("image/");

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
  MEDIA_EXTENSION_BY_MIME_TYPE[normalizeMediaMimeType(mimeType)] ?? ".bin";

type AskUserQuestionDetails = {
  question: string;
  options: string[];
  allowSkip: boolean;
};

type WhatsAppVoiceNoteTranscript = {
  name: string;
  mimeType: string;
  transcript?: string;
  error?: string;
  model?: string;
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
  mediaUrl?: string,
  meta: { chunkIndex?: number; chunkCount?: number } = {},
): Promise<{ sid: string | null; status: string | null }> => {
  const accountSid = requireConfigValue(
    backendConfig.channels.whatsapp.twilioAccountSid,
    "TWILIO_ACCOUNT_SID",
  );
  const authToken = requireConfigValue(
    backendConfig.channels.whatsapp.twilioAuthToken,
    "TWILIO_AUTH_TOKEN",
  );
  const from = normalizeWhatsAppAddress(
    requireConfigValue(
      backendConfig.channels.whatsapp.agentNumber,
      "LILO_WHATSAPP_AGENT_NUMBER",
    ),
  );

  const params = new URLSearchParams({
    To: normalizeWhatsAppAddress(to),
    From: from,
  });
  const trimmedBody = body.trim();
  if (trimmedBody) {
    params.set("Body", trimmedBody);
  }
  if (mediaUrl) {
    params.append("MediaUrl", mediaUrl);
  }
  if (!trimmedBody && !mediaUrl) {
    throw new Error("WhatsApp reply requires body or mediaUrl");
  }

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
            hasMedia: Boolean(mediaUrl),
            mediaUrl,
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
            hasMedia: Boolean(mediaUrl),
            mediaUrl,
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

export const sendWhatsAppReplyChunked = async (
  to: string,
  body: string,
): Promise<Array<{ sid: string | null; status: string | null }>> => {
  const formattedBody = formatMessagingOutput(body, {
    publicAppUrl: backendConfig.server.publicAppUrl,
  });
  const chunks = splitWhatsAppReply(formattedBody);
  const results: Array<{ sid: string | null; status: string | null }> = [];

  for (const [index, chunk] of chunks.entries()) {
    results.push(
      await sendWhatsAppReply(to, chunk, undefined, {
        chunkIndex: index + 1,
        chunkCount: chunks.length,
      }),
    );
  }

  return results;
};

const sendWhatsAppChannelResponse = async (
  to: string,
  details: SendChannelResponseDetails,
): Promise<Array<{ sid: string | null; status: string | null }>> => {
  const mediaBatch = await prepareChannelResponseMedia(details);
  const results: Array<{ sid: string | null; status: string | null }> = [];

  for (const [index, media] of mediaBatch.entries()) {
    const mediaUrl = getPublicUrlForChannelMedia(media);

    try {
      results.push(
        await sendWhatsAppReply(to, media.caption ?? "", mediaUrl, {
          chunkIndex: index + 1,
          chunkCount: mediaBatch.length,
        }),
      );
    } catch (error) {
      captureBackendException(error, {
        tags: {
          area: "whatsapp",
          provider: "twilio",
          operation: "send_channel_response",
          to: normalizeWhatsAppAddress(to),
          response_type: media.responseType,
          mime_type: media.mimeType,
        },
        extras: {
          filename: media.filename,
          mediaUrl,
          hasUrl: Boolean(media.url),
          byteLength: media.bytes?.byteLength ?? null,
        },
        level: "error",
        fingerprint: ["whatsapp", "send_channel_response", media.responseType],
      });
      throw error;
    }
  }

  return results;
};

export const sendWhatsAppAutomationMessage = async (
  body: string,
): Promise<Array<{ sid: string | null; status: string | null }>> => {
  const recipients = getAllowedWhatsAppSenders();
  const results: Array<{ sid: string | null; status: string | null }> = [];
  const failures: Array<{ recipient: string; error: unknown }> = [];

  for (const recipient of recipients) {
    try {
      results.push(...(await sendWhatsAppReplyChunked(recipient, body)));
    } catch (error) {
      failures.push({ recipient, error });
    }
  }

  if (failures.length > 0) {
    const failedRecipients = failures.map(({ recipient }) => maskWhatsAppAddress(recipient)).join(", ");
    const error = new Error(`Failed to send WhatsApp automation message to: ${failedRecipients}`);
    captureBackendException(error, {
      tags: {
        area: "whatsapp",
        provider: "twilio",
        operation: "send_automation_fanout",
      },
      extras: {
        failedRecipients,
        failureCount: failures.length,
        recipientCount: recipients.length,
        errors: failures.map(({ recipient, error: failure }) => ({
          recipient: maskWhatsAppAddress(recipient),
          message: failure instanceof Error ? failure.message : String(failure),
        })),
      },
    });
    throw error;
  }

  return results;
};

const sendWhatsAppTypingIndicator = async (messageId: string): Promise<void> => {
  const accountSid = requireConfigValue(
    backendConfig.channels.whatsapp.twilioAccountSid,
    "TWILIO_ACCOUNT_SID",
  );
  const authToken = requireConfigValue(
    backendConfig.channels.whatsapp.twilioAuthToken,
    "TWILIO_AUTH_TOKEN",
  );
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

const buildInboundWhatsAppPrompt = (
  body: string,
  voiceNoteTranscripts: WhatsAppVoiceNoteTranscript[] = [],
): string => {
  const parts = [
    "Channel: WhatsApp",
    "",
    `WhatsApp message from user: ${body || "(empty message)"}`,
  ];

  if (voiceNoteTranscripts.length > 0) {
    parts.push("", "Voice note transcript(s):");
    for (const [index, voiceNote] of voiceNoteTranscripts.entries()) {
      const label = `Voice note ${index + 1} (${voiceNote.name}, ${voiceNote.mimeType})`;
      if (voiceNote.transcript) {
        parts.push(`${label}: ${voiceNote.transcript}`);
      } else {
        parts.push(`${label}: transcription unavailable`);
      }
    }
  }

  return parts.join("\n");
};

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
  const accountSid = requireConfigValue(
    backendConfig.channels.whatsapp.twilioAccountSid,
    "TWILIO_ACCOUNT_SID",
  );
  const authToken = requireConfigValue(
    backendConfig.channels.whatsapp.twilioAuthToken,
    "TWILIO_AUTH_TOKEN",
  );
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

const transcribeInboundVoiceNotes = async (
  uploads: UploadedChatFile[],
): Promise<WhatsAppVoiceNoteTranscript[]> => {
  const voiceNotes = uploads.filter((upload) => isAudioMimeType(upload.mimeType));
  const transcripts: WhatsAppVoiceNoteTranscript[] = [];

  for (const upload of voiceNotes) {
    const mimeType = normalizeMediaMimeType(upload.mimeType);
    try {
      const result = await transcribeAudioWithOpenAi({
        bytes: upload.bytes,
        fileName: upload.originalName,
        mimeType,
        prompt: "This is a short WhatsApp voice note to a personal assistant named Lilo.",
      });

      transcripts.push({
        name: upload.originalName,
        mimeType,
        transcript: result.text,
        model: result.model,
      });
      console.log(
        `[whatsapp] transcribed voice note name=${upload.originalName} mimeType=${mimeType} model=${result.model} transcriptLength=${result.text.length}`,
      );
    } catch (error) {
      const unavailable = error instanceof AudioTranscriptionUnavailableError;
      transcripts.push({
        name: upload.originalName,
        mimeType,
        error: unavailable ? "not_configured" : "failed",
      });

      if (!unavailable) {
        captureBackendException(error, {
          tags: {
            area: "whatsapp",
            provider: "openai",
            operation: "transcribe_voice_note",
            mime_type: mimeType,
          },
          extras: {
            fileName: upload.originalName,
            fileSize: upload.size,
          },
          level: "error",
          fingerprint: ["whatsapp", "voice_note", "transcription"],
        });
      }

      console.warn("[whatsapp] failed to transcribe voice note", {
        fileName: upload.originalName,
        mimeType,
        unavailable,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return transcripts;
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
      const validation = signature
        ? validateTwilioSignature(externalUrl, form, signature)
        : null;
      if (!validation?.isValid) {
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
            expectedSignature: validation ? maskSignature(validation.expectedSignature) : null,
            receivedSignature: signature ? maskSignature(signature) : null,
            publicAppUrl: backendConfig.server.publicAppUrl,
            forwardedProto: c.req.raw.headers.get("x-forwarded-proto"),
            forwardedHost: c.req.raw.headers.get("x-forwarded-host"),
            formKeys: Object.keys(form).sort(compareTwilioNames),
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
        const voiceNoteTranscripts = await transcribeInboundVoiceNotes(inboundMedia);
        const inboundPrompt = buildInboundWhatsAppPrompt(body, voiceNoteTranscripts);
        console.log(
          `[whatsapp] inbound from=${from} bodyLength=${body.length} mediaCount=${inboundMedia.length} voiceNoteCount=${voiceNoteTranscripts.length} timezone=${timezone}`,
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
            message: inboundPrompt,
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
            message: inboundPrompt,
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

              if (toolName === CHANNEL_RESPONSE_TOOL_NAME) {
                flushAssistantMessage();
                const details = (event.data as { details?: unknown }).details;
                if (isSendChannelResponseDetails(details)) {
                  sendQueue = sendQueue.then(async () => {
                    const sendResults = await sendWhatsAppChannelResponse(from, details);
                    sentMessageCount += sendResults.length;
                    const lastSendResult = sendResults[sendResults.length - 1];
                    console.log(
                      `[whatsapp] sent channel response chat=${chatId} to=${from} responseType=${details.responseType} sentMessageCount=${sentMessageCount} sid=${
                        lastSendResult?.sid ?? "unknown"
                      } status=${lastSendResult?.status ?? "unknown"}`,
                    );
                  });
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
              voiceNoteCount: voiceNoteTranscripts.length,
              voiceNoteTranscriptCount: voiceNoteTranscripts.filter((item) => item.transcript).length,
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
