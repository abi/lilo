import type { ClipboardEventHandler } from "react";
import type { ChatMessage } from "../../../store/chatStore";
import { getFileAttachments, getImageAttachments, getSelectedElementAttachments } from "../lib/attachments";
import { FileAttachmentChip } from "./FileAttachmentChip";
import { SelectedElementAttachmentChip } from "./SelectedElementAttachmentChip";
import { UserMessageContent } from "./UserMessageContent";

interface ChatMessageContentProps {
  message: ChatMessage;
  onCopyAssistantMessage?: ClipboardEventHandler<HTMLDivElement>;
  onImageClick?: (src: string) => void;
}

export function ChatMessageContent({
  message,
  onCopyAssistantMessage,
  onImageClick,
}: ChatMessageContentProps) {
  const isUser = message.role === "user";
  const isSystemError = message.role === "system" && message.isError;
  const hasContext = isUser && /<additional_context>/.test(message.content ?? "");
  const imageAttachments = getImageAttachments(message.attachments);
  const fileAttachments = isUser ? getFileAttachments(message) : [];
  const selectedElementAttachments = isUser ? getSelectedElementAttachments(message) : [];

  return (
    <div className={isUser ? "flex w-full flex-col items-end" : ""}>
      <div
        className={
          isSystemError
            ? "max-w-2xl overflow-x-auto rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 md:text-base"
            : isUser
              ? "max-w-[80%] break-words rounded-2xl bg-neutral-950 px-4 py-2.5 text-base leading-relaxed text-white sm:max-w-[65%] md:text-base dark:bg-neutral-100 dark:text-neutral-900"
              : "min-w-0 max-w-none overflow-x-auto text-base leading-relaxed text-neutral-800 dark:text-neutral-200 md:text-base"
        }
        onCopy={!isUser ? onCopyAssistantMessage : undefined}
      >
        {message.content ? (
          <UserMessageContent message={message} hasContext={hasContext} />
        ) : null}

        {isUser && imageAttachments.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {imageAttachments.map((attachment) => (
              <img
                key={`${message.id}-${attachment.previewUrl}`}
                src={attachment.previewUrl}
                alt={attachment.name}
                className="max-h-36 w-full cursor-pointer rounded border border-white/20 object-cover transition hover:opacity-80"
                onClick={() => onImageClick?.(attachment.previewUrl)}
              />
            ))}
          </div>
        ) : null}

        {isUser && selectedElementAttachments.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedElementAttachments.map((attachment, index) => (
              <SelectedElementAttachmentChip
                key={`${message.id}-${attachment.label ?? attachment.name}-${index}`}
                attachment={attachment}
                onPreviewClick={attachment.previewUrl ? onImageClick : undefined}
              />
            ))}
          </div>
        ) : null}

        {isUser && fileAttachments.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {fileAttachments.map((attachment, index) => (
              <FileAttachmentChip
                key={`${message.id}-${attachment.name}-${index}`}
                attachment={attachment}
              />
            ))}
          </div>
        ) : null}

        {!message.content &&
        (!isUser ||
          (imageAttachments.length === 0 &&
            selectedElementAttachments.length === 0 &&
            fileAttachments.length === 0))
          ? "..."
          : null}
      </div>
    </div>
  );
}
