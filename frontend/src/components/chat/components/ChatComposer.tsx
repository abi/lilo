import type {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";
import type {
  ChatElementSelection,
  ChatModelId,
  ChatModelProvider,
  ChatQueuedMessage,
} from "../../../store/chatStore";
import { FileAttachmentChip } from "./FileAttachmentChip";
import { ChatModelSelect } from "./ChatModelSelect";
import { QueuedMessagesPanel } from "./QueuedMessagesPanel";
import { SelectedElementAttachmentChip } from "./SelectedElementAttachmentChip";

interface ChatComposerProps {
  chatId: string;
  draft: string;
  draftSelectedElements: ChatElementSelection[];
  queuedMessages: ChatQueuedMessage[];
  isQueuePaused: boolean;
  selectedFiles: File[];
  isBusy: boolean;
  modelProvider: ChatModelProvider;
  modelId: ChatModelId;
  activeQueuedEditId: string | null;
  showScrollToBottom: boolean;
  inputRef: RefObject<HTMLTextAreaElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onInputChange: ChangeEventHandler<HTMLTextAreaElement>;
  onInputKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onSelectFiles: ChangeEventHandler<HTMLInputElement>;
  onStopChat: (chatId: string) => Promise<void>;
  onScrollToBottom: () => void;
  onRemoveSelectedElement: (chatId: string, index: number) => void;
  onClearSelectedElements?: (chatId: string) => void;
  onStartEditingQueuedMessage: (queuedMessageId: string) => void;
  onStopEditingQueuedMessage: () => void;
  onUpdateQueuedMessage: (chatId: string, queuedMessageId: string, message: string) => void;
  onReorderQueuedMessage: (
    chatId: string,
    queuedMessageId: string,
    targetIndex: number,
  ) => void;
  onRemoveQueuedMessage: (chatId: string, queuedMessageId: string) => void;
  onSetQueuePaused: (chatId: string, isPaused: boolean) => void;
  onResumeQueue: (chatId: string) => Promise<void>;
  onSendQueuedMessage: (chatId: string, queuedMessageId: string) => Promise<void>;
  onUpdateModel: (
    chatId: string,
    modelSelection: {
      modelProvider: ChatModelProvider;
      modelId: ChatModelId;
    },
  ) => Promise<void>;
  onPreviewSelectedElement?: (src: string) => void;
  onRemoveSelectedFile: (index: number) => void;
  viewerPicker?: {
    isSelectingElement: boolean;
    canPickElements: boolean;
    pickerError?: string | null;
    onToggleSelecting: () => void;
  };
}

export function ChatComposer({
  chatId,
  draft,
  draftSelectedElements,
  queuedMessages,
  isQueuePaused,
  selectedFiles,
  isBusy,
  modelProvider,
  modelId,
  activeQueuedEditId,
  showScrollToBottom,
  inputRef,
  fileInputRef,
  onSubmit,
  onInputChange,
  onInputKeyDown,
  onSelectFiles,
  onStopChat,
  onScrollToBottom,
  onRemoveSelectedElement,
  onClearSelectedElements,
  onStartEditingQueuedMessage,
  onStopEditingQueuedMessage,
  onUpdateQueuedMessage,
  onReorderQueuedMessage,
  onRemoveQueuedMessage,
  onSetQueuePaused,
  onResumeQueue,
  onSendQueuedMessage,
  onUpdateModel,
  onPreviewSelectedElement,
  onRemoveSelectedFile,
  viewerPicker,
}: ChatComposerProps) {
  const hasComposerContent =
    draft.trim().length > 0 ||
    selectedFiles.length > 0 ||
    draftSelectedElements.length > 0;

  return (
    <div className="relative shrink-0 border-t border-neutral-200 bg-white px-2 py-2 dark:border-neutral-700 dark:bg-neutral-900">
      {showScrollToBottom ? (
        <div className="absolute inset-x-0 -top-10 z-20 flex justify-center">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white shadow-lg transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            onClick={onScrollToBottom}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Scroll to bottom
          </button>
        </div>
      ) : null}

      <QueuedMessagesPanel
        queuedMessages={queuedMessages}
        isQueuePaused={isQueuePaused}
        isBusy={isBusy}
        activeQueuedEditId={activeQueuedEditId}
        onStartEditingQueuedMessage={onStartEditingQueuedMessage}
        onStopEditingQueuedMessage={onStopEditingQueuedMessage}
        onUpdateQueuedMessage={(queuedMessageId, message) =>
          onUpdateQueuedMessage(chatId, queuedMessageId, message)
        }
        onReorderQueuedMessage={(queuedMessageId, targetIndex) =>
          onReorderQueuedMessage(chatId, queuedMessageId, targetIndex)
        }
        onRemoveQueuedMessage={(queuedMessageId) =>
          onRemoveQueuedMessage(chatId, queuedMessageId)
        }
        onSetQueuePaused={(isPaused) => onSetQueuePaused(chatId, isPaused)}
        onResumeQueue={() => onResumeQueue(chatId)}
        onSendQueuedMessage={(queuedMessageId) =>
          onSendQueuedMessage(chatId, queuedMessageId)
        }
      />

      <form className="mx-auto max-w-3xl" onSubmit={onSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onSelectFiles}
        />

        {viewerPicker?.pickerError ? (
          <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <svg
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="min-w-0 flex-1">{viewerPicker.pickerError}</span>
          </div>
        ) : null}

        {viewerPicker?.isSelectingElement ? (
          <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
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
              <path d="M3 3l7.07 17 2.51-7.39L20 10.07z" />
              <path d="m13 13 6 6" />
            </svg>
            <span className="min-w-0 flex-1">
              Hover any element in the viewer, then click to attach it. Press{" "}
              <kbd className="rounded border border-emerald-300 bg-white px-1 font-sans text-[10px] font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                Esc
              </kbd>{" "}
              to cancel.
            </span>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/60 dark:hover:text-emerald-200"
              onClick={viewerPicker.onToggleSelecting}
              title="Cancel"
              aria-label="Cancel element selection"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : null}

        <div className="group rounded-2xl border border-neutral-200 bg-neutral-50 shadow-sm transition focus-within:border-neutral-300 focus-within:bg-white focus-within:shadow-md focus-within:ring-1 focus-within:ring-neutral-300/60 dark:border-neutral-700 dark:bg-neutral-800 dark:focus-within:border-neutral-500 dark:focus-within:bg-neutral-900 dark:focus-within:ring-neutral-600/60">
          {selectedFiles.length > 0 || draftSelectedElements.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b border-neutral-200/70 px-3 pb-2 pt-2.5 dark:border-neutral-700/70">
              {draftSelectedElements.map((selectedElement, index) => (
                <SelectedElementAttachmentChip
                  key={`${selectedElement.label}-${selectedElement.tagName}-${index}`}
                  attachment={{
                    name: selectedElement.label,
                    type: "text/html",
                    previewUrl: selectedElement.previewUrl ?? "",
                    kind: "selected_element",
                    label: selectedElement.label,
                    textPreview: selectedElement.textPreview,
                    html: selectedElement.html,
                    tagName: selectedElement.tagName,
                  }}
                  onPreviewClick={
                    selectedElement.previewUrl ? onPreviewSelectedElement : undefined
                  }
                  onRemove={() => onRemoveSelectedElement(chatId, index)}
                />
              ))}
              {draftSelectedElements.length > 1 && onClearSelectedElements ? (
                <button
                  type="button"
                  className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                  onClick={() => onClearSelectedElements(chatId)}
                >
                  Clear all
                </button>
              ) : null}
              {selectedFiles.map((file, index) => (
                <FileAttachmentChip
                  key={`${file.name}-${index}`}
                  attachment={{
                    name: file.name,
                    type: file.type,
                    previewUrl: "",
                    kind: file.type.startsWith("image/") ? "image" : "file",
                  }}
                  onRemove={() => onRemoveSelectedFile(index)}
                />
              ))}
            </div>
          ) : null}

          <textarea
            ref={inputRef}
            className="block max-h-96 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft}
            onChange={onInputChange}
            onKeyDown={onInputKeyDown}
            rows={1}
            placeholder={isBusy ? "Send follow-up\u2026" : "Chat with Lilo\u2026"}
          />

          <div className="flex items-center justify-between gap-1 px-2 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                title="Attach image"
                aria-label="Attach image"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-200/70 hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.98 8.8l-8.58 8.57a2 2 0 1 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              {viewerPicker ? (
                <button
                  type="button"
                  title={
                    viewerPicker.canPickElements
                      ? viewerPicker.isSelectingElement
                        ? "Cancel element selection"
                        : "Pick an element from the viewer"
                      : "Open an app in the viewer to pick an element"
                  }
                  aria-label="Pick element"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    viewerPicker.isSelectingElement
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                      : "text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                  }`}
                  onClick={viewerPicker.onToggleSelecting}
                  disabled={!viewerPicker.canPickElements}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3 3l7.07 17 2.51-7.39L20 10.07z" />
                    <path d="m13 13 6 6" />
                  </svg>
                </button>
              ) : null}

              <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />

              <ChatModelSelect
                modelProvider={modelProvider}
                modelId={modelId}
                disabled={isBusy}
                onChange={(modelSelection) =>
                  void onUpdateModel(chatId, {
                    modelProvider: modelSelection.provider,
                    modelId: modelSelection.modelId,
                  })
                }
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-[11px] text-neutral-400 sm:inline dark:text-neutral-500">
                <kbd className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium dark:border-neutral-600 dark:bg-neutral-900">
                  {"\u21B5"}
                </kbd>{" "}
                to send
              </span>
              {isBusy && !hasComposerContent ? (
                <button
                  type="button"
                  title="Stop"
                  aria-label="Stop"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700"
                  onClick={() => void onStopChat(chatId)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  title="Send"
                  aria-label="Send"
                  disabled={!hasComposerContent}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 19V5" />
                    <path d="m5 12 7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
