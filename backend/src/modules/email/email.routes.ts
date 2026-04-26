import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { marked } from "marked";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { UploadedChatFile } from "../chat/chat.request.js";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { readCsvEnv, readEnv } from "../../shared/config/env.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { ASK_USER_QUESTION_TOOL_NAME } from "../../shared/tools/askUserQuestionTool.js";
import {
  resolveEmailChatId,
  resolveEmailThreadRootMessageId,
  storeEmailChatId,
} from "./threadStore.js";

/**
 * Email forwarding via Resend.
 *
 * Env vars:
 *   RESEND_API_KEY  — Resend API key (required)
 *   LILO_EMAIL_AGENT_ADDRESS — Exact inbound email address the bot should receive mail at (e.g. "hi@yourdomain.com")
 *   LILO_EMAIL_REPLY_FROM — Outbound reply sender identity (e.g. "Lilo <lilo@yourdomain.com>")
 *   RESEND_WEBHOOK_SECRET — Resend webhook signing secret (required)
 *   LILO_EMAIL_ALLOWED_SENDERS — Comma-separated exact sender/recipient email allowlist for inbound and outbound email processing (required)
 *
 * Setup:
 *   1. Add a receiving domain in Resend (you get a *.resend.app address)
 *   2. Create a webhook pointing to https://your-lilo/api/inbound-email
 *      with the "email.received" event enabled
 *   3. Set RESEND_API_KEY, RESEND_WEBHOOK_SECRET, LILO_EMAIL_AGENT_ADDRESS, and LILO_EMAIL_REPLY_FROM env vars on your Lilo backend
 */

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const MAX_EMAIL_ATTACHMENTS = 24;
const MAX_EMAIL_ATTACHMENT_BYTES = 40 * 1024 * 1024;

const getResendApiKey = (): string | null =>
  process.env.RESEND_API_KEY?.trim() || null;

const getResendWebhookSecret = (): string | null =>
  process.env.RESEND_WEBHOOK_SECRET?.trim() || null;

const getLiloEmailTo = (): string | null =>
  readEnv("LILO_EMAIL_AGENT_ADDRESS");

const getLiloEmailFrom = (): string | null =>
  readEnv("LILO_EMAIL_REPLY_FROM");

const getLiloPublicAppUrl = (): string | null =>
  readEnv("LILO_PUBLIC_APP_URL");

const getAllowedEmails = (): string[] => {
  const allowedEmails = readCsvEnv("LILO_EMAIL_ALLOWED_SENDERS").map((entry) =>
    entry.toLowerCase(),
  );
  if (allowedEmails.length === 0) {
    throw new Error("LILO_EMAIL_ALLOWED_SENDERS is not configured");
  }

  return allowedEmails;
};

const parseEmailAddress = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const angleMatch = trimmed.match(/<([^>]+)>/);
  const email = (angleMatch?.[1] ?? trimmed).trim().toLowerCase();
  return email.includes("@") ? email : null;
};

const matchesEmailAllowlist = (values: string[], allowedEmails: string[]): boolean => {
  if (allowedEmails.length === 0) {
    return true;
  }

  return values.some((value) => {
    const email = parseEmailAddress(value);
    if (!email) {
      return false;
    }

    return allowedEmails.includes(email);
  });
};

const secureCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyResendWebhook = (rawBody: string, headers: Headers): boolean => {
  const secret = getResendWebhookSecret();
  if (!secret) {
    throw new Error("RESEND_WEBHOOK_SECRET is not configured");
  }

  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) {
    return false;
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const secretKey = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expectedSignature = createHmac(
    "sha256",
    Buffer.from(secretKey, "base64"),
  )
    .update(signedContent)
    .digest("base64");

  const signatures = signatureHeader
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice("v1,".length));

  return signatures.some((signature) => secureCompare(signature, expectedSignature));
};

const isAllowedInboundEmail = (from: string, to: string[]): boolean => {
  const allowedEmails = getAllowedEmails();
  const liloEmailTo = getLiloEmailTo();
  const expectedRecipient = liloEmailTo ? parseEmailAddress(liloEmailTo) : null;

  if (!matchesEmailAllowlist([from], allowedEmails)) {
    return false;
  }

  if (!expectedRecipient) {
    return true;
  }

  return to.some((value) => parseEmailAddress(value) === expectedRecipient);
};

const isAllowedOutboundRecipient = (to: string): boolean => {
  const allowedEmails = getAllowedEmails();
  return matchesEmailAllowlist([to], allowedEmails);
};

