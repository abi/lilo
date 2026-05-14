import type {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEvent,
  KeyboardEventHandler,
  RefObject,
} from "react";
import { useEffect, useState } from "react";
import type {
  ChatElementSelection,
  ChatModelId,
  ChatModelProvider,
  ChatQueuedMessage,
} from "../../../store/chatStore";
import { FileAttachmentChip } from "./FileAttachmentChip";
import { ChatModelSelect } from "./ChatModelSelect";
import {
  ComposerAttachmentPreviewDialog,
  type ComposerAttachmentPreview,
} from "./ComposerAttachmentPreviewDialog";
import { QueuedMessagesPanel } from "./QueuedMessagesPanel";
import { SelectedElementAttachmentChip } from "./SelectedElementAttachmentChip";
import { toChatModelOption } from "../modelOptions";
import type { WorkspaceSkill } from "../../workspace/types";

type SlashSkillToken = {
  start: number;
  end: number;
  query: string;
  key: string;
};

function getSlashSkillToken(draft: string, cursorPosition: number): SlashSkillToken | null {
  const prefix = draft.slice(0, cursorPosition);
  const match = /(?:^|\s)(\/[^\s/]*)$/.exec(prefix);
  if (!match) {
    return null;
  }

  const token = match[1];
  const start = prefix.length - token.length;
  const suffixTokenLength = /^[^\s]*/.exec(draft.slice(cursorPosition))?.[0].length ?? 0;
  const end = cursorPosition + suffixTokenLength;
  const query = token.slice(1);

  return {
    start,
    end,
    query,
    key: `${start}:${end}:${query}`,
  };
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  const clamped = Math.min(textarea.scrollHeight, 384);
  textarea.style.height = `${clamped}px`;
  textarea.style.overflowY = textarea.scrollHeight > 384 ? "auto" : "hidden";
}

const TEXT_PREVIEW_BYTE_LIMIT = 200_000;

