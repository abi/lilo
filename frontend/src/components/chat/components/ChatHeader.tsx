import type { ChatSessionState } from "../../../store/chatStore";
import type { AppChatSummary } from "../../../hooks/useAppChats";
import { ChannelStatusButton } from "./ChannelStatusButton";
import { ChatHistoryDropdown } from "./ChatHistoryDropdown";
import { NewChatButton } from "./NewChatButton";
import { TruncatedTitle } from "./TruncatedTitle";

interface ChatHeaderProps {
  title: string;
  mobile?: boolean;
  isBusy: boolean;
  hasError: boolean;
  headerStatusText: string;
  onBackToChatList?: () => void;
  onNewChat?: () => void;
  history?: {
    chats: ChatSessionState[];
    appChats: AppChatSummary[];
    activeChatId: string | null;
    activeAppChatId: string | null;
    loadingChats: boolean;
    showAppChats: boolean;
    onSelectChat: (chatId: string) => void;
    onSelectAppChat: (chat: AppChatSummary) => void;
    onToggleShowAppChats: () => void;
  };
}

export function ChatHeader({
  title,
  mobile = false,
  isBusy,
  hasError,
  headerStatusText,
  onBackToChatList,
  onNewChat,
  history,
}: ChatHeaderProps) {
  const showStatus = headerStatusText !== "Ready";

  if (mobile) {
    return (
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-2 py-2 dark:border-neutral-700">
        <div className="flex min-w-0 items-center gap-1">
          {onBackToChatList ? (
            <button
              type="button"
              onClick={onBackToChatList}
              className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-600 transition active:bg-neutral-100 dark:text-neutral-300 dark:active:bg-neutral-800"
              title="All chats"
              aria-label="Back to all chats"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          ) : null}
          <div className="min-w-0 px-1">
            <h2 className="truncate font-heading text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {title}
            </h2>
            {showStatus ? <StatusLine isBusy={isBusy} hasError={hasError} text={headerStatusText} /> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ChannelStatusButton />
          {onNewChat ? <NewChatButton onClick={onNewChat} /> : null}
        </div>
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-1.5 border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onBackToChatList ? (
            <button
              type="button"
              onClick={onBackToChatList}
              title="Back to chats"
              aria-label="Back to chats"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>Chats</span>
            </button>
          ) : null}
          {showStatus ? (
            <StatusBadge isBusy={isBusy} hasError={hasError} text={headerStatusText} />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ChannelStatusButton />
          {history ? (
            <ChatHistoryDropdown
              chats={history.chats}
              appChats={history.appChats}
              activeChatId={history.activeChatId}
              activeAppChatId={history.activeAppChatId}
              loadingChats={history.loadingChats}
              showAppChats={history.showAppChats}
              onSelectChat={history.onSelectChat}
              onSelectAppChat={history.onSelectAppChat}
              onToggleShowAppChats={history.onToggleShowAppChats}
            />
          ) : null}
          {onNewChat ? (
            <button
              type="button"
              onClick={onNewChat}
              title="New Chat"
              aria-label="New Chat"
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
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      <TruncatedTitle
        text={title}
        className="line-clamp-2 font-heading text-base font-semibold leading-snug text-neutral-900 dark:text-neutral-100"
      />
    </header>
  );
}

interface StatusProps {
  isBusy: boolean;
  hasError: boolean;
  text: string;
}

function StatusBadge({ isBusy, hasError, text }: StatusProps) {
  const color = hasError
    ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
    : isBusy
      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400"
      : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400";

  const dot = hasError
    ? "bg-red-500"
    : isBusy
      ? "animate-pulse bg-green-500"
      : "bg-neutral-400";

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-xs font-medium ${color}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{text}</span>
    </span>
  );
}

function StatusLine({ isBusy, hasError, text }: StatusProps) {
  const className = hasError
    ? "text-red-500 dark:text-red-400"
    : isBusy
      ? "flex items-center gap-1.5 text-green-600 dark:text-green-400"
      : "text-neutral-400";

  return (
    <p className={`text-xs ${className}`}>
      {isBusy && !hasError ? (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
      ) : null}
      {text}
    </p>
  );
}
