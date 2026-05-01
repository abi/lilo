export type ChatMessageRole =
  | "user"
  | "assistant"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "system";

export interface ChatAttachment {
  name: string;
  type: string;
  previewUrl: string;
  kind?: "image" | "file" | "selected_element";
  label?: string;
  textPreview?: string;
  html?: string;
  tagName?: string;
}

export interface ChatElementSelection {
  html: string;
  tagName: string;
  label: string;
  textPreview: string;
  previewUrl?: string;
}

export interface ChatQueuedMessage {
  id: string;
  message: string;
  files: File[];
  selectedElements: ChatElementSelection[];
  viewerPath?: string;
  createdAt: number;
}

export interface ChatContextInput {
  viewerPath?: string;
  selectedElement?: ChatElementSelection;
  selectedElements?: ChatElementSelection[];
}

export type ChatModelProvider = "openai" | "anthropic" | "openrouter";
export type ChatModelId =
  | "gpt-5.5"
  | "gpt-5.4-mini"
  | "claude-opus-4-7"
  | "openai/gpt-5.4-mini"
  | "anthropic/claude-opus-4.7"
  | "moonshotai/kimi-k2.6";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: string;
  toolDetails?: unknown;
  isError?: boolean;
  attachments?: ChatAttachment[];
  viewerPath?: string;
  appName?: string;
}

export interface LastSubmittedInput {
  message: string;
  files: File[];
  context?: ChatContextInput;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status: "idle" | "streaming" | "error";
  activeRunId: string | null;
  activeRunLastSeq: number | null;
  modelProvider: ChatModelProvider;
  modelId: ChatModelId;
}

export type ConnectionState = "idle" | "connecting" | "streaming" | "error";

export interface ChatSessionState extends ChatSummary {
  messages: ChatMessage[];
  isLoaded: boolean;
  connectionState: ConnectionState;
  isThinking: boolean;
  isWorking: boolean;
  error: string | null;
  draft: string;
  draftSelectedElements: ChatElementSelection[];
  queuedMessages: ChatQueuedMessage[];
  isQueuePaused: boolean;
  lastSubmittedInput: LastSubmittedInput | null;
}

export interface SendMessageOptions {
  preserveComposer?: boolean;
}

export interface ChatDetailResponse {
  chat: ChatSummary & {
    messages: ChatMessage[];
  };
}

export interface ParsedSseEvent {
  event: string;
  data: string;
}

export interface ChatStoreState {
  chatOrder: string[];
  chatsById: Record<string, ChatSessionState>;
  activeChatId: string | null;
  initialized: boolean;
  loadingInitial: boolean;
  initializationError: string | null;
  workspaceVersion: number;
  initialize: () => Promise<void>;
  refreshChatList: () => Promise<void>;
  createChat: (options?: {
    select?: boolean;
    modelProvider?: ChatSummary["modelProvider"];
    modelId?: ChatSummary["modelId"];
  }) => Promise<string>;
  selectChat: (chatId: string) => Promise<void>;
  prefetchChat: (chatId: string) => Promise<void>;
  updateChatModel: (
    chatId: string,
    modelSelection: Pick<ChatSummary, "modelProvider" | "modelId">,
  ) => Promise<void>;
  setDraft: (chatId: string, draft: string) => void;
  replaceDraftSelectedElements: (
    chatId: string,
    selectedElements: ChatElementSelection[],
  ) => void;
  addDraftSelectedElement: (
    chatId: string,
    selectedElement: ChatElementSelection,
  ) => void;
  removeDraftSelectedElement: (
    chatId: string,
    index: number,
  ) => void;
  clearDraftSelectedElements: (chatId: string) => void;
  enqueueMessage: (
    chatId: string,
    message: string,
    files?: File[],
    context?: ChatContextInput,
  ) => string | null;
  updateQueuedMessage: (
    chatId: string,
    queuedMessageId: string,
    message: string,
  ) => void;
  reorderQueuedMessage: (
    chatId: string,
    queuedMessageId: string,
    targetIndex: number,
  ) => void;
  removeQueuedMessage: (
    chatId: string,
    queuedMessageId: string,
  ) => void;
  shiftQueuedMessage: (chatId: string) => ChatQueuedMessage | null;
  setQueuePaused: (chatId: string, isPaused: boolean) => void;
  resumeQueue: (chatId: string) => Promise<void>;
  sendQueuedMessage: (chatId: string, queuedMessageId: string) => Promise<void>;
  sendMessage: (
    chatId: string,
    message: string,
    files?: File[],
    context?: ChatContextInput,
    options?: SendMessageOptions,
  ) => Promise<void>;
  stopChat: (chatId: string) => Promise<void>;
  clearError: (chatId: string) => void;
  retryLastMessage: (chatId: string) => Promise<void>;
}
