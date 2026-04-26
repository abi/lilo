import { useEffect, useRef, useState } from "react";
import type { ChatSessionState } from "../../../store/chatStore";
import type { AppChatSummary } from "../../../hooks/useAppChats";
import { ChatList } from "../ChatList";

interface ChatHistoryDropdownProps {
  chats: ChatSessionState[];
  appChats: AppChatSummary[];
  activeChatId: string | null;
  activeAppChatId: string | null;
  loadingChats: boolean;
  showAppChats: boolean;
  onSelectChat: (chatId: string) => void;
  onPrefetchChat?: (chatId: string) => void;
  onSelectAppChat: (chat: AppChatSummary) => void;
  onToggleShowAppChats: () => void;
}

export function ChatHistoryDropdown({
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
}: ChatHistoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const handleSelectChat = (chatId: string) => {
    setIsOpen(false);
    onSelectChat(chatId);
  };

  const handleSelectAppChat = (chat: AppChatSummary) => {
    setIsOpen(false);
    onSelectAppChat(chat);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        title="Chat history"
        aria-label="Chat history"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-white"
      >
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-30 mt-2 flex max-h-[75vh] w-96 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-white/5">
          <div role="tablist" className="flex shrink-0 items-center gap-1 border-b border-neutral-200 px-2 pt-2 dark:border-neutral-700">
            <button
              type="button"
              role="tab"
              aria-selected={!showAppChats}
              onClick={() => {
                if (showAppChats) onToggleShowAppChats();
              }}
              className={`relative flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-medium transition ${
                !showAppChats
                  ? "text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              Chats
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                !showAppChats
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              }`}>
                {chats.filter((c) => c.messageCount > 0).length}
              </span>
              {!showAppChats ? (
                <span className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showAppChats}
              onClick={() => {
                if (!showAppChats) onToggleShowAppChats();
              }}
              className={`relative flex items-center gap-2 rounded-t-md px-3 py-2 text-sm font-medium transition ${
                showAppChats
                  ? "text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              App Chats
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                showAppChats
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              }`}>
                {appChats.length}
              </span>
              {showAppChats ? (
                <span className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
              ) : null}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <ChatList
              chats={chats}
              appChats={appChats}
              showAppChats={showAppChats}
              activeChatId={activeChatId}
              activeAppChatId={activeAppChatId}
              loading={loadingChats}
              onSelectChat={handleSelectChat}
              onPrefetchChat={onPrefetchChat}
              onSelectAppChat={handleSelectAppChat}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
