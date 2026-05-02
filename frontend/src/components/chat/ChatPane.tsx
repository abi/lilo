import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import type {
  ChatContextInput,
  ChatElementSelection,
  SendMessageOptions,
  ChatSessionState,
} from "../../store/chatStore";
import type { AppChatSummary } from "../../hooks/useAppChats";
import type { WorkspaceEntry } from "../workspace/types";
import {
  clearAllComposerPersistence,
  loadComposerDraft,
  loadComposerFiles,
  saveComposerDraft,
  saveComposerFiles,
} from "../../lib/composerDraftPersistence";
import { useChatStore } from "../../store/chatStore";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { ChatMessageList } from "./components/ChatMessageList";
import { useChatScroll } from "./hooks/useChatScroll";
import { groupMessages } from "./lib/messageGroups";
import type { WorkspaceAppViewer } from "./types";

interface ChatPaneHistory {
  chats: ChatSessionState[];
  appChats: AppChatSummary[];
  activeChatId: string | null;
  activeAppChatId: string | null;
  loadingChats: boolean;
  showAppChats: boolean;
  onSelectChat: (chatId: string) => void;
  onSelectAppChat: (chat: AppChatSummary) => void;
  onToggleShowAppChats: () => void;
  onRefreshChats?: () => Promise<void>;
}

interface ChatPaneProps {
  chat: ChatSessionState | null;
  viewerPath?: string | null;
  mobile?: boolean;
  onBackToChatList?: () => void;
  onOpenViewerApp?: (viewerPath: string) => void;
  onOpenViewerPath?: (viewerPath: string) => void;
  onSetDraft: (chatId: string, draft: string) => void;
  onRemoveDraftSelectedElement: (
    chatId: string,
    index: number,
  ) => void;
  onClearDraftSelectedElements?: (chatId: string) => void;
  onEnqueueMessage: (
    chatId: string,
    message: string,
    files?: File[],
    context?: ChatContextInput,
  ) => string | null;
  onUpdateQueuedMessage: (
    chatId: string,
    queuedMessageId: string,
    message: string,
  ) => void;
  onReorderQueuedMessage: (
    chatId: string,
    queuedMessageId: string,
    targetIndex: number,
  ) => void;
  onRemoveQueuedMessage: (chatId: string, queuedMessageId: string) => void;
  onSetQueuePaused: (chatId: string, isPaused: boolean) => void;
  onResumeQueue: (chatId: string) => Promise<void>;
  onSendQueuedMessage: (chatId: string, queuedMessageId: string) => Promise<void>;
  onUpdateChatModel: (
    chatId: string,
    modelSelection: {
      modelProvider: ChatSessionState["modelProvider"];
      modelId: ChatSessionState["modelId"];
    },
  ) => Promise<void>;
  onSendMessage: (
    chatId: string,
    message: string,
    files?: File[],
    context?: ChatContextInput,
    options?: SendMessageOptions,
  ) => Promise<void>;
  focusComposerNonce?: number;
  onNewChat?: () => void;
  workspaceApps?: WorkspaceAppViewer[];
  workspaceEntries?: WorkspaceEntry[];
  onRetryLastMessage: (chatId: string) => Promise<void>;
  onStopChat: (chatId: string) => Promise<void>;
  onClearError: (chatId: string) => void;
  history?: ChatPaneHistory;
  viewerPicker?: {
    isSelectingElement: boolean;
    canPickElements: boolean;
    pickerError?: string | null;
    onToggleSelecting: () => void;
  };
}

