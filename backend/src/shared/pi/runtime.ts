import { getModel } from "@mariozechner/pi-ai";
import { backendConfig } from "../config/config.js";

export type ChatModelProvider = "openai" | "anthropic" | "openrouter";
export type ChatModelId =
  | "gpt-5.5"
  | "gpt-5.4-mini"
  | "claude-opus-4-7"
  | "openai/gpt-5.5"
  | "openai/gpt-5.4-mini"
  | "anthropic/claude-opus-4.7"
  | "moonshotai/kimi-k2.6";

export interface ChatModelSelection {
  provider: ChatModelProvider;
  modelId: ChatModelId;
}

export interface ChatModelOption extends ChatModelSelection {
  routingProvider: ChatModelProvider;
}

interface ChatModelRouteOption extends ChatModelOption {
  nativeProvider?: Exclude<ChatModelProvider, "openrouter">;
  allowlistIds: string[];
}

const NATIVE_CHAT_MODEL_OPTIONS: ChatModelRouteOption[] = [
  {
    provider: "anthropic",
    modelId: "claude-opus-4-7",
    routingProvider: "anthropic",
    nativeProvider: "anthropic",
    allowlistIds: ["claude-opus-4-7"],
  },
  {
    provider: "openai",
    modelId: "gpt-5.5",
    routingProvider: "openai",
    nativeProvider: "openai",
    allowlistIds: ["gpt-5.5"],
  },
  {
    provider: "openai",
    modelId: "gpt-5.4-mini",
    routingProvider: "openai",
    nativeProvider: "openai",
    allowlistIds: ["gpt-5.4-mini"],
  },
];

const OPENROUTER_CHAT_MODEL_OPTIONS: ChatModelRouteOption[] = [
  {
    provider: "openrouter",
    modelId: "anthropic/claude-opus-4.7",
    routingProvider: "openrouter",
    nativeProvider: "anthropic",
    allowlistIds: ["claude-opus-4-7", "anthropic/claude-opus-4.7"],
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-5.5",
    routingProvider: "openrouter",
    nativeProvider: "openai",
    allowlistIds: ["gpt-5.5", "openai/gpt-5.5"],
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-5.4-mini",
    routingProvider: "openrouter",
    nativeProvider: "openai",
    allowlistIds: ["gpt-5.4-mini", "openai/gpt-5.4-mini"],
  },
  {
    provider: "openrouter",
    modelId: "moonshotai/kimi-k2.6",
    routingProvider: "openrouter",
    allowlistIds: ["moonshotai/kimi-k2.6"],
  },
];

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  ...NATIVE_CHAT_MODEL_OPTIONS,
  ...OPENROUTER_CHAT_MODEL_OPTIONS,
];

const PROMPT_TIMEOUT_MS = 600000;
const PROMPT_FIRST_EVENT_TIMEOUT_MS = 30000;
const OPENROUTER_ATTRIBUTION_HEADERS = {
  "HTTP-Referer": "https://github.com/abi/lilo",
  "X-OpenRouter-Title": "Lilo",
  "X-OpenRouter-Categories": "personal-agent,cloud-agent",
} as const;

export const getPromptTimeoutMs = (): number => PROMPT_TIMEOUT_MS;

export const getPromptFirstEventTimeoutMs = (): number =>
  PROMPT_FIRST_EVENT_TIMEOUT_MS;

const getChatModelAllowlist = (): Set<string> | null => {
  const values = backendConfig.chat.modelAllowlist
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return values.length > 0 ? new Set(values) : null;
};

const hasNativeProviderKey = (
  provider: Exclude<ChatModelProvider, "openrouter">,
): boolean => {
  if (provider === "openai") {
    return Boolean(backendConfig.chat.openaiApiKey);
  }

  return Boolean(backendConfig.chat.anthropicApiKey);
};

const getRoutableChatModelOptions = (): ChatModelRouteOption[] => {
  const hasOpenRouterKey = Boolean(backendConfig.chat.openrouterApiKey);

  if (!hasOpenRouterKey) {
    return NATIVE_CHAT_MODEL_OPTIONS;
  }

  const options: ChatModelRouteOption[] = [];

  for (const nativeOption of NATIVE_CHAT_MODEL_OPTIONS) {
    if (
      !nativeOption.nativeProvider
      || hasNativeProviderKey(nativeOption.nativeProvider)
    ) {
      options.push(nativeOption);
      continue;
    }

    const openrouterOption = OPENROUTER_CHAT_MODEL_OPTIONS.find(
      (option) =>
        option.nativeProvider === nativeOption.nativeProvider
        && option.allowlistIds.includes(nativeOption.modelId),
    );
    if (openrouterOption) {
      options.push(openrouterOption);
    }
  }

  options.push(
    ...OPENROUTER_CHAT_MODEL_OPTIONS.filter((option) => !option.nativeProvider),
  );

  return options;
};

const getAllowlistValues = (option: ChatModelRouteOption): string[] => [
  option.modelId,
  `${option.provider}/${option.modelId}`,
  ...option.allowlistIds,
];

const toPublicChatModelOption = (option: ChatModelRouteOption): ChatModelOption => ({
  provider: option.provider,
  modelId: option.modelId,
  routingProvider: option.routingProvider,
});

export const getAllowedChatModelOptions = (): ChatModelOption[] => {
  const allowlist = getChatModelAllowlist();
  const configuredOptions = getRoutableChatModelOptions();

  if (!allowlist) {
    return configuredOptions.map(toPublicChatModelOption);
  }

  const allowedOptions = configuredOptions.filter((option) => {
    return getAllowlistValues(option).some((value) =>
      allowlist.has(value.toLowerCase()),
    );
  });

  if (allowedOptions.length === 0) {
    const openrouterHint = backendConfig.chat.openrouterApiKey
      ? ""
      : " OpenRouter models require OPENROUTER_API_KEY.";

    throw new Error(
      `LILO_CHAT_MODEL_ALLOWLIST does not include any configured supported models. Configured supported models: ${configuredOptions.map((option) => option.modelId).join(", ")}.${openrouterHint}`,
    );
  }

  return allowedOptions.map(toPublicChatModelOption);
};

export const isSupportedChatModelSelection = (
  value: unknown,
): value is ChatModelSelection => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const provider = "provider" in value ? value.provider : undefined;
  const modelId = "modelId" in value ? value.modelId : undefined;

  return getAllowedChatModelOptions().some(
    (option) => option.provider === provider && option.modelId === modelId,
  );
};

export const getDefaultChatModelSelection = (): ChatModelSelection => {
  return getAllowedChatModelOptions()[0];
};

export const resolvePiModel = (
  selection: Partial<ChatModelSelection> = {},
) => {
  const fallback = getDefaultChatModelSelection();
  const provider = selection.provider ?? fallback.provider;
  const modelId = selection.modelId ?? fallback.modelId;
  const model = getModel(provider, modelId as never);

  if (!model) {
    throw new Error(`Unable to resolve model "${provider}/${modelId}" from the Pi SDK`);
  }

  if (model.provider === "openrouter") {
    return {
      ...model,
      headers: {
        ...model.headers,
        ...OPENROUTER_ATTRIBUTION_HEADERS,
      },
    };
  }

  return model;
};
