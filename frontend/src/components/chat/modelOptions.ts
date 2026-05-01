import type { ChatModelId, ChatModelProvider } from "../../store/chatStore";

export type ChatModelOption = {
  label: string;
  provider: ChatModelProvider;
  modelId: ChatModelId;
};

export const ALL_CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    label: "GPT 5.5",
    provider: "openai",
    modelId: "gpt-5.5",
  },
  {
    label: "GPT 5.4 Mini",
    provider: "openai",
    modelId: "gpt-5.4-mini",
  },
  {
    label: "Opus 4.7",
    provider: "anthropic",
    modelId: "claude-opus-4-7",
  },
  {
    label: "Kimi K2.6",
    provider: "openrouter",
    modelId: "moonshotai/kimi-k2.6",
  },
];

export const toChatModelOption = (
  model: Pick<ChatModelOption, "provider" | "modelId">,
): ChatModelOption => {
  return (
    ALL_CHAT_MODEL_OPTIONS.find(
      (option) => option.provider === model.provider && option.modelId === model.modelId,
    ) ?? {
      label: model.modelId,
      provider: model.provider,
      modelId: model.modelId,
    }
  );
};
