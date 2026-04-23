import type { Hono } from "hono";

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

const getEnv = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
};

const parseCsvEnv = (name: string): string[] =>
  (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const stateFromMissing = (missing: string[], totalRequired: number): ChannelState => {
  if (missing.length === 0) {
    return "configured";
  }

  return missing.length === totalRequired ? "missing" : "partial";
};

const secretStatus = (name: string): string => (getEnv(name) ? "Set" : "Missing");

const valueStatus = (value: string | null): string => value ?? "Missing";

const listStatus = (values: string[]): string =>
  values.length > 0 ? values.join(", ") : "Missing";

const buildChannelStatus = (
  input: Omit<ChannelStatus, "configured" | "state" | "missing"> & {
    requiredEnv: string[];
  },
): ChannelStatus => {
  const missing = input.requiredEnv.filter((name) => !getEnv(name));
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
  const allowedEmails = parseCsvEnv("EMAIL_ALLOWED_EMAILS");

  return [
    buildChannelStatus({
      id: "email",
      label: "Email",
      provider: "Resend",
      requiredEnv: [
        "RESEND_API_KEY",
        "RESEND_WEBHOOK_SECRET",
        "LILO_EMAIL_TO",
        "LILO_EMAIL_FROM",
        "EMAIL_ALLOWED_EMAILS",
      ],
      details: [
        { label: "API key", value: secretStatus("RESEND_API_KEY"), kind: "secret" },
        {
          label: "Webhook secret",
          value: secretStatus("RESEND_WEBHOOK_SECRET"),
          kind: "secret",
        },
        { label: "Agent address", value: valueStatus(getEnv("LILO_EMAIL_TO")) },
        { label: "Reply sender", value: valueStatus(getEnv("LILO_EMAIL_FROM")) },
        { label: "Allowed emails", value: listStatus(allowedEmails), kind: "list" },
      ],
    }),
    buildChannelStatus({
      id: "telegram",
      label: "Telegram",
      provider: "Telegram Bot API",
      requiredEnv: ["TELEGRAM_BOT_TOKEN"],
      details: [
        { label: "Bot token", value: secretStatus("TELEGRAM_BOT_TOKEN"), kind: "secret" },
      ],
    }),
    buildChannelStatus({
      id: "whatsapp",
      label: "WhatsApp",
      provider: "Twilio",
      requiredEnv: [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_WHATSAPP_FROM_NUMBER",
        "WHATSAPP_ALLOWED_FROM",
      ],
      details: [
        {
          label: "Account SID",
          value: secretStatus("TWILIO_ACCOUNT_SID"),
          kind: "secret",
        },
        { label: "Auth token", value: secretStatus("TWILIO_AUTH_TOKEN"), kind: "secret" },
        {
          label: "Agent number",
          value: valueStatus(getEnv("TWILIO_WHATSAPP_FROM_NUMBER")),
        },
        { label: "Allowed sender", value: valueStatus(getEnv("WHATSAPP_ALLOWED_FROM")) },
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
