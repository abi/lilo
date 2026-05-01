import { useEffect, useMemo, useState } from "react";
import type { ChatSessionState } from "../../store/chatStore";
import type { WorkspaceEntry } from "../workspace/types";
import { ChatHeader } from "./components/ChatHeader";
import { ChatMessageList } from "./components/ChatMessageList";
import { useChatScroll } from "./hooks/useChatScroll";
import { groupMessages } from "./lib/messageGroups";
import type { WorkspaceAppViewer } from "./types";

interface AppChatPaneProps {
  chat: ChatSessionState | null;
  mobile?: boolean;
  workspaceApps?: WorkspaceAppViewer[];
  workspaceEntries?: WorkspaceEntry[];
  onBackToChatList?: () => void;
  onOpenViewerApp?: (viewerPath: string) => void;
  onOpenViewerPath?: (viewerPath: string) => void;
}

export function AppChatPane({
  chat,
  mobile = false,
  workspaceApps = [],
  workspaceEntries = [],
  onBackToChatList,
  onOpenViewerApp,
  onOpenViewerPath,
}: AppChatPaneProps) {
  const [submittingQuestionId] = useState<string | null>(null);
  const messageGroups = useMemo(
    () => (chat ? groupMessages(chat.messages) : []),
    [chat?.messages],
  );
  const { chatScrollRef, syncScrollState } = useChatScroll({
    chatId: chat?.id,
    messages: chat?.messages ?? [],
    isThinking: false,
    isWorking: false,
    connectionState: "idle",
  });

  useEffect(() => {
    if (!chat) {
      return;
    }

    console.debug("[app-chat-pane] Rendering app chat", {
      id: chat.id,
      title: chat.title,
      messageCount: chat.messages.length,
      messageGroupCount: messageGroups.length,
      status: chat.status,
      error: chat.error,
    });

    if (chat.messages.length > 0 && messageGroups.length === 0) {
      console.error("[app-chat-pane] App chat has messages but no renderable groups", {
        id: chat.id,
        title: chat.title,
        roles: chat.messages.map((message) => ({
          id: message.id,
          role: message.role,
          toolName: message.toolName,
          hasContent: Boolean(message.content),
          isError: message.isError,
        })),
      });
    }
  }, [chat, messageGroups]);

  if (!chat) {
    return (
      <main className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-white dark:bg-neutral-900">
        <p className="text-sm text-neutral-400">Loading app chat...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-neutral-900">
      <ChatHeader
        title={chat.title}
        mobile={mobile}
        isBusy={false}
        hasError={Boolean(chat.error)}
        headerStatusText={chat.error ? "Needs attention" : "App chat"}
        onBackToChatList={onBackToChatList}
      />
      <ChatMessageList
        chat={chat}
        messageGroups={messageGroups}
        workspaceApps={workspaceApps}
        workspaceEntries={workspaceEntries}
        chatScrollRef={chatScrollRef}
        fullWidth
        canRetry={false}
        isBusy={false}
        submittingQuestionId={submittingQuestionId}
        onScroll={syncScrollState}
        onRetryLastMessage={async () => {}}
        onClearError={() => {}}
        onSubmitQuestionAnswer={() => {}}
        onOpenViewerApp={onOpenViewerApp}
        onOpenViewerPath={onOpenViewerPath ?? onOpenViewerApp}
      />
    </main>
  );
}
