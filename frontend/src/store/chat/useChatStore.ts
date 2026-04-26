import { create } from "zustand";
import { API_BASE_URL, fetchJson, uploadChatAttachments } from "./api";
import {
  appendInlineErrorMessage,
  createChatState,
  formatStreamingErrorMessage,
  makeMessage,
  mergeChatSummaries,
  normalizeTitle,
  updateChat,
} from "./messageMappers";
import { getChatSocketController } from "./socket";
import { safeParseJson } from "./sse";
import { isNotFoundError } from "./storeUtils";
import { authFetch } from "../../lib/auth";
import { captureFrontendException } from "../../lib/sentry";
import type {
  ChatAttachment,
  ChatContextInput,
  ChatDetailResponse,
  ChatQueuedMessage,
  ChatStoreState,
  LastSubmittedInput,
  ParsedSseEvent,
  SendMessageOptions,
} from "./types";

const ACTIVE_CHAT_STORAGE_KEY = "lilo-active-chat-id";
const CHAT_URL_PARAM = "chat";

const readStoredActiveChatId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredActiveChatId = (chatId: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!chatId) {
      localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
      return;
    }

    localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, chatId);
  } catch {
    // ignore storage failures
  }
};

const readUrlChatId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return new URL(window.location.href).searchParams.get(CHAT_URL_PARAM);
  } catch {
    return null;
  }
};

const writeUrlChatId = (chatId: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const url = new URL(window.location.href);
    if (chatId) {
      url.searchParams.set(CHAT_URL_PARAM, chatId);
    } else {
      url.searchParams.delete(CHAT_URL_PARAM);
    }

    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // ignore URL update failures
  }
};

const getSelectedElementsFromContext = (context: ChatContextInput = {}) =>
  context.selectedElements ?? (context.selectedElement ? [context.selectedElement] : []);

const hasQueuedMessageContent = (
  message: string,
  files: File[],
  selectedElements: ChatQueuedMessage["selectedElements"],
) => message.trim().length > 0 || files.length > 0 || selectedElements.some((el) => el.html?.trim());

const queuedMessageContext = (queuedMessage: ChatQueuedMessage): ChatContextInput => ({
  viewerPath: queuedMessage.viewerPath,
  selectedElements:
    queuedMessage.selectedElements.length > 0
      ? queuedMessage.selectedElements
      : undefined,
});

const shouldAutoDrainQueue = (chat: {
  error: string | null;
  connectionState: string;
  isQueuePaused: boolean;
  queuedMessages: ChatQueuedMessage[];
}) =>
  !chat.error &&
  chat.connectionState === "idle" &&
  !chat.isQueuePaused &&
  chat.queuedMessages.length > 0;

const viewerPathFromToolDetails = (details: unknown): string | undefined => {
  if (
    details &&
    typeof details === "object" &&
    "viewerPath" in details &&
    typeof (details as { viewerPath?: unknown }).viewerPath === "string"
  ) {
    return (details as { viewerPath: string }).viewerPath;
  }

  return undefined;
};

const appNameFromToolDetails = (details: unknown): string | undefined => {
  if (
    details &&
    typeof details === "object" &&
    "appName" in details &&
    typeof (details as { appName?: unknown }).appName === "string"
  ) {
    return (details as { appName: string }).appName;
  }

  return undefined;
};

const resumedRunSubscriptions = new Map<string, () => void>();

// Tracks in-flight prefetch requests so prefetchChat can be called liberally
// (touchstart, app-boot warm-up, etc.) without firing duplicate fetches.
const prefetchesInFlight = new Set<string>();
const resumedRunSyncState = new Map<string, { inFlight: boolean; pending: boolean }>();
const pushedChatTitles = new Map<string, string>();
let activeChatSocketChatId: string | null = null;
let activeChatSocketCleanup: (() => void) | null = null;

const applyPushedTitle = <T extends { id: string; title: string }>(value: T): T => {
  const pushedTitle = pushedChatTitles.get(value.id);
  if (!pushedTitle) {
    return value;
  }

  if (pushedTitle === value.title) {
    pushedChatTitles.delete(value.id);
    return value;
  }

  return {
    ...value,
    title: pushedTitle,
  };
};

const applyPushedTitles = <T extends { id: string; title: string }>(values: T[]): T[] =>
  values.map((value) => applyPushedTitle(value));

