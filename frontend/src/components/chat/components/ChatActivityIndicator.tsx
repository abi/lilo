interface ChatActivityIndicatorProps {
  isThinking: boolean;
  isWorking: boolean;
}

export function ChatActivityIndicator({
  isThinking,
  isWorking,
}: ChatActivityIndicatorProps) {
  if (!isThinking && !isWorking) {
    return null;
  }

  return (
    <div className="mt-4 rounded-2xl bg-neutral-100 px-5 py-4 dark:bg-neutral-800">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 dark:bg-neutral-100">
          <svg
            className="h-4 w-4 animate-spin text-white dark:text-neutral-900"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {isThinking ? "Thinking..." : "Working..."}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {isThinking ? "Reasoning about your request" : "Making changes"}
          </span>
        </div>
      </div>
    </div>
  );
}
