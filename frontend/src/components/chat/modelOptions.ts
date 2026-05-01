import type { ChatModelId, ChatModelProvider } from "../../store/chatStore";

export type ChatModelOption = {
  label: string;
  provider: ChatModelProvider;
  modelId: ChatModelId;
  routingProvider?: ChatModelProvider;
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
    label: "GPT 5.4 Mini",
    provider: "openrouter",
    modelId: "openai/gpt-5.4-mini",
    routingProvider: "openrouter",
  },
  {
    label: "Opus 4.7",
    provider: "anthropic",
    modelId: "claude-opus-4-7",
  },
  {
    label: "Opus 4.7",
    provider: "openrouter",
    modelId: "anthropic/claude-opus-4.7",
    routingProvider: "openrouter",
  },
  {
    label: "Kimi K2.6",
    provider: "openrouter",
    modelId: "moonshotai/kimi-k2.6",
    routingProvider: "openrouter",
  },
];

export const toChatModelOption = (
  model: Pick<ChatModelOption, "provider" | "modelId"> & {
    routingProvider?: ChatModelProvider;
  },
): ChatModelOption => {
  const routingProvider = model.routingProvider ?? model.provider;
  const knownOption = ALL_CHAT_MODEL_OPTIONS.find(
    (option) => option.provider === model.provider && option.modelId === model.modelId,
  );

  return (
    knownOption
      ? { ...knownOption, routingProvider }
      : {
          label: model.modelId,
          provider: model.provider,
          modelId: model.modelId,
          routingProvider,
        }
  );
};

export const getChatModelProviderLabel = (provider: ChatModelProvider): string => {
  if (provider === "openai") {
    return "OpenAI";
  }

  if (provider === "anthropic") {
    return "Anthropic";
  }

  return "OpenRouter";
};

export const getChatModelRouteLabel = (option: ChatModelOption): string =>
  getChatModelProviderLabel(option.routingProvider ?? option.provider);
