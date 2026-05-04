import type { ChatAttachment } from "../../../store/chatStore";

const truncateText = (value: string, maxLength: number): string =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

interface SelectedElementAttachmentChipProps {
  attachment: ChatAttachment;
  onRemove?: () => void;
  onOpen?: () => void;
  onPreviewClick?: (src: string) => void;
}

export function SelectedElementAttachmentChip({
  attachment,
  onRemove,
  onOpen,
  onPreviewClick,
}: SelectedElementAttachmentChipProps) {
  const label = truncateText(
    attachment.label ?? attachment.name ?? `<${attachment.tagName ?? "element"}>`,
    48,
  );
  const subtitle = truncateText(
    attachment.textPreview || `Selected <${attachment.tagName ?? "element"}>`,
    52,
  );
  const canOpen = Boolean(onOpen);

  return (
    <div
      className={`flex max-w-full items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-2 py-2 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-900 ${
        canOpen
          ? "cursor-pointer transition hover:border-neutral-300 hover:bg-neutral-50 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
          : ""
      }`}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }
        event.preventDefault();
        onOpen();
      }}
    >
      {attachment.previewUrl ? (
        <button
          type="button"
          className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
          onClick={(event) => {
            event.stopPropagation();
            if (onPreviewClick) {
              onPreviewClick(attachment.previewUrl);
              return;
            }
            onOpen?.();
          }}
        >
          <img
            src={attachment.previewUrl}
            alt={attachment.label ?? attachment.name}
            className="h-10 w-10 object-cover"
          />
        </button>
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 5h16" />
            <path d="M4 12h16" />
            <path d="M4 19h16" />
          </svg>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-neutral-700 dark:text-neutral-200">
          {label}
        </p>
        <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">
          {subtitle}
        </p>
      </div>
      {canOpen ? (
        <div className="rounded-full p-1 text-neutral-400" aria-hidden>
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </div>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
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