export const useChatStore = create<ChatStoreState>((set, get) => {
  const createParsedEventHandler = (
    chatId: string,
    refs: {
      currentAssistantId: string | null;
      currentThinkingId: string | null;
      lastToolName: string | undefined;
      sawWorkspaceMutation: boolean;
      sawTerminalEvent: boolean;
    },
  ) => {
    const handleParsedEvent = (parsed: ParsedSseEvent) => {
      if (parsed.event === "thinking_delta") {
        const payload = safeParseJson<{ delta?: string }>(parsed.data, {});
        if (!payload.delta) {
          return;
        }

        if (!refs.currentThinkingId) {
          refs.currentThinkingId = crypto.randomUUID();
          set((state) =>
            updateChat(state, chatId, (current) => ({
              ...current,
              messages: [
                ...current.messages,
                {
                  id: refs.currentThinkingId!,
                  role: "thinking",
                  content: payload.delta ?? "",
                  timestamp: Date.now(),
                },
              ],
            })),
          );
          return;
        }

        const idToUpdate = refs.currentThinkingId;
        set((state) =>
          updateChat(state, chatId, (current) => ({
            ...current,
            messages: current.messages.map((entry) =>
              entry.id === idToUpdate
                ? { ...entry, content: entry.content + payload.delta }
                : entry,
            ),
          })),
        );
      }

      if (parsed.event === "text_delta") {
        refs.currentThinkingId = null;
        const payload = safeParseJson<{ delta?: string }>(parsed.data, {});
        if (!payload.delta) {
          return;
        }

        if (!refs.currentAssistantId) {
          refs.currentAssistantId = crypto.randomUUID();
          set((state) =>
            updateChat(state, chatId, (current) => ({
              ...current,
              messages: [
                ...current.messages,
                {
                  id: refs.currentAssistantId!,
                  role: "assistant",
                  content: payload.delta ?? "",
                  timestamp: Date.now(),
                },
              ],
            })),
          );
          return;
        }

        const idToUpdate = refs.currentAssistantId;
        set((state) =>
          updateChat(state, chatId, (current) => ({
            ...current,
            messages: current.messages.map((entry) =>
              entry.id === idToUpdate
                ? { ...entry, content: entry.content + payload.delta }
                : entry,
            ),
          })),
        );
      }

      if (parsed.event === "tool_call") {
        refs.currentAssistantId = null;
        refs.currentThinkingId = null;
        const payload = safeParseJson<{ toolName?: string; input?: unknown }>(parsed.data, {});
        refs.lastToolName = payload.toolName;

        set((state) =>
          updateChat(state, chatId, (current) => ({
            ...current,
            messages: [
              ...current.messages,
              makeMessage("tool_call", payload.toolName ?? "unknown_tool", {
                toolName: payload.toolName,
                toolInput: JSON.stringify(payload.input ?? {}, null, 2),
              }),
            ],
          })),
        );
      }

      if (parsed.event === "tool_result") {
        const payload = safeParseJson<{
          toolName?: string;
          output?: unknown;
          isError?: boolean;
          details?: unknown;
        }>(parsed.data, {});

        const outputText =
          typeof payload.output === "string"
            ? payload.output
            : JSON.stringify(payload.output ?? "", null, 2);

        if (refs.lastToolName && ["write", "edit"].includes(refs.lastToolName.toLowerCase())) {
          refs.sawWorkspaceMutation = true;
        }

        set((state) =>
          updateChat(state, chatId, (current) => ({
            ...current,
            messages: [
              ...current.messages,
              makeMessage("tool_result", outputText, {
                toolName: payload.toolName,
                toolDetails: payload.details,
                isError: payload.isError,
                viewerPath: viewerPathFromToolDetails(payload.details),
                appName: appNameFromToolDetails(payload.details),
              }),
            ],
          })),
        );
      }

      if (parsed.event === "status") {
        const payload = safeParseJson<{ state?: "idle" | "thinking" | "working" }>(
          parsed.data,
          {},
        );

        set((state) =>
          updateChat(state, chatId, (current) => ({
            ...current,
            isThinking: payload.state === "thinking",
            isWorking: payload.state === "thinking" || payload.state === "working",
          })),
        );
      }

      if (parsed.event === "error") {
        refs.sawTerminalEvent = true;
        const payload = safeParseJson<{ message?: string }>(parsed.data, {});
        const formattedError = formatStreamingErrorMessage(
          payload.message ?? "Unknown streaming error",
        );
        set((state) =>
          updateChat(state, chatId, (current) => ({
            ...appendInlineErrorMessage(current, formattedError),
          })),
        );
      }

      if (parsed.event === "done") {
        refs.sawTerminalEvent = true;
        const payload = safeParseJson<{ reason?: string }>(parsed.data, {});
        set((state) =>
          updateChat(state, chatId, (current) => {
            if (payload.reason === "error" && !current.error) {
              return appendInlineErrorMessage(
                current,
                formatStreamingErrorMessage("The Pi stream ended with an error."),
              );
            }

            return {
              ...current,
              status: current.error ? "error" : "idle",
              connectionState: current.error ? "error" : "idle",
              isThinking: false,
              isWorking: false,
            };
          }),
        );
      }
    };

    return {
      handleParsedEvent,
      get sawWorkspaceMutation() {
        return refs.sawWorkspaceMutation;
      },
      get sawTerminalEvent() {
        return refs.sawTerminalEvent;
      },
      resetStreamingIds() {
        refs.currentAssistantId = null;
        refs.currentThinkingId = null;
      },
    };
  };

  const syncChatDetail = async (chatId: string): Promise<void> => {
    const syncState = resumedRunSyncState.get(chatId) ?? { inFlight: false, pending: false };

    if (syncState.inFlight) {
      syncState.pending = true;
      resumedRunSyncState.set(chatId, syncState);
      return;
    }

    syncState.inFlight = true;
    resumedRunSyncState.set(chatId, syncState);

    try {
      const payload = await fetchJson<ChatDetailResponse>(`${API_BASE_URL}/chats/${chatId}`);
      const detail = applyPushedTitle(payload.chat);
      set((state) => ({
        chatsById: {
          ...state.chatsById,
          [chatId]: {
            ...createChatState(detail, state.chatsById[chatId]),
            messages: detail.messages,
            isLoaded: true,
            draft: state.chatsById[chatId]?.draft ?? "",
            error: state.chatsById[chatId]?.error ?? null,
            status: state.chatsById[chatId]?.error ? "error" : detail.status,
            isThinking: false,
            isWorking: detail.status === "streaming",
            connectionState: state.chatsById[chatId]?.error
              ? "error"
              : detail.status === "streaming"
                ? "streaming"
                : detail.status === "error"
                  ? "error"
                  : "idle",
          },
        },
      }));

      await attachResumedRun(chatId);
    } catch {
      // Best-effort recovery refresh.
    } finally {
      syncState.inFlight = false;
      const shouldRepeat = syncState.pending;
      syncState.pending = false;
      resumedRunSyncState.set(chatId, syncState);
      if (shouldRepeat) {
        void syncChatDetail(chatId);
      }
    }
  };

  const attachResumedRun = async (chatId: string): Promise<void> => {
    const chat = get().chatsById[chatId];
    if (!chat?.activeRunId || chat.status !== "streaming") {
      const existing = resumedRunSubscriptions.get(chatId);
      if (existing) {
        existing();
        resumedRunSubscriptions.delete(chatId);
      }
      return;
    }

    if (resumedRunSubscriptions.has(chatId)) {
      return;
    }

    if (
      chat.lastSubmittedInput &&
      (chat.connectionState === "connecting" || chat.connectionState === "streaming")
    ) {
      return;
    }

    const parser = createParsedEventHandler(chatId, {
      currentAssistantId: null,
      currentThinkingId: null,
      lastToolName: undefined,
      sawWorkspaceMutation: false,
      sawTerminalEvent: false,
    });

    const controller = getChatSocketController(chatId);
    const unsubscribe = controller.addListener({
      onEvent: (parsed) => {
        parser.handleParsedEvent(parsed);
        if (parsed.event === "done") {
          void syncChatDetail(chatId);
        }
      },
      onReconnect: () => {
        parser.resetStreamingIds();
        set((state) =>
          updateChat(state, chatId, (current) => ({
            ...current,
            connectionState: current.error ? "error" : "connecting",
          })),
        );
      },
      onConnectionChange: (state) => {
        if (state === "open") {
          set((storeState) =>
            updateChat(storeState, chatId, (current) => ({
              ...current,
              connectionState: current.error ? "error" : "streaming",
            })),
          );
        }
      },
    });

    resumedRunSubscriptions.set(chatId, () => {
      unsubscribe();
      resumedRunSubscriptions.delete(chatId);
    });

    await controller.resumeRun(chat.activeRunId, 0);
  };

  return ({
  chatOrder: [],
  chatsById: {},
  activeChatId: readUrlChatId() ?? readStoredActiveChatId(),
  initialized: false,
  loadingInitial: false,
  initializationError: null,
  workspaceVersion: 0,

  initialize: async () => {
    if ((get().initialized && !get().initializationError) || get().loadingInitial) {
      return;
    }

    set({ loadingInitial: true, initializationError: null });

    try {
      const payload = await fetchJson<{ chats: import("./types").ChatSummary[] }>(
        `${API_BASE_URL}/chats`,
      );
      const chats = applyPushedTitles(payload.chats);

      if (chats.length === 0) {
        await get().createChat({ select: true });
        set({ loadingInitial: false, initialized: true });
      } else {
        const merged = mergeChatSummaries(chats, get().chatsById);
        const permalinkChatId = readUrlChatId();
        const currentActiveChatId = get().activeChatId;
        const activeChatId =
          permalinkChatId && merged.chatsById[permalinkChatId]
            ? permalinkChatId
            : currentActiveChatId && merged.chatsById[currentActiveChatId]
              ? currentActiveChatId
              : chats[0].id;

        set({
          ...merged,
          activeChatId,
          initialized: true,
          loadingInitial: false,
          initializationError: null,
        });

        await get().selectChat(activeChatId);
      }
    } catch (error) {
      console.error(error);
      captureFrontendException(error, {
        tags: {
          area: "chat_initialize",
        },
      });
      set({
        loadingInitial: false,
        initialized: true,
        initializationError:
          error instanceof Error ? error.message : "Failed to load chats",
      });
    }
  },

  refreshChatList: async () => {
    const payload = await fetchJson<{ chats: import("./types").ChatSummary[] }>(
      `${API_BASE_URL}/chats`,
    );
    const chats = applyPushedTitles(payload.chats);
    const merged = mergeChatSummaries(chats, get().chatsById);
    const currentActiveChatId = get().activeChatId;
    const activeChatId =
      currentActiveChatId && merged.chatsById[currentActiveChatId]
        ? currentActiveChatId
        : chats[0]?.id ?? null;

    set({
      ...merged,
      activeChatId,
    });

    if (activeChatId && merged.chatsById[activeChatId]?.isLoaded) {
      await attachResumedRun(activeChatId);
    }
  },

  createChat: async (options = { select: true }) => {
    const body =
      options.modelProvider && options.modelId
        ? JSON.stringify({
            provider: options.modelProvider,
            modelId: options.modelId,
          })
        : undefined;
    const payload = await fetchJson<ChatDetailResponse>(`${API_BASE_URL}/chats`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
    });

    const chat = payload.chat;
    set((state) => ({
      chatOrder: [chat.id, ...state.chatOrder.filter((id) => id !== chat.id)],
      chatsById: {
        ...state.chatsById,
        [chat.id]: {
          ...createChatState(chat),
          messages: chat.messages,
          isLoaded: true,
        },
      },
      activeChatId: options.select ? chat.id : state.activeChatId,
      initialized: true,
    }));

    return chat.id;
  },

  updateChatModel: async (chatId, modelSelection) => {
    const payload = await fetchJson<ChatDetailResponse>(`${API_BASE_URL}/chats/${chatId}/model`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: modelSelection.modelProvider,
        modelId: modelSelection.modelId,
      }),
    });

    const chat = applyPushedTitle(payload.chat);
    set((state) => ({
      chatsById: {
        ...state.chatsById,
        [chatId]: {
          ...createChatState(chat, state.chatsById[chatId]),
          messages: state.chatsById[chatId]?.messages ?? chat.messages,
          isLoaded: state.chatsById[chatId]?.isLoaded ?? true,
        },
      },
    }));
  },

  /**
   * Fetch a chat's full detail and merge it into the store WITHOUT changing
   * the active chat. Safe to call liberally — duplicate calls dedupe via the
   * module-level Set, and already-loaded chats are a no-op. Failures are
   * silently swallowed so a flaky prefetch never disrupts UX.
   */
  prefetchChat: async (chatId) => {
    if (!chatId) return;
    if (prefetchesInFlight.has(chatId)) return;
    if (get().chatsById[chatId]?.isLoaded) return;

    prefetchesInFlight.add(chatId);
    try {
      const payload = await fetchJson<ChatDetailResponse>(
        `${API_BASE_URL}/chats/${chatId}`,
      );
      const chat = applyPushedTitle(payload.chat);
      set((state) => {
        // If selectChat won the race and already loaded the chat, leave it.
        if (state.chatsById[chatId]?.isLoaded) return state;
        return {
          chatsById: {
            ...state.chatsById,
            [chatId]: {
              ...createChatState(chat, state.chatsById[chatId]),
              messages: chat.messages,
              isLoaded: true,
            },
          },
        };
      });
    } catch {
      // Silent — prefetch failures shouldn't surface.
    } finally {
      prefetchesInFlight.delete(chatId);
    }
  },

  selectChat: async (chatId) => {
    set({ activeChatId: chatId });

    const existing = get().chatsById[chatId];
    if (existing?.isLoaded) {
      void syncActiveChatSocket(chatId);
      await attachResumedRun(chatId);
      return;
    }

    try {
      const payload = await fetchJson<ChatDetailResponse>(`${API_BASE_URL}/chats/${chatId}`);
      const chat = applyPushedTitle(payload.chat);

      set((state) => ({
        chatsById: {
          ...state.chatsById,
          [chatId]: {
            ...createChatState(chat, state.chatsById[chatId]),
            messages: chat.messages,
            isLoaded: true,
          },
        },
      }));

      void syncActiveChatSocket(chatId);
      await attachResumedRun(chatId);
    } catch (error) {
      if (!isNotFoundError(error)) {
        captureFrontendException(error, {
          tags: {
            area: "chat_select",
            chatId,
          },
        });
        throw error;
      }

      const staleChatMap = { ...get().chatsById };
      delete staleChatMap[chatId];
      const staleChatOrder = get().chatOrder.filter((id) => id !== chatId);

      set({
        chatsById: staleChatMap,
        chatOrder: staleChatOrder,
        activeChatId: staleChatOrder[0] ?? null,
      });

      try {
        await get().refreshChatList();
      } catch {
        // Fall back to local cleanup if refreshing the chat list also fails.
      }

      const nextState = get();
      if (nextState.chatsById[chatId]) {
        set({ activeChatId: chatId });
        return get().selectChat(chatId);
      }

      const fallbackChatId = nextState.activeChatId ?? nextState.chatOrder[0] ?? null;
      if (fallbackChatId) {
        set({ activeChatId: fallbackChatId });
        return get().selectChat(fallbackChatId);
      }

      const newChatId = await get().createChat({ select: true });
      await get().selectChat(newChatId);
    }
  },

  setDraft: (chatId, draft) => {
    set((state) => updateChat(state, chatId, (chat) => ({ ...chat, draft })));
  },

  replaceDraftSelectedElements: (chatId, selectedElements) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({
        ...chat,
        draftSelectedElements: [...selectedElements],
      })),
    );
  },

  addDraftSelectedElement: (chatId, selectedElement) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({
        ...chat,
        draftSelectedElements: [...chat.draftSelectedElements, selectedElement],
      })),
    );
  },

  removeDraftSelectedElement: (chatId, index) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({
        ...chat,
        draftSelectedElements: chat.draftSelectedElements.filter((_, i) => i !== index),
      })),
    );
  },

  clearDraftSelectedElements: (chatId) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({ ...chat, draftSelectedElements: [] })),
    );
  },

  enqueueMessage: (chatId, message, files = [], context = {}) => {
    const chat = get().chatsById[chatId];
    const selectedElements = getSelectedElementsFromContext(context);

    if (!chat || !hasQueuedMessageContent(message, files, selectedElements)) {
      return null;
    }

    const queuedMessage: ChatQueuedMessage = {
      id: crypto.randomUUID(),
      message,
      files: [...files],
      selectedElements: [...selectedElements],
      viewerPath: context.viewerPath,
      createdAt: Date.now(),
    };

    set((state) =>
      updateChat(state, chatId, (current) => ({
        ...current,
        queuedMessages: [...current.queuedMessages, queuedMessage],
      })),
    );

    return queuedMessage.id;
  },

  updateQueuedMessage: (chatId, queuedMessageId, message) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({
        ...chat,
        queuedMessages: chat.queuedMessages.map((queuedMessage) =>
          queuedMessage.id === queuedMessageId
            ? { ...queuedMessage, message }
            : queuedMessage,
        ),
      })),
    );
  },

  reorderQueuedMessage: (chatId, queuedMessageId, targetIndex) => {
    set((state) =>
      updateChat(state, chatId, (chat) => {
        const currentIndex = chat.queuedMessages.findIndex(
          (queuedMessage) => queuedMessage.id === queuedMessageId,
        );
        if (currentIndex === -1) {
          return chat;
        }

        if (
          targetIndex < 0 ||
          targetIndex >= chat.queuedMessages.length ||
          targetIndex === currentIndex
        ) {
          return chat;
        }

        const queuedMessages = [...chat.queuedMessages];
        const [moved] = queuedMessages.splice(currentIndex, 1);
        queuedMessages.splice(targetIndex, 0, moved);

        return {
          ...chat,
          queuedMessages,
        };
      }),
    );
  },

  removeQueuedMessage: (chatId, queuedMessageId) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({
        ...chat,
        queuedMessages: chat.queuedMessages.filter(
          (queuedMessage) => queuedMessage.id !== queuedMessageId,
        ),
      })),
    );
  },

  shiftQueuedMessage: (chatId) => {
    let nextQueuedMessage: ChatQueuedMessage | null = null;

    set((state) => {
      const chat = state.chatsById[chatId];
      if (!chat || chat.queuedMessages.length === 0) {
        return state;
      }

      [nextQueuedMessage] = chat.queuedMessages;
      return {
        chatsById: {
          ...state.chatsById,
          [chatId]: {
            ...chat,
            queuedMessages: chat.queuedMessages.slice(1),
          },
        },
      };
    });

    return nextQueuedMessage;
  },

  setQueuePaused: (chatId, isPaused) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({
        ...chat,
        isQueuePaused: isPaused,
      })),
    );
  },

  resumeQueue: async (chatId) => {
    get().setQueuePaused(chatId, false);

    const chat = get().chatsById[chatId];
    if (!chat || !shouldAutoDrainQueue(chat)) {
      return;
    }

    const nextQueuedMessage = get().shiftQueuedMessage(chatId);
    if (!nextQueuedMessage) {
      return;
    }

    await get().sendMessage(
      chatId,
      nextQueuedMessage.message,
      nextQueuedMessage.files,
      queuedMessageContext(nextQueuedMessage),
      { preserveComposer: true },
    );
  },

  sendQueuedMessage: async (chatId, queuedMessageId) => {
    const chat = get().chatsById[chatId];
    if (!chat || chat.connectionState === "connecting" || chat.connectionState === "streaming") {
      return;
    }

    const queuedMessage = chat.queuedMessages.find((entry) => entry.id === queuedMessageId);
    if (!queuedMessage) {
      return;
    }

    set((state) =>
      updateChat(state, chatId, (current) => ({
        ...current,
        queuedMessages: current.queuedMessages.filter((entry) => entry.id !== queuedMessageId),
      })),
    );

    await get().sendMessage(
      chatId,
      queuedMessage.message,
      queuedMessage.files,
      queuedMessageContext(queuedMessage),
      { preserveComposer: true },
    );
  },

  stopChat: async (chatId) => {
    set((state) =>
      updateChat(state, chatId, (chat) => ({
        ...chat,
        isQueuePaused: true,
      })),
    );

    try {
        await getChatSocketController(chatId).stopRun();
    } catch {
      try {
        await authFetch(`${API_BASE_URL}/chats/${chatId}/stop`, { method: "POST" });
      } catch {
        // Best-effort stop; the stream will clean up local state.
      }
    }
  },

  clearError: (chatId) => {
    set((state) => updateChat(state, chatId, (chat) => ({ ...chat, error: null })));
  },

  retryLastMessage: async (chatId) => {
    const chat = get().chatsById[chatId];
    if (!chat?.lastSubmittedInput) {
      return;
    }

    await get().sendMessage(
      chatId,
      chat.lastSubmittedInput.message,
      [...chat.lastSubmittedInput.files],
      chat.lastSubmittedInput.context,
    );
  },

  sendMessage: async (
    chatId,
    rawMessage,
    files = [],
    context = {},
    options: SendMessageOptions = {},
  ) => {
    const message = rawMessage.trim();
    const chat = get().chatsById[chatId];
    const selectedElements = getSelectedElementsFromContext(context);
    const hasSelectedElements = selectedElements.some((el) => el.html?.trim());
    const hasContext = Boolean(context.viewerPath || hasSelectedElements);
    const preserveComposer = options.preserveComposer ?? false;

    if (!chat || (!message && files.length === 0 && !hasSelectedElements)) {
      return;
    }

    if (chat.connectionState === "connecting" || chat.connectionState === "streaming") {
      return;
    }

    const attachments: ChatAttachment[] = [
      ...files.map((file) => ({
        name: file.name,
        type: file.type,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
        kind: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
      })),
      ...selectedElements.map((el) => ({
        name: el.label,
        type: "text/html",
        previewUrl: el.previewUrl ?? "",
        kind: "selected_element" as const,
        label: el.label,
        textPreview: el.textPreview,
        html: el.html,
        tagName: el.tagName,
      })),
    ];
    const lastSubmittedInput: LastSubmittedInput = {
      message,
      files: [...files],
      context: hasContext ? { ...context } : undefined,
    };

    let currentAssistantId: string | null = null;
    let currentThinkingId: string | null = null;
    let lastToolName: string | undefined;
    let sawWorkspaceMutation = false;
    let sawTerminalEvent = false;
    const parser = createParsedEventHandler(chatId, {
      get currentAssistantId() {
        return currentAssistantId;
      },
      set currentAssistantId(value: string | null) {
        currentAssistantId = value;
      },
      get currentThinkingId() {
        return currentThinkingId;
      },
      set currentThinkingId(value: string | null) {
        currentThinkingId = value;
      },
      get lastToolName() {
        return lastToolName;
      },
      set lastToolName(value: string | undefined) {
        lastToolName = value;
      },
      get sawWorkspaceMutation() {
        return sawWorkspaceMutation;
      },
      set sawWorkspaceMutation(value: boolean) {
        sawWorkspaceMutation = value;
      },
      get sawTerminalEvent() {
        return sawTerminalEvent;
      },
      set sawTerminalEvent(value: boolean) {
        sawTerminalEvent = value;
      },
    });

    set((state) =>
      updateChat(state, chatId, (current) => ({
        ...current,
        title:
          current.title === "New chat" && message.length > 0
            ? normalizeTitle(message)
            : current.title,
        updatedAt: new Date().toISOString(),
        status: "streaming",
        isLoaded: true,
        draft: preserveComposer ? current.draft : "",
        draftSelectedElements: preserveComposer ? current.draftSelectedElements : [],
        isQueuePaused: preserveComposer ? current.isQueuePaused : false,
        error: null,
        isThinking: true,
        isWorking: true,
        connectionState: "connecting",
        lastSubmittedInput,
        messages: [
          ...current.messages,
          makeMessage("user", message, attachments.length > 0 ? { attachments } : {}),
        ],
      })),
    );

    try {
      {
        const controller = getChatSocketController(chatId);
        let unsubscribeSocketListener: undefined | (() => void);

        const runCompleted = new Promise<void>((resolve) => {
          unsubscribeSocketListener = controller.addListener({
            onEvent: (parsed) => {
              parser.handleParsedEvent(parsed);
              if (parsed.event === "done") {
                unsubscribeSocketListener?.();
                unsubscribeSocketListener = undefined;
                resolve();
              }
            },
            onReconnect: () => {
              parser.resetStreamingIds();
              set((state) =>
                updateChat(state, chatId, (current) => ({
                  ...current,
                  connectionState: current.error ? "error" : "connecting",
                })),
              );
            },
            onConnectionChange: (state) => {
              if (state === "open") {
                set((storeState) =>
                  updateChat(storeState, chatId, (current) => ({
                    ...current,
                    connectionState: "streaming",
                  })),
                );
              }

              if (state === "connecting") {
                set((storeState) =>
                  updateChat(storeState, chatId, (current) => ({
                    ...current,
                    connectionState: current.error ? "error" : "connecting",
                  })),
                );
              }
            },
          });
        });

        try {
          const uploadIds =
            files.length > 0 ? await uploadChatAttachments(chatId, files) : undefined;
          await controller.startRun(message, hasContext ? context : undefined, uploadIds);
          await runCompleted;
        } finally {
          const cleanupSocketListener = unsubscribeSocketListener;
          if (cleanupSocketListener) {
            cleanupSocketListener();
          }
        }
      }

      set((state) =>
        updateChat(state, chatId, (current) => {
          if (!current.error && !parser.sawTerminalEvent) {
            captureFrontendException(
              new Error("The Pi response stream closed unexpectedly."),
              {
                tags: {
                  area: "chat_stream",
                  chatId,
                },
                extras: {
                  hasFiles: files.length > 0,
                  selectedElementCount: selectedElements.length,
                  messageLength: message.length,
                },
                fingerprint: ["chat-stream-closed", chatId],
              },
            );
            return appendInlineErrorMessage(
              current,
              formatStreamingErrorMessage("The Pi response stream closed unexpectedly."),
            );
          }

          return {
            ...current,
            status: current.error ? "error" : "idle",
            connectionState: current.error ? "error" : "idle",
            isThinking: false,
            isWorking: false,
          };
        }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to stream response";
      const formattedError = formatStreamingErrorMessage(errorMessage);
      captureFrontendException(error, {
        tags: {
          area: "chat_send",
          chatId,
        },
        extras: {
          hasFiles: files.length > 0,
          fileCount: files.length,
          selectedElementCount: selectedElements.length,
          hasContext,
          messageLength: message.length,
        },
        fingerprint: ["chat-send", chatId],
      });

      set((state) =>
        updateChat(state, chatId, (current) =>
          appendInlineErrorMessage(current, formattedError),
        ),
      );
    } finally {
      await get().refreshChatList().catch(() => undefined);
      await fetchJson<ChatDetailResponse>(`${API_BASE_URL}/chats/${chatId}`)
        .then((payload) => {
          const detail = applyPushedTitle(payload.chat);
          set((state) => ({
            chatsById: {
              ...state.chatsById,
              [chatId]: {
                ...createChatState(detail, state.chatsById[chatId]),
                messages: detail.messages,
                isLoaded: true,
                draft: state.chatsById[chatId]?.draft ?? "",
                error: state.chatsById[chatId]?.error ?? null,
                status: state.chatsById[chatId]?.error ? "error" : detail.status,
                isThinking: false,
                isWorking: false,
                connectionState: state.chatsById[chatId]?.error
                  ? "error"
                  : detail.status === "streaming"
                    ? "streaming"
                    : detail.status === "error"
                      ? "error"
                      : "idle",
              },
            },
          }));
        })
        .catch(() => undefined);

      if (parser.sawWorkspaceMutation) {
        set((state) => ({ workspaceVersion: state.workspaceVersion + 1 }));
      }

      const settledChat = get().chatsById[chatId];
      if (settledChat && shouldAutoDrainQueue(settledChat)) {
        const nextQueuedMessage = get().shiftQueuedMessage(chatId);
        if (nextQueuedMessage) {
          void get().sendMessage(
            chatId,
            nextQueuedMessage.message,
            nextQueuedMessage.files,
            queuedMessageContext(nextQueuedMessage),
            { preserveComposer: true },
          );
        }
      }
    }
  },
  });
});

