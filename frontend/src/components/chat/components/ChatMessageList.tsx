import type { ClipboardEvent } from "react";
import type { RefObject } from "react";
import type { ChatSessionState } from "../../../store/chatStore";
import { getNormalizedSelectionText, getSelectionHtml } from "../lib/copySelection";
import { isAskUserQuestionDetails } from "../lib/messageGroups";
import type { MessageGroup, WorkspaceAppViewer } from "../types";
import { ActionGroup } from "./ActionGroup";
import { AskUserQuestionCard } from "./AskUserQuestionCard";
import { ChatActivityIndicator } from "./ChatActivityIndicator";
import { ChatErrorNotice } from "./ChatErrorNotice";
import { ChatMessageContent } from "./ChatMessageContent";
import { OpenAppButton } from "./OpenAppButton";
import { ThinkingGroup } from "./ThinkingGroup";

interface ChatMessageListProps {
  chat: ChatSessionState;
  messageGroups: MessageGroup[];
  workspaceApps: WorkspaceAppViewer[];
  chatScrollRef: RefObject<HTMLDivElement>;
  fullWidth?: boolean;
  canRetry: boolean;
  isBusy: boolean;
  submittingQuestionId: string | null;
  onScroll: () => void;
  onRetryLastMessage: (chatId: string) => Promise<void>;
  onClearError: (chatId: string) => void;
  onSubmitQuestionAnswer: (messageId: string, response: string) => void;
  onOpenViewerApp?: (viewerPath: string) => void;
  onImageClick?: (src: string) => void;
}

export function ChatMessageList({
  chat,
  messageGroups,
  workspaceApps,
  chatScrollRef,
  fullWidth = false,
  canRetry,
  isBusy,
  submittingQuestionId,
  onScroll,
  onRetryLastMessage,
  onClearError,
  onSubmitQuestionAnswer,
  onOpenViewerApp,
  onImageClick,
}: ChatMessageListProps) {
  if (typeof window !== "undefined") {
    console.debug("[chat] rendering message groups", {
      chatId: chat.id,
      totalMessages: chat.messages.length,
      totalGroups: messageGroups.length,
      groups: messageGroups.map((group) => {
        if (group.kind === "content") {
          return {
            kind: group.kind,
            role: group.message.role,
            id: group.message.id,
            toolName: group.message.toolName ?? null,
            preview: group.message.content.slice(0, 120),
          };
        }

        if (group.kind === "actions") {
          return {
            kind: group.kind,
            actions: group.actions.map((action) => ({
              callId: action.call.id,
              toolName: action.call.toolName ?? null,
              resultId: action.result?.id ?? null,
              resultPreview: action.result?.content.slice(0, 120) ?? null,
            })),
          };
        }

        return { kind: group.kind };
      }),
    });
  }

  const handleRenderedMessageCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const container = event.currentTarget;
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;

    if (
      !anchorNode ||
      !focusNode ||
      !container.contains(anchorNode) ||
      !container.contains(focusNode)
    ) {
      return;
    }

    const normalizedText = getNormalizedSelectionText(selection);
    if (!normalizedText) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", normalizedText);
    const html = getSelectionHtml(selection);
    if (html) {
      event.clipboardData.setData("text/html", html);
    }
  };

  return (
    <div
      ref={chatScrollRef}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-6"
    >
      <div className={`${fullWidth ? "mx-0 max-w-none" : "mx-auto max-w-3xl"} flex flex-col overflow-hidden`}>
        {chat.messages.length === 0 ? (
          <div className="flex flex-col items-center gap-5 py-24">
            <img
              src="/favicon.svg"
              alt=""
              aria-hidden
              className="h-16 w-16 object-contain"
            />
            <p className="font-heading text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              How can I help you today?
            </p>
          </div>
        ) : null}

        {messageGroups.map((group, groupIndex) => {
          const previousGroup = groupIndex > 0 ? messageGroups[groupIndex - 1] : null;
          const isAssistantSide =
            group.kind !== "content" ||
            (group.kind === "content" && group.message.role !== "user");
          const previousIsAssistantSide =
            previousGroup &&
            (previousGroup.kind !== "content" ||
              (previousGroup.kind === "content" && previousGroup.message.role !== "user"));
          const isUserMessage = group.kind === "content" && group.message.role === "user";
          const previousIsUserMessage =
            previousGroup?.kind === "content" && previousGroup.message.role === "user";
          const marginTop =
            groupIndex === 0
              ? ""
              : (isAssistantSide && previousIsAssistantSide) ||
                  (isUserMessage && previousIsUserMessage)
                ? "mt-2"
                : "mt-6";

          if (group.kind === "ask_user_question") {
            const details = isAskUserQuestionDetails(group.message.toolDetails)
              ? group.message.toolDetails
              : null;

            if (!details) {
              return null;
            }

            if (isBusy && !group.answered) {
              return null;
            }

            return (
              <div key={group.message.id} className={marginTop}>
                <AskUserQuestionCard
                  messageId={group.message.id}
                  details={details}
                  answered={group.answered}
                  isBusy={isBusy}
                  isQuestionPending={submittingQuestionId === group.message.id}
                  onSubmitQuestionAnswer={onSubmitQuestionAnswer}
                />
              </div>
            );
          }

          if (group.kind === "open_app_button") {
            return (
              <div key={group.message.id} className={marginTop}>
                <OpenAppButton
                  message={group.message}
                  workspaceApps={workspaceApps}
                  onOpenViewerApp={onOpenViewerApp}
                />
              </div>
            );
          }

          if (group.kind === "thinking") {
            return (
              <div key={group.messages[0].id} className={marginTop}>
                <ThinkingGroup messages={group.messages} />
              </div>
            );
          }

          if (group.kind === "actions") {
            return (
              <div
                key={group.actions[0]?.call.id ?? `actions-${groupIndex}`}
                className={marginTop}
              >
                <ActionGroup
                  actions={group.actions}
                  thinking={group.thinking}
                  onImageClick={onImageClick}
                />
              </div>
            );
          }

          return (
            <div
              key={group.message.id}
              className={`${marginTop} ${
                group.message.role === "user" ? "flex flex-col items-end" : ""
              }`}
            >
              <ChatMessageContent
                message={group.message}
                onCopyAssistantMessage={handleRenderedMessageCopy}
                onImageClick={onImageClick}
              />
            </div>
          );
        })}

        <ChatActivityIndicator
          isThinking={chat.isThinking}
          isWorking={chat.isWorking}
        />

        {chat.error ? (
          <ChatErrorNotice
            chatId={chat.id}
            error={chat.error}
            canRetry={canRetry}
            onRetryLastMessage={onRetryLastMessage}
            onClearError={onClearError}
          />
        ) : null}
      </div>
    </div>
  );
}
