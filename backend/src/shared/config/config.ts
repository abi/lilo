import { loadBackendEnv, readCsvEnv, readEnv } from "./env.js";

export type ImageGenerationModel =
  | "flux-2-klein-4b"
  | "nano-banana"
  | "nano-banana-2";

const FALLBACK_IMAGE_MODEL: ImageGenerationModel = "nano-banana";

loadBackendEnv();

const parseBooleanEnv = (value: string | null): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const readNumberEnv = (name: string, fallback: number): number => {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeImageModel = (value: string | null): ImageGenerationModel => {
  const normalized = value?.toLowerCase();

  if (normalized === "nano-banana-2") {
    return "nano-banana-2";
  }

  if (normalized === "nano-banana") {
    return "nano-banana";
  }

  if (normalized === "flux-2-klein-4b") {
    return "flux-2-klein-4b";
  }

  return FALLBACK_IMAGE_MODEL;
};

export const backendConfig = {
  server: {
    port: readNumberEnv("PORT", 8787),
    publicAppUrl: readEnv("LILO_PUBLIC_APP_URL"),
  },
  runtime: {
    nodeEnv: readEnv("NODE_ENV") ?? "development",
    shell: readEnv("SHELL") ?? "/bin/sh",
  },
  auth: {
    password: readEnv("LILO_AUTH_PASSWORD"),
    sessionSecret: readEnv("LILO_AUTH_SESSION_SECRET") ?? readEnv("LILO_AUTH_PASSWORD"),
  },
  workspace: {
    dir: readEnv("LILO_WORKSPACE_DIR"),
    gitUrl: readEnv("LILO_WORKSPACE_GIT_URL"),
  },
  sessions: {
    dir: readEnv("LILO_SESSIONS_DIR"),
  },
  chat: {
    modelAllowlist: readCsvEnv("LILO_CHAT_MODEL_ALLOWLIST"),
  },
  media: {
    imageModel: normalizeImageModel(readEnv("LILO_IMAGE_MODEL")),
  },
  channels: {
    email: {
      resendApiKey: readEnv("RESEND_API_KEY"),
      resendWebhookSecret: readEnv("RESEND_WEBHOOK_SECRET"),
      agentAddress: readEnv("LILO_EMAIL_AGENT_ADDRESS"),
      replyFrom: readEnv("LILO_EMAIL_REPLY_FROM"),
      allowedSenders: readCsvEnv("LILO_EMAIL_ALLOWED_SENDERS"),
    },
    telegram: {
      botToken: readEnv("TELEGRAM_BOT_TOKEN"),
    },
    whatsapp: {
      twilioAccountSid: readEnv("TWILIO_ACCOUNT_SID"),
      twilioAuthToken: readEnv("TWILIO_AUTH_TOKEN"),
      agentNumber: readEnv("LILO_WHATSAPP_AGENT_NUMBER"),
      allowedSenders: readCsvEnv("LILO_WHATSAPP_ALLOWED_SENDERS"),
    },
  },
  tools: {
    browserbase: {
      apiKey: readEnv("BROWSERBASE_API_KEY"),
      projectId: readEnv("BROWSERBASE_PROJECT_ID"),
    },
    firecrawl: {
      apiKey: readEnv("FIRECRAWL_API_KEY"),
    },
    replicate: {
      apiKey: readEnv("REPLICATE_API_KEY"),
    },
  },
  observability: {
    sentry: {
      enabled: parseBooleanEnv(readEnv("ENABLE_SENTRY")),
      dsn: readEnv("SENTRY_DSN"),
    },
  },
} as const;

export const requireConfigValue = (value: string | null, name: string): string => {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
};

export const getChildProcessEnv = (
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv => ({
  ...process.env,
  ...overrides,
});
