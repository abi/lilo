import type { ChatMessage } from "../../../store/chatStore";
import type { AskUserQuestionDetails, MessageGroup, ActionItem } from "../types";

export const isAskUserQuestionDetails = (
  value: unknown,
): value is AskUserQuestionDetails =>
  Boolean(
    value &&
      typeof value === "object" &&
      "question" in value &&
      typeof (value as { question?: unknown }).question === "string" &&
      "options" in value &&
      Array.isArray((value as { options?: unknown }).options),
  );

export const groupMessages = (messages: ChatMessage[]): MessageGroup[] => {
  const groups: MessageGroup[] = [];
  let index = 0;

  const pushAsContent = (message: ChatMessage) => {
    groups.push({ kind: "content", message });
  };

  while (index < messages.length) {
    const message = messages[index];

    if (message.role === "tool_call" && message.toolName === "ask_user_question") {
      const next = index + 1 < messages.length ? messages[index + 1] : undefined;

      if (
        next?.role === "tool_result" &&
        next.toolName === "ask_user_question" &&
        isAskUserQuestionDetails(next.toolDetails)
      ) {
        groups.push({
          kind: "ask_user_question",
          message: next,
          answered: messages.slice(index + 2).some((entry) => entry.role === "user"),
        });
        index += 2;
        continue;
      }
    }

    if (message.role === "tool_call" && message.toolName === "open_app") {
      index += 1;
      continue;
    }

    if (
      message.role === "tool_result" &&
      message.toolName === "ask_user_question" &&
      isAskUserQuestionDetails(message.toolDetails)
    ) {
      groups.push({
        kind: "ask_user_question",
        message,
        answered: messages.slice(index + 1).some((entry) => entry.role === "user"),
      });
      index += 1;
      continue;
    }

    if (message.role === "tool_result" && message.toolName === "open_app" && message.viewerPath) {
      groups.push({ kind: "open_app_button", message });
      index += 1;
      continue;
    }

    if (
      message.role === "tool_call" ||
      message.role === "tool_result" ||
      message.role === "thinking"
    ) {
      if (message.role === "tool_result") {
        if (typeof window !== "undefined") {
          console.warn("[chat] encountered standalone tool_result while grouping messages", {
            messageId: message.id,
            toolName: message.toolName,
            contentPreview: message.content.slice(0, 240),
            hasToolDetails: Boolean(message.toolDetails),
          });
        }
        groups.push({
          kind: "actions",
          actions: [{ call: { ...message, role: "tool_call", content: message.toolName ?? "tool_result" }, result: message }],
          thinking: [],
        });
        index += 1;
        continue;
      }

      const actions: ActionItem[] = [];
      const thinking: ChatMessage[] = [];

      while (index < messages.length) {
        const current = messages[index];

        if (current.role === "thinking") {
          thinking.push(current);
          index += 1;
          continue;
        }

        if (current.role === "tool_call") {
          if (current.toolName === "open_app") {
            break;
          }

          const next = index + 1 < messages.length ? messages[index + 1] : undefined;
          const paired = next?.role === "tool_result" ? next : null;
          actions.push({ call: current, result: paired });
          index += paired ? 2 : 1;
          continue;
        }

        if (current.role === "tool_result") {
          if (current.toolName === "open_app" && current.viewerPath) {
            break;
          }

          break;
        }

        break;
      }

      if (actions.length > 0) {
        if (typeof window !== "undefined") {
          console.debug("[chat] grouped action block", {
            actionCount: actions.length,
            actions: actions.map((action) => ({
              callId: action.call.id,
              toolName: action.call.toolName,
              resultId: action.result?.id ?? null,
              resultPreview: action.result?.content.slice(0, 120) ?? null,
            })),
          });
        }
        groups.push({ kind: "actions", actions, thinking });
      } else if (thinking.length > 0) {
        groups.push({ kind: "thinking", messages: thinking });
      } else {
        pushAsContent(message);
        index += 1;
      }

      continue;
    }

    groups.push({ kind: "content", message });
    index += 1;
  }

  return groups;
};
