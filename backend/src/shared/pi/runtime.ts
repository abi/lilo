import { getModel } from "@mariozechner/pi-ai";

export type ChatModelProvider = "openai" | "anthropic";
export type ChatModelId = "gpt-5.4" | "claude-opus-4-7";

export interface ChatModelSelection {
  provider: ChatModelProvider;
  modelId: ChatModelId;
}

export const CHAT_MODEL_OPTIONS: ChatModelSelection[] = [
  { provider: "anthropic", modelId: "claude-opus-4-7" },
  { provider: "openai", modelId: "gpt-5.4" },
];

const PROMPT_TIMEOUT_MS = 600000;
const PROMPT_FIRST_EVENT_TIMEOUT_MS = 30000;

export const getPromptTimeoutMs = (): number => PROMPT_TIMEOUT_MS;

export const getPromptFirstEventTimeoutMs = (): number =>
  PROMPT_FIRST_EVENT_TIMEOUT_MS;

export const isSupportedChatModelSelection = (
  value: unknown,
): value is ChatModelSelection => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const provider = "provider" in value ? value.provider : undefined;
  const modelId = "modelId" in value ? value.modelId : undefined;

  return CHAT_MODEL_OPTIONS.some(
    (option) => option.provider === provider && option.modelId === modelId,
  );
};

export const getDefaultChatModelSelection = (): ChatModelSelection => {
  return CHAT_MODEL_OPTIONS[0];
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
