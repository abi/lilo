import type { Hono } from "hono";
import { backendConfig } from "../../shared/config/config.js";

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

interface ConfigSpec {
  name: string;
  value: string | null;
}

const configValue = (name: string, value: string | null): ConfigSpec => ({
  name,
  value,
});

const stateFromMissing = (missing: string[], totalRequired: number): ChannelState => {
  if (missing.length === 0) {
    return "configured";
  }

  return missing.length === totalRequired ? "missing" : "partial";
};

const secretStatus = (spec: ConfigSpec): string => (spec.value ? "Set" : "Missing");

const valueStatus = (value: string | null): string => value ?? "Missing";

const listStatus = (values: string[]): string =>
  values.length > 0 ? values.join(", ") : "Missing";

const buildChannelStatus = (
  input: Omit<ChannelStatus, "configured" | "state" | "missing"> & {
    requiredConfig: ConfigSpec[];
  },
): ChannelStatus => {
  const missing = input.requiredConfig
    .filter((spec) => !spec.value)
    .map((spec) => spec.name);
  const state = stateFromMissing(missing, input.requiredConfig.length);

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
  const emailConfig = backendConfig.channels.email;
  const telegramConfig = backendConfig.channels.telegram;
  const whatsappConfig = backendConfig.channels.whatsapp;
  const resendApiKey = configValue("RESEND_API_KEY", emailConfig.resendApiKey);
  const resendWebhookSecret = configValue(
    "RESEND_WEBHOOK_SECRET",
    emailConfig.resendWebhookSecret,
  );
  const emailAgentAddress = configValue(
    "LILO_EMAIL_AGENT_ADDRESS",
    emailConfig.agentAddress,
  );
  const emailReplyFrom = configValue("LILO_EMAIL_REPLY_FROM", emailConfig.replyFrom);
  const emailAllowedSenders = configValue(
    "LILO_EMAIL_ALLOWED_SENDERS",
    emailConfig.allowedSenders.length > 0 ? emailConfig.allowedSenders.join(",") : null,
  );
  const telegramBotToken = configValue("TELEGRAM_BOT_TOKEN", telegramConfig.botToken);
  const twilioAccountSid = configValue(
    "TWILIO_ACCOUNT_SID",
    whatsappConfig.twilioAccountSid,
  );
  const twilioAuthToken = configValue(
    "TWILIO_AUTH_TOKEN",
    whatsappConfig.twilioAuthToken,
  );
  const whatsAppAgentNumber = configValue(
    "LILO_WHATSAPP_AGENT_NUMBER",
    whatsappConfig.agentNumber,
  );
  const whatsAppAllowedSenders = configValue(
    "LILO_WHATSAPP_ALLOWED_SENDERS",
    whatsappConfig.allowedSenders.length > 0
      ? whatsappConfig.allowedSenders.join(",")
      : null,
  );
  const telegramWebhookSecret = configValue(
    "TELEGRAM_WEBHOOK_SECRET",
    telegramConfig.webhookSecret,
  );
  const telegramAllowedUserIds = configValue(
    "LILO_TELEGRAM_ALLOWED_USER_IDS",
    telegramConfig.allowedUserIds.length > 0
      ? telegramConfig.allowedUserIds.join(",")
      : null,
  );

  return [
    buildChannelStatus({
      id: "email",
      label: "Email",
      provider: "Resend",
      requiredConfig: [
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
        { label: "Agent address", value: valueStatus(emailAgentAddress.value) },
        { label: "Reply sender", value: valueStatus(emailReplyFrom.value) },
        { label: "Allowed emails", value: listStatus(emailConfig.allowedSenders), kind: "list" },
      ],
    }),
    buildChannelStatus({
      id: "telegram",
      label: "Telegram",
      provider: "Telegram Bot API",
      requiredConfig: [telegramBotToken, telegramWebhookSecret, telegramAllowedUserIds],
      details: [
        { label: "Bot token", value: secretStatus(telegramBotToken), kind: "secret" },
        {
          label: "Webhook secret",
          value: secretStatus(telegramWebhookSecret),
          kind: "secret",
        },
        {
          label: "Allowed user IDs",
          value: listStatus(telegramConfig.allowedUserIds),
          kind: "list",
        },
      ],
    }),
    buildChannelStatus({
      id: "whatsapp",
      label: "WhatsApp",
      provider: "Twilio",
      requiredConfig: [
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
          value: valueStatus(whatsAppAgentNumber.value),
        },
        { label: "Allowed senders", value: valueStatus(whatsAppAllowedSenders.value) },
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
