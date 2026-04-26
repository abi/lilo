import type { ChatSessionState } from "../../store/chatStore";
import { ChatList } from "../chat/ChatList";

interface MobileChatListScreenProps {
  chats: ChatSessionState[];
  activeChatId: string | null;
  loading: boolean;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
}

export function MobileChatListScreen({
  chats,
  activeChatId,
  loading,
  onCreateChat,
  onSelectChat,
}: MobileChatListScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900 md:hidden">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div>
          <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
            Chats
          </h2>
        </div>
        <button
          type="button"
          onClick={onCreateChat}
          className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition active:bg-indigo-700 dark:bg-indigo-500 dark:active:bg-indigo-600"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ChatList
          chats={chats}
          activeChatId={activeChatId}
          loading={loading}
          variant="mobile"
          onSelectChat={onSelectChat}
        />
      </div>
    </div>
  );
}
