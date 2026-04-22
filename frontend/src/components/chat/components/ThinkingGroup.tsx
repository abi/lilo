import type { ChatMessage } from "../../../store/chatStore";

const ChevronIcon = () => (
  <svg
    className="h-3 w-3 shrink-0 text-neutral-400 transition-transform group-open:rotate-90"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

interface ThinkingGroupProps {
  messages: ChatMessage[];
}

export function ThinkingGroup({ messages }: ThinkingGroupProps) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-400 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700">
        <ChevronIcon />
        <span className="italic">Thinking</span>
      </summary>
      <div className="mt-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
        {messages.map((message) => (
          <pre
            key={message.id}
            className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs italic text-neutral-500 dark:text-neutral-400"
          >
            {message.content}
          </pre>
        ))}
      </div>
    </details>
  );
}