const resendFetch = async (path: string, options?: RequestInit): Promise<Response> => {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  return fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options?.headers,
    },
  });
};

type ReceivedEmailContent = {
  text: string;
  html: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
};

type ReceivedEmailAttachment = {
  id: string;
  filename: string;
  size: number | null;
  contentType: string;
  downloadUrl: string;
};

type AskUserQuestionDetails = {
  question: string;
  options: string[];
  allowSkip: boolean;
};

const normalizeHeaderValue = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join(" ");
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const buildReplyHeaders = (
  messageId: string | null,
  references: string | null,
): Record<string, string> | undefined => {
  if (!messageId) {
    return undefined;
  }

  const headers: Record<string, string> = {
    "In-Reply-To": messageId,
  };

  const referenceValues = Array.from(
    new Set(
      [references, messageId]
        .flatMap((value) => value?.trim().split(/\s+/) ?? [])
        .filter((value) => value.length > 0),
    ),
  )
    .join(" ")
    .trim();

  if (referenceValues.length > 0) {
    headers.References = referenceValues;
  }

  return headers;
};

const isImageMimeType = (value: string): boolean =>
  value.trim().toLowerCase().startsWith("image/");

const getAttachmentName = (attachment: ReceivedEmailAttachment, index: number): string =>
  attachment.filename.trim() || `email-attachment-${index + 1}`;

const buildChatPermalink = (chatId: string): string | null => {
  const baseUrl = getLiloPublicAppUrl();
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("chat", chatId);
    return url.toString();
  } catch {
    console.warn("[email] Ignoring invalid LILO_PUBLIC_APP_URL", { baseUrl });
    return null;
  }
};

