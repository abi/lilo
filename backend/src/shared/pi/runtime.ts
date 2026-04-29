import { getModel } from "@mariozechner/pi-ai";
import { backendConfig } from "../config/config.js";

export type ChatModelProvider = "openai" | "anthropic";
export type ChatModelId = "gpt-5.5" | "gpt-5.4-mini" | "claude-opus-4-7";

export interface ChatModelSelection {
  provider: ChatModelProvider;
  modelId: ChatModelId;
}

export const CHAT_MODEL_OPTIONS: ChatModelSelection[] = [
  { provider: "anthropic", modelId: "claude-opus-4-7" },
  { provider: "openai", modelId: "gpt-5.5" },
  { provider: "openai", modelId: "gpt-5.4-mini" },
];

const PROMPT_TIMEOUT_MS = 600000;
const PROMPT_FIRST_EVENT_TIMEOUT_MS = 30000;

export const getPromptTimeoutMs = (): number => PROMPT_TIMEOUT_MS;

export const getPromptFirstEventTimeoutMs = (): number =>
  PROMPT_FIRST_EVENT_TIMEOUT_MS;

const getChatModelAllowlist = (): Set<string> | null => {
  const values = backendConfig.chat.modelAllowlist
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return values.length > 0 ? new Set(values) : null;
};

export const getAllowedChatModelOptions = (): ChatModelSelection[] => {
  const allowlist = getChatModelAllowlist();
  if (!allowlist) {
    return CHAT_MODEL_OPTIONS;
  }

  const allowedOptions = CHAT_MODEL_OPTIONS.filter((option) => {
    const providerModelId = `${option.provider}/${option.modelId}`;
    return allowlist.has(option.modelId) || allowlist.has(providerModelId);
  });

  if (allowedOptions.length === 0) {
    throw new Error(
      `LILO_CHAT_MODEL_ALLOWLIST does not include any supported models. Supported models: ${CHAT_MODEL_OPTIONS.map((option) => option.modelId).join(", ")}`,
    );
  }

  return allowedOptions;
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

  return model;
};
