import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatSessionState } from "../../../store/chatStore";
import type { AppChatSummary } from "../../../hooks/useAppChats";
import { ChatList } from "../ChatList";

const POPOVER_WIDTH = 384;
const POPOVER_MARGIN = 12;
const POPOVER_GAP = 8;

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface ChatHistoryDropdownProps {
  chats: ChatSessionState[];
  appChats: AppChatSummary[];
  activeChatId: string | null;
  activeAppChatId: string | null;
  loadingChats: boolean;
  showAppChats: boolean;
  onSelectChat: (chatId: string) => void;
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
  onSelectAppChat,
  onToggleShowAppChats,
}: ChatHistoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(POPOVER_WIDTH, viewportWidth - POPOVER_MARGIN * 2);
    const left = Math.min(
      Math.max(POPOVER_MARGIN, rect.right - width),
      viewportWidth - width - POPOVER_MARGIN,
    );
    const top = rect.bottom + POPOVER_GAP;
    const maxHeight = Math.max(240, viewportHeight - top - POPOVER_MARGIN);

    setPopoverPosition({ top, left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
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
        ref={triggerRef}
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

      {isOpen && popoverPosition
        ? createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[120] flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-white/5"
              style={{
                top: popoverPosition.top,
                left: popoverPosition.left,
                width: popoverPosition.width,
                maxHeight: popoverPosition.maxHeight,
              }}
            >
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
                  onSelectAppChat={handleSelectAppChat}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
