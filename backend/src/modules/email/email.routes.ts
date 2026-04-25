import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { marked } from "marked";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { readCsvEnv, readEnv } from "../../shared/config/env.js";
import { captureBackendException } from "../../shared/observability/sentry.js";

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

const getResendApiKey = (): string | null =>
  process.env.RESEND_API_KEY?.trim() || null;

const getResendWebhookSecret = (): string | null =>
  process.env.RESEND_WEBHOOK_SECRET?.trim() || null;

const getLiloEmailTo = (): string | null =>
  readEnv("LILO_EMAIL_AGENT_ADDRESS");

const getLiloEmailFrom = (): string | null =>
  readEnv("LILO_EMAIL_REPLY_FROM");

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

/** Fetch the full email content (body + headers) from Resend's receiving API. */
const fetchEmailContent = async (
  emailId: string,
): Promise<{ text: string; html: string }> => {
  const response = await resendFetch(`/emails/receiving/${emailId}`);
  if (!response.ok) {
    throw new Error(
      `Resend receiving API error ${response.status}: ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { text?: string; html?: string };
  return { text: data.text ?? "", html: data.html ?? "" };
};

/** Send a reply via Resend's send API. */
const sendReply = async (
  to: string,
  subject: string,
  body: string,
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

  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  const html = await marked(body);

  // Route replies back to the inbound mailbox so that when the recipient
  // replies to the bot's message, Resend's webhook picks it up again. If
  // `LILO_EMAIL_AGENT_ADDRESS` isn't set we fall back to the `from` identity.
  const replyTo = getLiloEmailTo() ?? undefined;

  const response = await resendFetch("/emails", {
    method: "POST",
    body: JSON.stringify({
      from,
      to,
      subject: replySubject,
      html,
      text: body,
      ...(replyTo ? { reply_to: replyTo } : {}),
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

    const { email_id, from, to = [], subject = "(no subject)" } = payload.data;
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
          `From: ${from}`,
          `Subject: ${subject}`,
          ``,
          emailBody,
        ].join("\n");

        const chat = await chatService.createChat();
        let responseText = "";

        await chatService.promptChat(
          chat.id,
          { message: promptMessage, images: [], attachments: [], context: {} },
          (event: SseEvent) => {
            if (event.event === "text_delta") {
              const delta = (event.data as { delta?: string }).delta ?? "";
              responseText += delta;
            }
          },
        );

        if (responseText.trim().length > 0) {
          await sendReply(from, subject, responseText.trim());
          console.log(`[email] Replied to ${from} re: "${subject}" (chat ${chat.id})`);
        }
      } catch (error) {
        console.error("[email] Failed to process inbound email:", error);
      }
    };

    void processEmail();

    return c.json({ status: "accepted" }, 200);
  });
};