export function ChatPane({
  chat,
  viewerPath,
  mobile = false,
  onBackToChatList,
  onOpenViewerApp,
  onOpenViewerPath,
  onSetDraft,
  onRemoveDraftSelectedElement,
  onClearDraftSelectedElements,
  onEnqueueMessage,
  onUpdateQueuedMessage,
  onReorderQueuedMessage,
  onRemoveQueuedMessage,
  onSetQueuePaused,
  onResumeQueue,
  onSendQueuedMessage,
  onUpdateChatModel,
  onSendMessage,
  focusComposerNonce = 0,
  onNewChat,
  workspaceApps = [],
  workspaceEntries = [],
  onRetryLastMessage,
  onStopChat,
  onClearError,
  history,
  viewerPicker,
}: ChatPaneProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [submittingQuestionId, setSubmittingQuestionId] = useState<string | null>(null);
  const [activeQueuedEditId, setActiveQueuedEditId] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const messageGroups = useMemo(
    () => (chat ? groupMessages(chat.messages) : []),
    [chat?.messages],
  );

  const {
    chatScrollRef,
    showScrollToBottom,
    syncScrollState,
    scrollChatToBottom,
  } = useChatScroll({
    chatId: chat?.id,
    messages: chat?.messages ?? [],
    isThinking: chat?.isThinking ?? false,
    isWorking: chat?.isWorking ?? false,
    connectionState: chat?.connectionState ?? "idle",
  });

  useEffect(() => {
    if (!mobile) {
      inputRef.current?.focus();
    }
  }, [mobile, chat?.id]);

  useEffect(() => {
    if (!focusComposerNonce) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      if (input.offsetParent === null) {
        return;
      }

      input.focus();
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
  }, [chat?.id, focusComposerNonce]);

  useEffect(() => {
    if (!chat?.draftSelectedElements.length) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      if (input.offsetParent === null) {
        return;
      }

      input.focus();
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
  }, [chat?.draftSelectedElements]);

  const replaceDraftSelectedElements = useChatStore(
    (state) => state.replaceDraftSelectedElements,
  );
  const addDraftSelectedElement = useChatStore(
    (state) => state.addDraftSelectedElement,
  );

  useEffect(() => {
    setIsDragOver(false);
    setActiveQueuedEditId(null);
    if (!chat?.id) {
      setSelectedFiles([]);
      return;
    }

    // Rehydrate persisted draft + attachments for this chat.
    const savedDraft = loadComposerDraft(chat.id);
    if (savedDraft) {
      if (savedDraft.text && !chat.draft) {
        onSetDraft(chat.id, savedDraft.text);
      }
      if (
        savedDraft.selectedElements.length > 0 &&
        chat.draftSelectedElements.length === 0
      ) {
        replaceDraftSelectedElements(chat.id, savedDraft.selectedElements);
      }
    }

    let cancelled = false;
    void loadComposerFiles(chat.id).then((files) => {
      if (!cancelled) {
        setSelectedFiles(files);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  // Persist text + selected elements whenever they change.
  useEffect(() => {
    if (!chat?.id) return;
    saveComposerDraft(chat.id, {
      text: chat.draft,
      selectedElements: chat.draftSelectedElements,
    });
  }, [chat?.id, chat?.draft, chat?.draftSelectedElements]);

  // Persist file attachments (IndexedDB).
  useEffect(() => {
    if (!chat?.id) return;
    void saveComposerFiles(chat.id, selectedFiles);
  }, [chat?.id, selectedFiles]);

  useEffect(() => {
    if (!chat?.isWorking && !chat?.isThinking) {
      setSubmittingQuestionId(null);
    }
  }, [chat?.isThinking, chat?.isWorking, chat?.messages.length]);

  const isBusy =
    chat?.connectionState === "connecting" || chat?.connectionState === "streaming";

  if (!chat) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-white dark:bg-neutral-900">
        <p className="text-sm text-neutral-400">Loading chat...</p>
      </main>
    );
  }

  const canRetry = Boolean(chat.lastSubmittedInput) && !isBusy;
  const headerStatusText = chat.error
    ? "Provider error"
    : chat.status === "streaming" || isBusy
      ? "Streaming"
      : chat.status === "error"
        ? "Needs attention"
        : "Ready";

  const submitMessage = async () => {
    const draft = chat.draft;
    const trimmedDraft = draft.trim();
    const filesToSend = selectedFiles;
    const selectedElements =
      chat.draftSelectedElements.length > 0 ? chat.draftSelectedElements : undefined;

    if (!trimmedDraft && filesToSend.length === 0 && !selectedElements) {
      inputRef.current?.focus();
      return;
    }

    if (isBusy) {
      const queuedMessageId = onEnqueueMessage(chat.id, draft, filesToSend, {
        viewerPath: viewerPath ?? undefined,
        selectedElements,
      });
      if (!queuedMessageId) {
        inputRef.current?.focus();
        return;
      }

      onSetDraft(chat.id, "");
      onClearDraftSelectedElements?.(chat.id);
      setSelectedFiles([]);
      void clearAllComposerPersistence(chat.id);
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
      inputRef.current?.focus();
      return;
    }

    setSelectedFiles([]);
    void clearAllComposerPersistence(chat.id);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    await onSendMessage(chat.id, trimmedDraft, filesToSend, {
      viewerPath: viewerPath ?? undefined,
      selectedElements,
    });

    requestAnimationFrame(() => scrollChatToBottom("auto"));
    inputRef.current?.focus();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const onInputKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    await submitMessage();
  };

  const addSelectedFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setSelectedFiles((current) => [...current, ...files]);
  };

  const onSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addSelectedFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const hasDraggedFiles = (event: DragEvent<HTMLElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) {
      return false;
    }
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") {
        return true;
      }
    }
    return false;
  };

  const onDragEnterChat = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }
    event.preventDefault();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  };

  const onDragOverChat = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const onDragLeaveChat = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) {
      return;
    }
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const onDropFiles = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    addSelectedFiles(Array.from(event.dataTransfer.files ?? []));
    inputRef.current?.focus();
  };

  const submitQuestionAnswer = async (messageId: string, response: string) => {
    if (isBusy) {
      return;
    }

    setSubmittingQuestionId(messageId);
    try {
      await onSendMessage(chat.id, response, [], {
        viewerPath: viewerPath ?? undefined,
      });
      requestAnimationFrame(() => scrollChatToBottom("auto"));
    } finally {
      setSubmittingQuestionId(null);
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onSetDraft(chat.id, event.target.value);
    const textarea = event.target;
    textarea.style.height = "auto";
    const clamped = Math.min(textarea.scrollHeight, 384);
    textarea.style.height = `${clamped}px`;
    textarea.style.overflowY = textarea.scrollHeight > 384 ? "auto" : "hidden";
  };

  return (
    <main
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-neutral-900"
      onDragEnter={onDragEnterChat}
      onDragOver={onDragOverChat}
      onDragLeave={onDragLeaveChat}
      onDrop={onDropFiles}
    >
      {isDragOver ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/70 p-4 backdrop-blur-sm dark:bg-neutral-900/70">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-neutral-400 bg-white/90 px-8 py-10 text-center shadow-xl dark:border-neutral-500 dark:bg-neutral-800/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <p className="font-heading text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Drop to attach
              </p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Images and files will be added to your message
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <ChatHeader
        title={chat.title}
        mobile={mobile}
        isBusy={isBusy}
        hasError={Boolean(chat.error)}
        headerStatusText={headerStatusText}
        onBackToChatList={onBackToChatList}
        onNewChat={onNewChat}
        history={history}
      />

      <ChatMessageList
        chat={chat}
        messageGroups={messageGroups}
        workspaceApps={workspaceApps}
        workspaceEntries={workspaceEntries}
        chatScrollRef={chatScrollRef}
        canRetry={canRetry}
        isBusy={isBusy}
        submittingQuestionId={submittingQuestionId}
        onScroll={syncScrollState}
        onRetryLastMessage={onRetryLastMessage}
        onClearError={onClearError}
        onSubmitQuestionAnswer={(messageId, response) => {
          void submitQuestionAnswer(messageId, response);
        }}
        onOpenViewerApp={onOpenViewerApp}
        onOpenViewerPath={onOpenViewerPath ?? onOpenViewerApp}
        onImageClick={setLightboxSrc}
        onAddAssistantSelection={(selection: ChatElementSelection) => {
          addDraftSelectedElement(chat.id, selection);
        }}
      />

      <ChatComposer
        chatId={chat.id}
        draft={chat.draft}
        draftSelectedElements={chat.draftSelectedElements}
        queuedMessages={chat.queuedMessages}
        isQueuePaused={chat.isQueuePaused}
        selectedFiles={selectedFiles}
        isBusy={isBusy}
        modelProvider={chat.modelProvider}
        modelId={chat.modelId}
        activeQueuedEditId={activeQueuedEditId}
        showScrollToBottom={showScrollToBottom}
        inputRef={inputRef}
        fileInputRef={fileInputRef}
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        onInputChange={onInputChange}
        onInputKeyDown={(event) => {
          void onInputKeyDown(event);
        }}
        onSelectFiles={onSelectFiles}
        onStopChat={onStopChat}
        onScrollToBottom={() => scrollChatToBottom()}
        onRemoveSelectedElement={onRemoveDraftSelectedElement}
        onClearSelectedElements={onClearDraftSelectedElements}
        onStartEditingQueuedMessage={setActiveQueuedEditId}
        onStopEditingQueuedMessage={() => setActiveQueuedEditId(null)}
        onUpdateQueuedMessage={onUpdateQueuedMessage}
        onReorderQueuedMessage={onReorderQueuedMessage}
        onRemoveQueuedMessage={(chatId, queuedMessageId) => {
          if (activeQueuedEditId === queuedMessageId) {
            setActiveQueuedEditId(null);
          }
          onRemoveQueuedMessage(chatId, queuedMessageId);
        }}
        onSetQueuePaused={onSetQueuePaused}
        onResumeQueue={onResumeQueue}
        onSendQueuedMessage={onSendQueuedMessage}
        onUpdateModel={onUpdateChatModel}
        onPreviewSelectedElement={setLightboxSrc}
        onRemoveSelectedFile={(index) =>
          setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
        }
        viewerPicker={viewerPicker}
      />

      <Lightbox
        open={lightboxSrc !== null}
        close={() => setLightboxSrc(null)}
        slides={lightboxSrc ? [{ src: lightboxSrc }] : []}
        carousel={{ finite: true }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
      />
    </main>
  );
}
