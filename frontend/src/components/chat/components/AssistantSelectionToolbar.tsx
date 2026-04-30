interface AssistantSelectionToolbarProps {
  position: {
    left: number;
    top: number;
  };
  onAddToChat: () => void;
}

export function AssistantSelectionToolbar({
  position,
  onAddToChat,
}: AssistantSelectionToolbarProps) {
  return (
    <div
      className="fixed z-[80]"
      style={{
        left: position.left,
        top: position.top,
      }}
    >
      <button
        type="button"
        className="flex items-center gap-2 rounded-full bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white shadow-xl ring-1 ring-white/10 transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onAddToChat}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        Add to chat
      </button>
    </div>
  );
}
