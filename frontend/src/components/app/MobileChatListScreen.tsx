import type { ChatSessionState } from "../../store/chatStore";
import { ChatList } from "../chat/ChatList";
import { NewChatButton } from "../chat/components/NewChatButton";

interface MobileChatListScreenProps {
  chats: ChatSessionState[];
  activeChatId: string | null;
  loading: boolean;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  onPrefetchChat?: (chatId: string) => void;
}

export function MobileChatListScreen({
  chats,
  activeChatId,
  loading,
  onCreateChat,
  onSelectChat,
  onPrefetchChat,
}: MobileChatListScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900 md:hidden">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div>
          <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
            Chats
          </h2>
        </div>
        <NewChatButton onClick={onCreateChat} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ChatList
          chats={chats}
          activeChatId={activeChatId}
          loading={loading}
          variant="mobile"
          onSelectChat={onSelectChat}
          onPrefetchChat={onPrefetchChat}
        />
      </div>
    </div>
  );
}
