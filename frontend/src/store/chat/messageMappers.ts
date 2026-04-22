import type {
  ChatMessage,
  ChatMessageRole,
  ChatSessionState,
  ChatStoreState,
  ChatSummary,
} from "./types";

const normalizeTitle = (value: string): string =>
  value
    .replace(/\s*<additional_context>[\s\S]*?<\/additional_context>/g, "")
    .replace(/\s*\[Currently viewing in viewer:[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const formatStreamingErrorMessage = (message: string): string => {
  const normalized = message.trim();
  if (!normalized) {
    return "Pi hit an upstream provider error. Please try again.";
  }

  if (/overloaded/i.test(normalized)) {
    return `Pi's model provider is overloaded right now.\n\n${normalized}`;
  }

  if (/internal server error/i.test(normalized)) {
    return `Pi's model provider returned an internal server error.\n\n${normalized}`;
  }

  return `Pi ran into an upstream error.\n\n${normalized}`;
};

const makeMessage = (
  role: ChatMessageRole,
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  timestamp: Date.now(),
  ...extra,
});

const appendInlineErrorMessage = (
  current: ChatSessionState,
  message: string,
): ChatSessionState => {
  const lastMessage = current.messages.at(-1);
  const nextMessages =
    lastMessage?.role === "system" && lastMessage.content === message
      ? current.messages
      : [...current.messages, makeMessage("system", message, { isError: true })];

  return {
    ...current,
    status: "error",
    connectionState: "error",
    isThinking: false,
    isWorking: false,
    error: message,
    messages: nextMessages,
  };
};

const stripViewerContext = (title: string): string =>
  title
    .replace(/\s*<additional_context>[\s\S]*?<\/additional_context>/g, "")
    .replace(/\s*\[Currently viewing in viewer:[^\]]*\]/g, "")
    .trim();

const createChatState = (
  summary: ChatSummary,
  existing?: Partial<ChatSessionState>,
): ChatSessionState => ({
  ...summary,
  title: stripViewerContext(summary.title),
  messages: existing?.messages ?? [],
  isLoaded: existing?.isLoaded ?? false,
  connectionState:
    existing?.connectionState ??
    (summary.status === "streaming"
      ? "streaming"
      : summary.status === "error"
        ? "error"
        : "idle"),
  isThinking: existing?.isThinking ?? false,
  isWorking: existing?.isWorking ?? summary.status === "streaming",
  error: existing?.error ?? null,
  draft: existing?.draft ?? "",
  draftSelectedElements: existing?.draftSelectedElements ?? [],
  queuedMessages: existing?.queuedMessages ?? [],
  isQueuePaused: existing?.isQueuePaused ?? false,
  lastSubmittedInput: existing?.lastSubmittedInput ?? null,
});

const mergeChatSummaries = (
  summaries: ChatSummary[],
  current: Record<string, ChatSessionState>,
): { chatOrder: string[]; chatsById: Record<string, ChatSessionState> } => {
  const chatOrder = summaries.map((chat) => chat.id);
  const chatsById = summaries.reduce<Record<string, ChatSessionState>>((acc, summary) => {
    acc[summary.id] = createChatState(summary, current[summary.id]);
    return acc;
  }, {});

  return { chatOrder, chatsById };
};

const updateChat = (
  state: ChatStoreState,
  chatId: string,
  updater: (chat: ChatSessionState) => ChatSessionState,
): Pick<ChatStoreState, "chatsById"> => {
  const chat = state.chatsById[chatId];
  if (!chat) {
    return { chatsById: state.chatsById };
  }

  return {
    chatsById: {
      ...state.chatsById,
      [chatId]: updater(chat),
    },
  };
};

export {
  appendInlineErrorMessage,
  createChatState,
  formatStreamingErrorMessage,
  makeMessage,
  mergeChatSummaries,
  normalizeTitle,
  updateChat,
};