const appendChatPermalink = (body: string, chatId: string): string => {
  const permalink = buildChatPermalink(chatId);
  if (!permalink) {
    return body;
  }

  return `${body.trim()}\n\n---\nOpen this chat in Lilo:\n${permalink}`;
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

const formatEmailQuestionFallback = (details: AskUserQuestionDetails): string => {
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

/** Fetch the full email content (body + headers) from Resend's receiving API. */
const fetchEmailContent = async (
  emailId: string,
): Promise<ReceivedEmailContent> => {
  const response = await resendFetch(`/emails/receiving/${emailId}`);
  if (!response.ok) {
    throw new Error(
      `Resend receiving API error ${response.status}: ${await response.text()}`,
    );
  }

  const data = (await response.json()) as {
    text?: string | null;
    html?: string | null;
    headers?: Record<string, unknown>;
    message_id?: string | null;
  };
  return {
    text: data.text ?? "",
    html: data.html ?? "",
    messageId: data.message_id ?? null,
    inReplyTo: normalizeHeaderValue(data.headers?.["in-reply-to"] ?? data.headers?.["In-Reply-To"]),
    references: normalizeHeaderValue(data.headers?.references ?? data.headers?.References),
  };
};

const fetchEmailAttachmentList = async (
  emailId: string,
): Promise<ReceivedEmailAttachment[]> => {
  const response = await resendFetch(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=${MAX_EMAIL_ATTACHMENTS}`,
  );
  if (!response.ok) {
    throw new Error(
      `Resend attachment list API error ${response.status}: ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: unknown;
      filename?: unknown;
      size?: unknown;
      content_type?: unknown;
      download_url?: unknown;
    }>;
  };

  return (payload.data ?? [])
    .map((attachment) => ({
      id: typeof attachment.id === "string" ? attachment.id : "",
      filename: typeof attachment.filename === "string" ? attachment.filename : "",
      size: typeof attachment.size === "number" ? attachment.size : null,
      contentType:
        typeof attachment.content_type === "string"
          ? attachment.content_type
          : "application/octet-stream",
      downloadUrl: typeof attachment.download_url === "string" ? attachment.download_url : "",
    }))
    .filter((attachment) => attachment.id && attachment.downloadUrl);
};

const loadEmailAttachments = async (emailId: string): Promise<UploadedChatFile[]> => {
  const attachments = await fetchEmailAttachmentList(emailId);
  const uploads: UploadedChatFile[] = [];

  for (const [index, attachment] of attachments.entries()) {
    try {
      if (attachment.size !== null && attachment.size > MAX_EMAIL_ATTACHMENT_BYTES) {
        console.warn("[email] skipping oversized attachment", {
          emailId,
          attachmentId: attachment.id,
          filename: attachment.filename,
          size: attachment.size,
          maxSize: MAX_EMAIL_ATTACHMENT_BYTES,
        });
        continue;
      }

      const response = await fetch(attachment.downloadUrl);
      if (!response.ok) {
        console.warn("[email] failed to download attachment", {
          emailId,
          attachmentId: attachment.id,
          filename: attachment.filename,
          status: response.status,
        });
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_EMAIL_ATTACHMENT_BYTES) {
        console.warn("[email] skipping oversized downloaded attachment", {
          emailId,
          attachmentId: attachment.id,
          filename: attachment.filename,
          size: arrayBuffer.byteLength,
          maxSize: MAX_EMAIL_ATTACHMENT_BYTES,
        });
        continue;
      }

      const data = Buffer.from(arrayBuffer).toString("base64");
      const image: ImageContent | undefined = isImageMimeType(attachment.contentType)
        ? {
            type: "image",
            mimeType: attachment.contentType,
            data,
          }
        : undefined;

      uploads.push({
        originalName: getAttachmentName(attachment, index),
        mimeType: attachment.contentType,
        size: arrayBuffer.byteLength,
        bytes: new Uint8Array(arrayBuffer),
        image,
      });
    } catch (error) {
      console.warn("[email] failed to process attachment", {
        emailId,
        attachmentId: attachment.id,
        filename: attachment.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return uploads;
};

/** Send a reply via Resend's send API. */
const sendReply = async (
  to: string,
  subject: string,
  body: string,
  options: { messageId?: string | null; references?: string | null } = {},
): Promise<void> => {
  const from = getLiloEmailFrom();
  if (!from) {
    console.warn("[email] LILO_EMAIL_REPLY_FROM not set, skipping reply");
    return;
  }

  if (!isAllowedOutboundRecipient(to)) {
    captureBackendException(new Error("Outbound email rejected by allowlist policy"), {
      tags: {
        area: "email",
        provider: "resend",
        operation: "reject_outbound",
      },
      extras: {
        to,
        from,
        subject,
      },
      level: "error",
      fingerprint: ["email", "resend", "reject_outbound", "allowlist"],
    });
    console.warn("[email] Rejected outbound email due to allowlist policy", {
      to,
      from,
      subject,
    });
    return;
  }

  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;

  const html = await marked(body);

  // Route replies back to the inbound mailbox so that when the recipient
  // replies to the bot's message, Resend's webhook picks it up again. If
  // `LILO_EMAIL_AGENT_ADDRESS` isn't set we fall back to the `from` identity.
  const replyTo = getLiloEmailTo() ?? undefined;
  const replyHeaders = buildReplyHeaders(
    options.messageId ?? null,
    options.references ?? null,
  );

  const response = await resendFetch("/emails", {
    method: "POST",
    body: JSON.stringify({
      from,
      to,
      subject: replySubject,
      html,
      text: body,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(replyHeaders ? { headers: replyHeaders } : {}),
    }),
  });

  if (!response.ok) {
    console.error(
      `[email] Resend send error ${response.status}: ${await response.text()}`,
    );
  }
};

export const registerEmailRoutes = (
  app: Hono,
  chatService: PiSdkChatService,
): void => {
  // Resend webhook endpoint for the "email.received" event.
  // Creates a chat, prompts the agent, and replies to the sender.
  app.post("/api/inbound-email", async (c) => {
    let payload: {
      type?: string;
      data?: {
        email_id?: string;
        message_id?: string;
        from?: string;
        to?: string[];
        subject?: string;
      };
    };
    let rawBody = "";

    try {
      rawBody = await c.req.text();
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    try {
      if (!verifyResendWebhook(rawBody, c.req.raw.headers)) {
        return c.json({ error: "Invalid webhook signature" }, 401);
      }
    } catch (error) {
      console.error(
        "[email] Webhook verification failed:",
        error instanceof Error ? error.message : String(error),
      );
      return c.json({ error: "Webhook verification failed" }, 500);
    }

    if (payload.type !== "email.received" || !payload.data?.email_id) {
      return c.json({ error: "Expected email.received event with data.email_id" }, 400);
    }

    const {
      email_id,
      message_id,
      from,
      to = [],
      subject = "(no subject)",
    } = payload.data;
    if (!from) {
      return c.json({ error: "data.from is required" }, 400);
    }
    if (!Array.isArray(to) || to.length === 0) {
      return c.json({ error: "data.to must be a non-empty array" }, 400);
    }

    let inboundAllowed = false;
    try {
      inboundAllowed = isAllowedInboundEmail(from, to);
    } catch (error) {
      captureBackendException(error, {
        tags: {
          area: "email",
          provider: "resend",
          operation: "allowlist_config_error",
        },
        extras: {
          from,
          to,
          emailId: email_id,
          subject,
        },
        level: "error",
        fingerprint: ["email", "resend", "allowlist_config_error"],
      });
      console.error(
        "[email] Allowlist configuration error:",
        error instanceof Error ? error.message : String(error),
      );
      return c.json({ error: "Email allowlist is not configured" }, 500);
    }

    if (!inboundAllowed) {
      captureBackendException(new Error("Inbound email rejected by allowlist policy"), {
        tags: {
          area: "email",
          provider: "resend",
          operation: "reject_inbound",
        },
        extras: {
          from,
          to,
          emailId: email_id,
          subject,
        },
        level: "warning",
        fingerprint: ["email", "resend", "reject_inbound", "allowlist"],
      });
      console.warn("[email] Rejected inbound email due to allowlist policy", {
        from,
        to,
        emailId: email_id,
      });
      return c.json({ status: "ignored" }, 202);
    }

    // Respond immediately so Resend doesn't time out, then process in background.
    const processEmail = async () => {
      try {
        const content = await fetchEmailContent(email_id!);
        const emailBody = content.text || content.html || "";

        const promptMessage = [
          `Channel: email`,
          `From: ${from}`,
          `Subject: ${subject}`,
          ``,
          emailBody,
        ].join("\n");

        const threadRootMessageId = resolveEmailThreadRootMessageId(
          message_id ?? content.messageId,
          content.references,
          content.inReplyTo,
        );
        const existingChatId = threadRootMessageId
          ? await resolveEmailChatId(threadRootMessageId)
          : null;
        const chatId =
          existingChatId && (await chatService.hasChat(existingChatId))
            ? existingChatId
            : (await chatService.createChat()).id;
        if (threadRootMessageId) {
          await storeEmailChatId(threadRootMessageId, chatId);
        }

        const emailAttachments = await loadEmailAttachments(email_id!);
        const resolvedUploads = emailAttachments.length > 0
          ? await chatService.resolveUploads(
              chatId,
              await chatService.storeUploads(chatId, emailAttachments),
            )
          : { images: [], attachments: [] };
        let responseParagraphs: string[] = [];
        let activeAssistantParagraphIndex: number | null = null;

        const appendResponseText = (delta: string) => {
          if (delta.length === 0) {
            return;
          }

          if (activeAssistantParagraphIndex === null) {
            responseParagraphs.push("");
            activeAssistantParagraphIndex = responseParagraphs.length - 1;
          }

          responseParagraphs[activeAssistantParagraphIndex] += delta;
        };

        const responseText = () =>
          responseParagraphs
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .join("\n\n");

        await chatService.promptChat(
          chatId,
          {
            message: promptMessage,
            images: resolvedUploads.images,
            attachments: resolvedUploads.attachments,
            context: {},
          },
          (event: SseEvent) => {
            if (event.event === "assistant_message_start") {
              activeAssistantParagraphIndex = null;
            }

            if (event.event === "assistant_text_start" && activeAssistantParagraphIndex === null) {
              responseParagraphs.push("");
              activeAssistantParagraphIndex = responseParagraphs.length - 1;
            }

            if (event.event === "text_delta") {
              const delta = (event.data as { delta?: string }).delta ?? "";
              appendResponseText(delta);
            }

            if (event.event === "assistant_text_end" || event.event === "assistant_message_end") {
              activeAssistantParagraphIndex = null;
            }

            if (event.event === "tool_result") {
              const toolName = (event.data as { toolName?: unknown }).toolName;
              if (toolName !== ASK_USER_QUESTION_TOOL_NAME) {
                return;
              }

              const details = getAskUserQuestionDetails(
                (event.data as { details?: unknown }).details,
              );
              if (details) {
                responseParagraphs = [formatEmailQuestionFallback(details)];
                activeAssistantParagraphIndex = null;
              }
            }
          },
        );

        const emailResponseText = responseText();
        if (emailResponseText.length > 0) {
          await sendReply(from, subject, appendChatPermalink(emailResponseText, chatId), {
            messageId: message_id ?? content.messageId,
            references: content.references,
          });
          console.log(`[email] Replied to ${from} re: "${subject}" (chat ${chatId})`);
        }
      } catch (error) {
        console.error("[email] Failed to process inbound email:", error);
      }
    };

    void processEmail();

    return c.json({ status: "accepted" }, 200);
  });
};
