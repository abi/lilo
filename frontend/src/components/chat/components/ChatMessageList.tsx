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
            <svg viewBox="0 0 2048 1837" className="h-16 w-16 opacity-80" aria-hidden>
              <defs>
                <linearGradient id="emptyLogoGrad" x1="247.588" y1="385.958" x2="1526.08" y2="1642.72" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#00d4aa" />
                  <stop offset="1" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <path fill="url(#emptyLogoGrad)" d="M 637.537 154.42 C 687.037 152.046 744.732 155.51 793.933 161.548 C 1005.35 187.302 1204.5 274.743 1366.53 412.96 C 1587.76 601.684 1723.95 871.333 1744.54 1161.39 C 1747.44 1198.78 1748.56 1248.63 1744.75 1285.3 C 1735.18 1376.08 1698.31 1461.82 1639.01 1531.22 C 1556.67 1627.25 1447.96 1679.26 1322.68 1688.9 C 1263.78 1690.31 1205.62 1689.88 1146.71 1689.88 L 895.102 1689.87 L 737.873 1689.86 C 676.216 1689.9 625.867 1692.38 565.102 1679.03 C 491.64 1662.77 423.431 1628.34 366.723 1578.89 C 276.394 1500.52 220.892 1389.47 212.422 1270.18 C 209.77 1229.72 211.047 1180.06 211.047 1138.77 L 211.057 920.065 L 211.059 707.633 C 211.054 640.647 207.439 573.144 221.904 507.66 C 238.248 433.914 272.848 365.452 322.531 308.555 C 402.429 216.77 516.037 161.181 637.537 154.42 z" />
              <path fill="#f5f5f5" d="M 957.843 634.507 C 1116.65 622.701 1254.89 742.029 1266.41 900.858 C 1277.93 1059.69 1158.35 1197.71 999.501 1208.94 C 841.057 1220.14 703.463 1100.94 691.974 942.516 C 680.485 784.093 799.441 646.283 957.843 634.507 z" />
            </svg>
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
