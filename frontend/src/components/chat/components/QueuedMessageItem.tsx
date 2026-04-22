import type { DragEvent } from "react";
import { useEffect, useState } from "react";
import type { ChatQueuedMessage } from "../../../store/chatStore";

interface QueuedMessageItemProps {
  queuedMessage: ChatQueuedMessage;
  isEditing: boolean;
  showSendAction: boolean;
  isDropTarget: boolean;
  onStartEditing: (queuedMessageId: string) => void;
  onCancelEditing: () => void;
  onSaveEditing: (queuedMessageId: string, message: string) => void;
  onRemove: (queuedMessageId: string) => void;
  onSend: (queuedMessageId: string) => Promise<void>;
  onDragStart: (queuedMessageId: string) => void;
  onDragEnd: () => void;
  onDragOverItem: (queuedMessageId: string) => void;
  onDropOnItem: (queuedMessageId: string) => void;
}

const summarizeQueuedMessage = (queuedMessage: ChatQueuedMessage): string[] => {
  const summary: string[] = [];

  if (queuedMessage.selectedElements.length > 0) {
    const [firstElement] = queuedMessage.selectedElements;
    summary.push(`@${firstElement.label}`);
    if (queuedMessage.selectedElements.length > 1) {
      summary.push(`+${queuedMessage.selectedElements.length - 1} elements`);
    }
  }

  if (queuedMessage.files.length > 0) {
    summary.push(
      queuedMessage.files.length === 1
        ? queuedMessage.files[0].name
        : `${queuedMessage.files.length} images`,
    );
  }

  if (queuedMessage.message.trim().length > 0) {
    summary.push(queuedMessage.message.trim());
  }

  return summary;
};

export function QueuedMessageItem({
  queuedMessage,
  isEditing,
  showSendAction,
  isDropTarget,
  onStartEditing,
  onCancelEditing,
  onSaveEditing,
  onRemove,
  onSend,
  onDragStart,
  onDragEnd,
  onDragOverItem,
  onDropOnItem,
}: QueuedMessageItemProps) {
  const [draftMessage, setDraftMessage] = useState(queuedMessage.message);

  useEffect(() => {
    if (!isEditing) {
      setDraftMessage(queuedMessage.message);
    }
  }, [isEditing, queuedMessage.message]);

  const summary = summarizeQueuedMessage(queuedMessage);
  const canSave =
    draftMessage.trim().length > 0 ||
    queuedMessage.files.length > 0 ||
    queuedMessage.selectedElements.length > 0;

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isEditing) {
      return;
    }
    onDragOverItem(queuedMessage.id);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isEditing) {
      return;
    }
    onDropOnItem(queuedMessage.id);
  };

  return (
    <div
      className={`rounded-lg border px-2 py-1 transition ${
        isDropTarget
          ? "border-neutral-400 bg-neutral-100/90 dark:border-neutral-500 dark:bg-neutral-700/80"
          : "border-neutral-200 bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-800/80"
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isEditing ? (
        <div className="space-y-1">
          <textarea
            className="min-h-16 w-full resize-none rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500"
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            placeholder="Edit queued message..."
            rows={2}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
              onClick={onCancelEditing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-neutral-950 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
              onClick={() => onSaveEditing(queuedMessage.id, draftMessage)}
              disabled={!canSave}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", queuedMessage.id);
              onDragStart(queuedMessage.id);
            }}
            onDragEnd={onDragEnd}
            className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-400 transition hover:border-neutral-300 hover:text-neutral-700 active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
            title="Drag to reorder"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="6" r="1" />
              <circle cx="15" cy="6" r="1" />
              <circle cx="9" cy="12" r="1" />
              <circle cx="15" cy="12" r="1" />
              <circle cx="9" cy="18" r="1" />
              <circle cx="15" cy="18" r="1" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] leading-4 text-neutral-700 dark:text-neutral-200">
              {summary.length > 0 ? summary.join(" · ") : "Queued follow-up"}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {showSendAction ? (
              <button
                type="button"
                className="rounded-md p-0.5 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                onClick={() => void onSend(queuedMessage.id)}
                title="Send queued message"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 14-7-4 7 4 7-14-7Z" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md p-0.5 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
              onClick={() => onStartEditing(queuedMessage.id)}
              title="Edit queued message"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              type="button"
              className="rounded-md p-0.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-300"
              onClick={() => onRemove(queuedMessage.id)}
              title="Delete queued message"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