async function syncActiveChatSocket(chatId: string | null): Promise<void> {
  if (activeChatSocketChatId === chatId) {
    return;
  }

  const previousChatId = activeChatSocketChatId;
  const previousCleanup = activeChatSocketCleanup;
  activeChatSocketChatId = null;
  activeChatSocketCleanup = null;

  previousCleanup?.();
  if (previousChatId) {
    getChatSocketController(previousChatId).unwatchChat();
  }

  if (!chatId) {
    return;
  }

  const controller = getChatSocketController(chatId);
  const unsubscribe = controller.addListener({
    onChatUpdated: (update) => {
      pushedChatTitles.set(update.chatId, update.title);
      useChatStore.setState((state) =>
        updateChat(state, update.chatId, (current) => ({
          ...current,
          title: update.title.trim() || current.title,
        })),
      );
    },
  });

  activeChatSocketChatId = chatId;
  activeChatSocketCleanup = () => {
    unsubscribe();
    if (activeChatSocketChatId === chatId) {
      activeChatSocketChatId = null;
      activeChatSocketCleanup = null;
    }
  };

  await controller.watchChat().catch(() => undefined);
}

useChatStore.subscribe((state, previousState) => {
  if (state.activeChatId !== previousState.activeChatId) {
    writeStoredActiveChatId(state.activeChatId);
    writeUrlChatId(state.activeChatId);
    void syncActiveChatSocket(state.activeChatId);
  }
});
