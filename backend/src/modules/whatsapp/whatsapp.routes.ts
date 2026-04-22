import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { readWorkspaceAppPrefs } from "../../shared/workspace/appPrefs.js";
import { resolveDailyWhatsAppChatId, storeDailyWhatsAppChatId } from "./threadStore.js";

const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
};

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
  const authToken = getRequiredEnv("TWILIO_AUTH_TOKEN");
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

const getAllowedWhatsAppFrom = (): string =>
  normalizeWhatsAppAddress(getRequiredEnv("WHATSAPP_ALLOWED_FROM"));

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

const isSupportedInboundImageMimeType = (value: string): boolean =>
  /^(image\/jpeg|image\/jpg|image\/png|image\/webp)$/i.test(value.trim());

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

const sendWhatsAppReply = async (to: string, body: string): Promise<void> => {
  const accountSid = getRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = getRequiredEnv("TWILIO_AUTH_TOKEN");
  const from = normalizeWhatsAppAddress(getRequiredEnv("TWILIO_WHATSAPP_FROM_NUMBER"));

  const params = new URLSearchParams({
    To: normalizeWhatsAppAddress(to),
    From: from,
    Body: body,
  });

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

  if (!response.ok) {
    const responseText = await response.text();
    const error = new Error(`Twilio WhatsApp send failed with status ${response.status}`);

    captureBackendException(error, {
      tags: {
        area: "whatsapp",
        provider: "twilio",
        operation: "send_reply",
        to: normalizeWhatsAppAddress(to),
        from,
        status_code: response.status,
      },
      extras: {
        responseBody: responseText,
      },
      level: "error",
      fingerprint: ["whatsapp", "twilio", "send_reply", String(response.status)],
    });

    console.error(`[whatsapp] Twilio send error ${response.status}: ${responseText}`);
  }
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
  `WhatsApp message from user: ${body || "(empty message)"}`;

const loadInboundImages = async (form: TwilioWebhookBody): Promise<ImageContent[]> => {
  const accountSid = getRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = getRequiredEnv("TWILIO_AUTH_TOKEN");
  const numMedia = parseNumMedia(form.NumMedia);
  const images: ImageContent[] = [];

  for (let index = 0; index < numMedia; index += 1) {
    const mediaUrl = form[`MediaUrl${index}`];
    const mediaContentType = form[`MediaContentType${index}`];

    if (typeof mediaUrl !== "string" || typeof mediaContentType !== "string") {
      continue;
    }

    if (!isSupportedInboundImageMimeType(mediaContentType)) {
      console.log(
        `[whatsapp] ignoring unsupported inbound media type=${mediaContentType} url=${mediaUrl}`,
      );
      continue;
    }

    const response = await twilioFetch(accountSid, authToken, mediaUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download inbound media ${index} (${mediaContentType}): ${response.status}`,
      );
    }

    images.push({
      type: "image",
      mimeType: mediaContentType,
      data: Buffer.from(await response.arrayBuffer()).toString("base64"),
    });
  }

  return images;
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
      const allowedFrom = getAllowedWhatsAppFrom();
      if (from !== allowedFrom) {
        captureBackendException(new Error("Inbound WhatsApp rejected by sender allowlist"), {
          tags: {
            area: "whatsapp",
            provider: "twilio",
            operation: "reject_inbound_sender",
          },
          extras: {
            from,
            allowedFrom,
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
      try {
        const now = new Date();
        const timezone = await getWhatsAppThreadTimezone();
        const images = await loadInboundImages(form);

        let chatId = await resolveDailyWhatsAppChatId(from, now, timezone);
        if (!chatId || !(await chatService.hasChat(chatId))) {
          const chat = await chatService.createChat();
          chatId = chat.id;
          await storeDailyWhatsAppChatId(from, now, timezone, chatId);
          console.log(`[whatsapp] created chat=${chatId} from=${from} timezone=${timezone}`);
        }

        const currentChat = await chatService.getChat(chatId);
        if (currentChat?.status === "streaming") {
          console.log(`[whatsapp] steering active chat=${chatId} from=${from}`);
          await chatService.steerChat(chatId, {
            message: buildInboundWhatsAppPrompt(body),
            images,
            attachments: [],
            context: {},
          });
          return;
        }

        let responseText = "";
        let completionReason: string | null = null;
        await chatService.promptChat(
          chatId,
          {
            message: buildInboundWhatsAppPrompt(body),
            images,
            attachments: [],
            context: {},
          },
          (event: SseEvent) => {
            if (event.event === "text_delta") {
              const delta = (event.data as { delta?: string }).delta ?? "";
              responseText += delta;
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

        if (completionReason === "completed" && responseText.trim().length > 0) {
          await sendWhatsAppReply(from, responseText.trim());
          console.log(`[whatsapp] replied chat=${chatId} to=${from} mode=prompt`);
        } else {
          console.log(
            `[whatsapp] skipped reply chat=${chatId} to=${from} mode=prompt completionReason=${completionReason ?? "unknown"}`,
          );
        }
      } catch (error) {
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
      }
    };

    void processWhatsApp();

    c.header("Content-Type", "text/xml");
    return c.body(twimlOk, 200);
  });
};
