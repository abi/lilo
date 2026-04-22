import type { ChatAttachment } from "../../../store/chatStore";

interface FileAttachmentChipProps {
  attachment: ChatAttachment;
  onRemove?: () => void;
}

export function FileAttachmentChip({
  attachment,
  onRemove,
}: FileAttachmentChipProps) {
  return (
    <div className="flex max-w-full items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-2.5 py-2 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-neutral-700 dark:text-neutral-200">
          {attachment.name}
        </p>
        <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">
          {attachment.type || "application/octet-stream"}
        </p>
      </div>
      {onRemove ? (
        <button
          type="button"
          className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          onClick={onRemove}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
