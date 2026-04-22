import type {
  ChatContextInput,
  ChatSessionState,
  SendMessageOptions,
} from "../../store/chatStore";
import { ChatPane } from "../chat/ChatPane";
import type { WorkspaceAppLink } from "../workspace/types";

interface MobileConversationScreenProps {
  visible: boolean;
  chat: ChatSessionState | null;
  viewerPath: string | null;
  workspaceApps: WorkspaceAppLink[];
  onBackToChatList: () => void;
  onOpenViewerApp: (viewerPath: string) => void;
  onSetDraft: (chatId: string, draft: string) => void;
  onRemoveDraftSelectedElement: (chatId: string, index: number) => void;
  onClearDraftSelectedElements: (chatId: string) => void;
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
    modelSelection: Pick<ChatSessionState, "modelProvider" | "modelId">,
  ) => Promise<void>;
  onSendMessage: (
    chatId: string,
    message: string,
    files?: File[],
    context?: ChatContextInput,
    options?: SendMessageOptions,
  ) => Promise<void>;
  focusComposerNonce?: number;
  onNewChat: () => void;
  onRetryLastMessage: (chatId: string) => Promise<void>;
  onStopChat: (chatId: string) => Promise<void>;
  onClearError: (chatId: string) => void;
  viewerPicker?: {
    isSelectingElement: boolean;
    canPickElements: boolean;
    pickerError?: string | null;
    onToggleSelecting: () => void;
  };
}

export function MobileConversationScreen({
  visible,
  chat,
  viewerPath,
  workspaceApps,
  onBackToChatList,
  onOpenViewerApp,
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
  onRetryLastMessage,
  onStopChat,
  onClearError,
  viewerPicker,
}: MobileConversationScreenProps) {
  return (
    <div className={`min-h-0 min-w-0 flex-1 md:hidden ${visible ? "flex" : "hidden"}`}>
      <ChatPane
        chat={chat}
        viewerPath={viewerPath}
        mobile
        workspaceApps={workspaceApps}
        onBackToChatList={onBackToChatList}
        onOpenViewerApp={onOpenViewerApp}
        onSetDraft={onSetDraft}
        onRemoveDraftSelectedElement={onRemoveDraftSelectedElement}
        onClearDraftSelectedElements={onClearDraftSelectedElements}
        onEnqueueMessage={onEnqueueMessage}
        onUpdateQueuedMessage={onUpdateQueuedMessage}
        onReorderQueuedMessage={onReorderQueuedMessage}
        onRemoveQueuedMessage={onRemoveQueuedMessage}
        onSetQueuePaused={onSetQueuePaused}
        onResumeQueue={onResumeQueue}
        onSendQueuedMessage={onSendQueuedMessage}
        onUpdateChatModel={onUpdateChatModel}
        onSendMessage={onSendMessage}
        focusComposerNonce={focusComposerNonce}
        onNewChat={onNewChat}
        onRetryLastMessage={onRetryLastMessage}
        onStopChat={onStopChat}
        onClearError={onClearError}
        viewerPicker={viewerPicker}
      />
    </div>
  );
}
