import { useState } from "react";
import type { ChatQueuedMessage } from "../../../store/chatStore";
import { QueuedMessageItem } from "./QueuedMessageItem";

interface QueuedMessagesPanelProps {
  queuedMessages: ChatQueuedMessage[];
  isQueuePaused: boolean;
  isBusy: boolean;
  activeQueuedEditId: string | null;
  onStartEditingQueuedMessage: (queuedMessageId: string) => void;
  onStopEditingQueuedMessage: () => void;
  onUpdateQueuedMessage: (queuedMessageId: string, message: string) => void;
  onReorderQueuedMessage: (queuedMessageId: string, targetIndex: number) => void;
  onRemoveQueuedMessage: (queuedMessageId: string) => void;
  onSetQueuePaused: (isPaused: boolean) => void;
  onResumeQueue: () => Promise<void>;
  onSendQueuedMessage: (queuedMessageId: string) => Promise<void>;
}

export function QueuedMessagesPanel({
  queuedMessages,
  isQueuePaused,
  isBusy,
  activeQueuedEditId,
  onStartEditingQueuedMessage,
  onStopEditingQueuedMessage,
  onUpdateQueuedMessage,
  onReorderQueuedMessage,
  onRemoveQueuedMessage,
  onSetQueuePaused,
  onResumeQueue,
  onSendQueuedMessage,
}: QueuedMessagesPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedQueuedMessageId, setDraggedQueuedMessageId] = useState<string | null>(null);
  const [dropTargetQueuedMessageId, setDropTargetQueuedMessageId] = useState<string | null>(null);

  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto mb-2 max-w-3xl rounded-2xl border border-neutral-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs leading-none text-neutral-500 dark:text-neutral-400">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {queuedMessages.length}
            </span>{" "}
            Queued
          </p>
          <button
            type="button"
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
              isQueuePaused
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:border-amber-700 dark:hover:bg-amber-950/60"
                : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
            }`}
            onClick={() => {
              if (isQueuePaused) {
                void onResumeQueue();
                return;
              }
              onSetQueuePaused(true);
            }}
            title={isQueuePaused ? "Resume automatic queue send" : "Pause automatic queue send"}
          >
            {isQueuePaused ? "Resume auto" : "Pause auto"}
          </button>
        </div>
        <button
          type="button"
          className="rounded-full border border-neutral-200 bg-neutral-50 p-1 text-neutral-400 transition hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
          onClick={() => setIsCollapsed((current) => !current)}
          title={isCollapsed ? "Expand queue" : "Collapse queue"}
        >
          <svg
            className={`h-3 w-3 transition ${isCollapsed ? "" : "rotate-180"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {!isCollapsed ? (
        <div className="mt-1.5 space-y-1">
          {queuedMessages.map((queuedMessage) => (
            <QueuedMessageItem
              key={queuedMessage.id}
              queuedMessage={queuedMessage}
              isEditing={activeQueuedEditId === queuedMessage.id}
              showSendAction={isQueuePaused && !isBusy}
              isDropTarget={
                dropTargetQueuedMessageId === queuedMessage.id &&
                draggedQueuedMessageId !== queuedMessage.id
              }
              onStartEditing={onStartEditingQueuedMessage}
              onCancelEditing={onStopEditingQueuedMessage}
              onSaveEditing={(queuedMessageId, message) => {
                onUpdateQueuedMessage(queuedMessageId, message);
                onStopEditingQueuedMessage();
              }}
              onRemove={(queuedMessageId) => {
                if (activeQueuedEditId === queuedMessageId) {
                  onStopEditingQueuedMessage();
                }
                onRemoveQueuedMessage(queuedMessageId);
              }}
              onSend={async (queuedMessageId) => {
                if (activeQueuedEditId === queuedMessageId) {
                  onStopEditingQueuedMessage();
                }
                await onSendQueuedMessage(queuedMessageId);
              }}
              onDragStart={(queuedMessageId) => {
                setDraggedQueuedMessageId(queuedMessageId);
                setDropTargetQueuedMessageId(queuedMessageId);
              }}
              onDragEnd={() => {
                setDraggedQueuedMessageId(null);
                setDropTargetQueuedMessageId(null);
              }}
              onDragOverItem={(queuedMessageId) => setDropTargetQueuedMessageId(queuedMessageId)}
              onDropOnItem={(queuedMessageId) => {
                if (!draggedQueuedMessageId || draggedQueuedMessageId === queuedMessageId) {
                  setDraggedQueuedMessageId(null);
                  setDropTargetQueuedMessageId(null);
                  return;
                }

                const targetIndex = queuedMessages.findIndex(
                  (entry) => entry.id === queuedMessageId,
                );
                if (targetIndex !== -1) {
                  onReorderQueuedMessage(draggedQueuedMessageId, targetIndex);
                }
                setDraggedQueuedMessageId(null);
                setDropTargetQueuedMessageId(null);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