const TEXT_FILE_EXTENSIONS = new Set([
  "css",
  "csv",
  "html",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mjs",
  "py",
  "sh",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"] as const;
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
};

const getFileExtension = (name: string): string =>
  name.split(".").pop()?.toLowerCase() ?? "";

const isTextLikeFile = (file: File): boolean =>
  file.type.startsWith("text/") ||
  file.type === "application/json" ||
  file.type === "application/xml" ||
  TEXT_FILE_EXTENSIONS.has(getFileExtension(file.name));

const isPdfFile = (file: File): boolean =>
  file.type === "application/pdf" || getFileExtension(file.name) === "pdf";

interface ChatComposerProps {
  chatId: string;
  draft: string;
  draftSelectedElements: ChatElementSelection[];
  queuedMessages: ChatQueuedMessage[];
  isQueuePaused: boolean;
  selectedFiles: File[];
  workspaceSkills?: WorkspaceSkill[];
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
  onSetDraft: (chatId: string, draft: string) => void;
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
  workspaceSkills = [],
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
  onSetDraft,
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
  const [modelChangeError, setModelChangeError] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] =
    useState<ComposerAttachmentPreview | null>(null);
  const [filePreviewUrls, setFilePreviewUrls] = useState<Map<File, string>>(
    () => new Map(),
  );
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const [dismissedSkillTokenKey, setDismissedSkillTokenKey] = useState<string | null>(null);
  const hasComposerContent =
    draft.trim().length > 0 ||
    selectedFiles.length > 0 ||
    draftSelectedElements.length > 0;

  const currentModelLabel = toChatModelOption({ provider: modelProvider, modelId })?.label ?? "the previous model";

  useEffect(() => {
    const urls = new Map<File, string>();
    selectedFiles.forEach((file) => {
      urls.set(file, URL.createObjectURL(file));
    });
    setFilePreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  const previewSelectedElement = (selectedElement: ChatElementSelection) => {
    setAttachmentPreview({
      kind: "text",
      title: selectedElement.label,
      subtitle: `Selected <${selectedElement.tagName}> element`,
      content: [
        selectedElement.textPreview,
        selectedElement.html ? `\n\nHTML\n${selectedElement.html}` : "",
      ].join(""),
    });
  };

  const previewFile = async (file: File) => {
    const previewUrl = filePreviewUrls.get(file);
    if (!previewUrl) {
      return;
    }

    const subtitle = `${file.type || "application/octet-stream"} · ${formatFileSize(file.size)}`;

    if (isPdfFile(file)) {
      setAttachmentPreview({
        kind: "pdf",
        title: file.name,
        subtitle,
        src: previewUrl,
      });
      return;
    }

    if (file.type.startsWith("image/")) {
      setAttachmentPreview({
        kind: "image",
        title: file.name,
        subtitle,
        src: previewUrl,
      });
      return;
    }

    if (isTextLikeFile(file)) {
      const isTruncated = file.size > TEXT_PREVIEW_BYTE_LIMIT;
      const content = await file.slice(0, TEXT_PREVIEW_BYTE_LIMIT).text();
      setAttachmentPreview({
        kind: "text",
        title: file.name,
        subtitle,
        content,
        isTruncated,
      });
      return;
    }

    setAttachmentPreview({
      kind: "file",
      title: file.name,
      subtitle,
      src: previewUrl,
      type: file.type || "application/octet-stream",
    });
  };

  const textarea = inputRef.current;
  const cursorPosition = textarea?.selectionStart ?? draft.length;
  const slashToken = getSlashSkillToken(draft, cursorPosition);
  const skillSuggestions = slashToken
    ? workspaceSkills
        .filter((skill) => {
          const query = slashToken.query.toLowerCase();
          if (!query) {
            return true;
          }

          return (
            skill.name.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query)
          );
        })
        .slice(0, 6)
    : [];
  const isSkillMenuOpen =
    Boolean(slashToken) &&
    skillSuggestions.length > 0 &&
    slashToken?.key !== dismissedSkillTokenKey;
  const selectedSkillIndex = Math.min(activeSkillIndex, Math.max(skillSuggestions.length - 1, 0));

  const handleModelChange = async (
    modelSelection: {
      provider: ChatModelProvider;
      modelId: ChatModelId;
    },
  ) => {
    setModelChangeError(null);

    try {
      await onUpdateModel(chatId, {
        modelProvider: modelSelection.provider,
        modelId: modelSelection.modelId,
      });
    } catch {
      setModelChangeError(`Couldn't change model. Reverted to ${currentModelLabel}.`);
    }
  };

  const insertSkillMention = (skill: WorkspaceSkill) => {
    if (!slashToken) {
      return;
    }

    const mention = `/${skill.name} `;
    const nextDraft = `${draft.slice(0, slashToken.start)}${mention}${draft.slice(slashToken.end)}`;
    const nextCursorPosition = slashToken.start + mention.length;

    onSetDraft(chatId, nextDraft);
    setActiveSkillIndex(0);
    setDismissedSkillTokenKey(
      `${slashToken.start}:${slashToken.start + `/${skill.name}`.length}:${skill.name}`,
    );

    requestAnimationFrame(() => {
      const nextTextarea = inputRef.current;
      if (!nextTextarea) {
        return;
      }

      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
      resizeTextarea(nextTextarea);
    });
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSkillMenuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSkillIndex((index) => (index + 1) % skillSuggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSkillIndex(
          (index) => (index - 1 + skillSuggestions.length) % skillSuggestions.length,
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertSkillMention(skillSuggestions[selectedSkillIndex]);
        return;
      }

      if (event.key === "Escape" && slashToken) {
        event.preventDefault();
        setDismissedSkillTokenKey(slashToken.key);
        return;
      }
    }

    if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") {
      setActiveSkillIndex(0);
      setDismissedSkillTokenKey(null);
    }

    onInputKeyDown(event);
  };

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

        {modelChangeError ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-1.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
          >
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="min-w-0 flex-1">{modelChangeError}</span>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-amber-700 transition hover:bg-amber-100 hover:text-amber-950 dark:text-amber-300 dark:hover:bg-amber-900/60 dark:hover:text-amber-100"
              onClick={() => setModelChangeError(null)}
              title="Dismiss"
              aria-label="Dismiss model change notice"
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

        {isSkillMenuOpen && slashToken ? (
          <div className="mb-1.5 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <div className="border-b border-neutral-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
              Skills
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {skillSuggestions.map((skill, index) => (
                <button
                  key={skill.name}
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    index === selectedSkillIndex
                      ? "bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950"
                      : "text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertSkillMention(skill);
                  }}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
                      index === selectedSkillIndex
                        ? "bg-white/15 text-white dark:bg-neutral-950/10 dark:text-neutral-950"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    }`}
                  >
                    /
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      /{skill.name}
                    </span>
                    <span
                      className={`mt-0.5 line-clamp-2 block text-xs ${
                        index === selectedSkillIndex
                          ? "text-white/70 dark:text-neutral-950/60"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {skill.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
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
                  onOpen={() => previewSelectedElement(selectedElement)}
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
                    previewUrl: filePreviewUrls.get(file) ?? "",
                    kind: file.type.startsWith("image/") ? "image" : "file",
                  }}
                  onOpen={() => {
                    void previewFile(file);
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
            onKeyDown={handleTextareaKeyDown}
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
                onChange={(modelSelection) => void handleModelChange(modelSelection)}
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

      <ComposerAttachmentPreviewDialog
        preview={attachmentPreview}
        onClose={() => setAttachmentPreview(null)}
      />
    </div>
  );
}
