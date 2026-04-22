import type { ChatMessage } from "../../store/chatStore";

export interface ActionItem {
  call: ChatMessage;
  result: ChatMessage | null;
}

export type AskUserQuestionDetails = {
  question: string;
  options: string[];
  allowSkip?: boolean;
};

export type MessageGroup =
  | { kind: "content"; message: ChatMessage }
  | { kind: "actions"; actions: ActionItem[]; thinking: ChatMessage[] }
  | { kind: "thinking"; messages: ChatMessage[] }
  | { kind: "ask_user_question"; message: ChatMessage; answered: boolean }
  | { kind: "open_app_button"; message: ChatMessage };

export interface WorkspaceAppViewer {
  name: string;
  href: string;
  iconHref?: string;
}
