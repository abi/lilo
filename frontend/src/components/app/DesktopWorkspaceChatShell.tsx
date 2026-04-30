import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import type {
  ChatContextInput,
  ChatElementSelection,
  ChatSessionState,
  SendMessageOptions,
} from "../../store/chatStore";
import type { AppChatSummary } from "../../hooks/useAppChats";
import { AppChatPane } from "../chat/AppChatPane";
import { ChatPane } from "../chat/ChatPane";
import { ViewerPane } from "../workspace/ViewerPane";
import type { ViewerPickerInjection } from "../workspace/ViewerPane";
import type { WorkspaceAppLink, WorkspaceEntry } from "../workspace/types";

interface DesktopWorkspaceChatShellProps {
  activeChat: ChatSessionState | null;
  activeAppChat?: ChatSessionState | null;
  selectedViewerPath: string | null;
  selectedViewerUrl: string | null;
  selectedWorkspaceEntry: WorkspaceEntry | null;
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  fileViewerText: string | null;
  fileViewerError: string | null;
  isLoadingFileViewer: boolean;
  viewerRefreshKey: number;
  onSelectElement: (selection: ChatElementSelection) => void;
  onRefreshViewer: () => void;
  onOpenViewerApp: (viewerPath: string) => void;
  onOpenViewerPath: (viewerPath: string) => void;
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
  chats: ChatSessionState[];
  activeChatId: string | null;
  appChats: AppChatSummary[];
  activeAppChatId: string | null;
  loadingChats: boolean;
  showAppChats: boolean;
  onSelectChat: (chatId: string) => void;
  onPrefetchChat?: (chatId: string) => void;
  onSelectAppChat: (chat: AppChatSummary) => void;
  onToggleShowAppChats: () => void;
  pickerInjection: ViewerPickerInjection;
}

export function DesktopWorkspaceChatShell({
  activeChat,
  activeAppChat = null,
  selectedViewerPath,
  selectedViewerUrl,
  selectedWorkspaceEntry,
  workspaceApps,
  workspaceEntries,
  fileViewerText,
  fileViewerError,
  isLoadingFileViewer,
  viewerRefreshKey,
  onSelectElement,
  onRefreshViewer,
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
  onRetryLastMessage,
  onStopChat,
  onClearError,
  chats,
  activeChatId,
  appChats,
  activeAppChatId,
  loadingChats,
  showAppChats,
  onSelectChat,
  onPrefetchChat,
  onSelectAppChat,
  onToggleShowAppChats,
  pickerInjection,
}: DesktopWorkspaceChatShellProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "lilo:workspace-chat-split",
    panelIds: ["viewer", "chat"],
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  });

  return (
    <Group
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="hidden min-h-0 min-w-0 flex-1 md:flex"
    >
      <Panel
        id="viewer"
        defaultSize="65%"
        minSize="30%"
        className="relative z-0 flex min-h-0 min-w-0"
      >
        <ViewerPane
          selectedViewerPath={selectedViewerPath}
          selectedViewerUrl={selectedViewerUrl}
          selectedEntry={selectedWorkspaceEntry}
          workspaceEntries={workspaceEntries}
          fileViewerText={fileViewerText}
          fileViewerError={fileViewerError}
          isLoadingFileViewer={isLoadingFileViewer}
          viewerRefreshKey={viewerRefreshKey}
          onSelectElement={onSelectElement}
          onOpenViewerPath={onOpenViewerPath}
          onRefresh={onRefreshViewer}
          pickerInjection={pickerInjection}
        />
      </Panel>

      <Separator className="group relative flex w-1.5 shrink-0 items-center justify-center bg-neutral-100 outline-none transition-colors hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 data-[resize-handle-state=drag]:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:focus-visible:ring-blue-500 dark:data-[resize-handle-state=drag]:bg-neutral-600">
        <div className="absolute inset-y-0 -left-1.5 -right-1.5 z-10 cursor-col-resize" />
        <div
          aria-hidden
          className="pointer-events-none flex h-8 w-1 flex-col items-center justify-center gap-0.5 rounded-full bg-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100 dark:bg-neutral-500"
        >
          <span className="block h-1 w-1 rounded-full bg-white/80 dark:bg-neutral-900/60" />
          <span className="block h-1 w-1 rounded-full bg-white/80 dark:bg-neutral-900/60" />
          <span className="block h-1 w-1 rounded-full bg-white/80 dark:bg-neutral-900/60" />
        </div>
      </Separator>

      <Panel
        id="chat"
        defaultSize="35%"
        minSize="20%"
        maxSize="60%"
        className="relative z-20 flex min-h-0"
      >
        {activeAppChat ? (
          <AppChatPane
            chat={activeAppChat}
            mobile={false}
            workspaceApps={workspaceApps}
            onBackToChatList={onToggleShowAppChats}
            onOpenViewerApp={onOpenViewerApp}
          />
        ) : (
          <ChatPane
            chat={activeChat}
            viewerPath={selectedViewerPath}
            mobile={false}
            workspaceApps={workspaceApps}
            onOpenViewerApp={onOpenViewerApp}
            viewerPicker={{
              isSelectingElement: pickerInjection.isSelectingElement,
              canPickElements: pickerInjection.canPickElements,
              pickerError: pickerInjection.pickerError,
              onToggleSelecting: pickerInjection.toggleSelecting,
            }}
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
            history={{
              chats,
              appChats,
              activeChatId,
              activeAppChatId,
              loadingChats,
              showAppChats,
              onSelectChat,
              onPrefetchChat,
              onSelectAppChat,
              onToggleShowAppChats,
            }}
          />
        )}
      </Panel>
    </Group>
  );
}
