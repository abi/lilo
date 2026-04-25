import type { Hono } from "hono";
import { readCsvEnv, readEnv } from "../../shared/config/env.js";

type ChannelState = "configured" | "partial" | "missing";

interface ChannelDetail {
  label: string;
  value: string;
  kind?: "secret" | "value" | "list" | "url";
}

interface ChannelStatus {
  id: "email" | "telegram" | "whatsapp";
  label: string;
  provider: string;
  configured: boolean;
  state: ChannelState;
  missing: string[];
  details: ChannelDetail[];
}

interface EnvSpec {
  name: string;
}

const env = (name: string): EnvSpec => ({
  name,
});

const getEnv = (spec: EnvSpec): string | null => readEnv(spec.name);

const parseCsvEnv = (spec: EnvSpec): string[] => readCsvEnv(spec.name);

const stateFromMissing = (missing: string[], totalRequired: number): ChannelState => {
  if (missing.length === 0) {
    return "configured";
  }

  return missing.length === totalRequired ? "missing" : "partial";
};

const secretStatus = (spec: EnvSpec): string => (getEnv(spec) ? "Set" : "Missing");

const valueStatus = (value: string | null): string => value ?? "Missing";

const listStatus = (values: string[]): string =>
  values.length > 0 ? values.join(", ") : "Missing";

const buildChannelStatus = (
  input: Omit<ChannelStatus, "configured" | "state" | "missing"> & {
    requiredEnv: EnvSpec[];
  },
): ChannelStatus => {
  const missing = input.requiredEnv
    .filter((spec) => !getEnv(spec))
    .map((spec) => spec.name);
  const state = stateFromMissing(missing, input.requiredEnv.length);

  return {
    id: input.id,
    label: input.label,
    provider: input.provider,
    configured: missing.length === 0,
    state,
    missing,
    details: input.details,
  };
};

const getChannelStatuses = (): ChannelStatus[] => {
  const resendApiKey = env("RESEND_API_KEY");
  const resendWebhookSecret = env("RESEND_WEBHOOK_SECRET");
  const emailAgentAddress = env("LILO_EMAIL_AGENT_ADDRESS");
  const emailReplyFrom = env("LILO_EMAIL_REPLY_FROM");
  const emailAllowedSenders = env("LILO_EMAIL_ALLOWED_SENDERS");
  const telegramBotToken = env("TELEGRAM_BOT_TOKEN");
  const twilioAccountSid = env("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = env("TWILIO_AUTH_TOKEN");
  const whatsAppAgentNumber = env("LILO_WHATSAPP_AGENT_NUMBER");
  const whatsAppAllowedSenders = env("LILO_WHATSAPP_ALLOWED_SENDERS");
  const allowedEmails = parseCsvEnv(emailAllowedSenders);

  return [
    buildChannelStatus({
      id: "email",
      label: "Email",
      provider: "Resend",
      requiredEnv: [
        resendApiKey,
        resendWebhookSecret,
        emailAgentAddress,
        emailReplyFrom,
        emailAllowedSenders,
      ],
      details: [
        { label: "API key", value: secretStatus(resendApiKey), kind: "secret" },
        {
          label: "Webhook secret",
          value: secretStatus(resendWebhookSecret),
          kind: "secret",
        },
        { label: "Agent address", value: valueStatus(getEnv(emailAgentAddress)) },
        { label: "Reply sender", value: valueStatus(getEnv(emailReplyFrom)) },
        { label: "Allowed emails", value: listStatus(allowedEmails), kind: "list" },
      ],
    }),
    buildChannelStatus({
      id: "telegram",
      label: "Telegram",
      provider: "Telegram Bot API",
      requiredEnv: [telegramBotToken],
      details: [
        { label: "Bot token", value: secretStatus(telegramBotToken), kind: "secret" },
      ],
    }),
    buildChannelStatus({
      id: "whatsapp",
      label: "WhatsApp",
      provider: "Twilio",
      requiredEnv: [
        twilioAccountSid,
        twilioAuthToken,
        whatsAppAgentNumber,
        whatsAppAllowedSenders,
      ],
      details: [
        {
          label: "Account SID",
          value: secretStatus(twilioAccountSid),
          kind: "secret",
        },
        { label: "Auth token", value: secretStatus(twilioAuthToken), kind: "secret" },
        {
          label: "Agent number",
          value: valueStatus(getEnv(whatsAppAgentNumber)),
        },
        { label: "Allowed senders", value: valueStatus(getEnv(whatsAppAllowedSenders)) },
      ],
    }),
  ];
};

export const registerChannelStatusRoutes = (app: Hono): void => {
  app.get("/api/channels/status", (c) =>
    c.json({
      channels: getChannelStatuses(),
    }),
  );
};
