interface NewChatButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * Shared "+ New Chat" pill. Used by the mobile chat-list screen and the
 * mobile chat header so the primary "create a chat" CTA stays visually
 * consistent across surfaces.
 */
export function NewChatButton({ onClick, className }: NewChatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="New Chat"
      aria-label="New Chat"
      className={`flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition active:bg-indigo-700 dark:bg-indigo-500 dark:active:bg-indigo-600${
        className ? ` ${className}` : ""
      }`}
    >
      <svg
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="whitespace-nowrap">New Chat</span>
    </button>
  );
}
