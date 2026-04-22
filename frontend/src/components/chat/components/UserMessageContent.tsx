import { useState } from "react";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import type { ChatMessage } from "../../../store/chatStore";
import { PromptLightbox } from "./PromptLightbox";

interface UserMessageContentProps {
  message: ChatMessage;
  hasContext: boolean;
}

export function UserMessageContent({
  message,
  hasContext,
}: UserMessageContentProps) {
  const [tapped, setTapped] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const strippedContent = (message.content ?? "")
    .replace(/\s*<additional_context>[\s\S]*?<\/additional_context>/g, "")
    .replace(/\s*\[Currently viewing in viewer:[^\]]*\]/g, "")
    .trim();

  return (
    <div
      className="space-y-2"
      onClick={hasContext && !tapped ? () => setTapped(true) : undefined}
    >
      <MarkdownRenderer content={strippedContent} />
      {hasContext && tapped ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowFull(true);
          }}
          className="mt-1 text-xs font-medium opacity-50 transition hover:opacity-80"
        >
          Show full prompt
        </button>
      ) : null}
      {showFull ? (
        <PromptLightbox
          content={message.content ?? ""}
          onClose={() => setShowFull(false)}
        />
      ) : null}
    </div>
  );
}
