import { useMemo } from "react";
import type { ChatSessionState } from "../../store/chatStore";
import type { AppChatSummary } from "../../hooks/useAppChats";

interface ChatListProps {
  chats: ChatSessionState[];
  appChats?: AppChatSummary[];
  showAppChats?: boolean;
  activeChatId: string | null;
  activeAppChatId?: string | null;
  loading?: boolean;
  onSelectChat: (chatId: string) => void;
  onSelectAppChat?: (chat: AppChatSummary) => void;
}

type DateGroup = {
  label: string;
  chats: ChatSessionState[];
};

function groupChatsByDate(chats: ChatSessionState[]): DateGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000);

  const groups: Map<string, ChatSessionState[]> = new Map();
  const order: string[] = [];

  for (const chat of chats) {
    const chatDate = new Date(chat.updatedAt);
    let label: string;

    if (chatDate >= todayStart) {
      label = "Today";
    } else if (chatDate >= yesterdayStart) {
      label = "Yesterday";
    } else if (chatDate >= weekStart) {
      label = "This Week";
    } else {
      label = chatDate.toLocaleDateString(undefined, {
        month: "long",
        year: chatDate.getFullYear() === now.getFullYear() ? undefined : "numeric",
      });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    groups.get(label)!.push(chat);
  }

  return order.map((label) => ({ label, chats: groups.get(label)! }));
}

function formatRelativeTime(updatedAt: number | string): string {
  const date = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  if (date >= todayStart) return `${diffHours}h`;

  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  if (date >= yesterdayStart) return "yesterday";

  const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
  if (date >= weekStart) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export function ChatList({
  chats,
  appChats = [],
  showAppChats = false,
  activeChatId,
  activeAppChatId = null,
  loading = false,
  onSelectChat,
  onSelectAppChat,
}: ChatListProps) {
  const visibleChats = useMemo(
    () => chats.filter((chat) => chat.messageCount > 0),
    [chats],
  );
  const groups = useMemo(() => groupChatsByDate(visibleChats), [visibleChats]);

  if (loading) {
    return (
      <div className="px-4 py-4 text-sm text-neutral-400">
        Loading chats...
      </div>
    );
  }

  if (showAppChats) {
    if (appChats.length === 0) {
      return (
        <div className="px-4 py-10 text-center text-sm text-neutral-400">
          No app chats yet.
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-0.5">
        {appChats.map((chat) => {
          const isActive = chat.id === activeAppChatId;
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelectAppChat?.(chat)}
              className={`group relative flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition ${
                isActive
                  ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
              }`}
            >
              {isActive ? (
                <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
              ) : null}
              <span className="mt-0.5 shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                {chat.appName}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug">
                {chat.title}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (visibleChats.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-neutral-400">
        No chats yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.label}>
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.chats.map((chat) => {
              const isActive = chat.id === activeChatId;
              const isBusy =
                chat.status === "streaming" ||
                chat.connectionState === "connecting" ||
                chat.connectionState === "streaming" ||
                chat.isWorking;
              const isError = chat.status === "error";

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className={`group relative flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                      : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
                  }`}
                >
                  {isActive ? (
                    <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                  ) : null}
                  {isError || isBusy ? (
                    <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
                      <span
                        className={`block h-2 w-2 rounded-full ${
                          isError ? "bg-red-500" : "animate-pulse bg-emerald-500"
                        }`}
                      />
                    </span>
                  ) : null}
                  <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug">
                    {chat.title}
                  </span>
                  <span className="mt-0.5 shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                    {formatRelativeTime(chat.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
