import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

export const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";

interface AskUserQuestionToolDetails {
  question: string;
  options: string[];
  allowSkip: boolean;
}

const normalizeOptions = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
};

export const askUserQuestionTool: ToolDefinition = {
  name: ASK_USER_QUESTION_TOOL_NAME,
  label: "Ask User Question",
  description:
    "Ask the user a concise multiple-choice question when a small set of obvious answers would unblock the next step. CRITICAL: After calling this tool, you MUST immediately stop and end your turn. Do NOT call any other tools or generate any other content. Wait for the user's response in the next message.",
  promptSnippet:
    "ask_user_question: ask the user a concise multiple-choice question with 2-5 short answer options. Use this sparingly for yes/no or similarly constrained choices, not open-ended prompts. IMPORTANT: This tool must always be the LAST tool call in your turn — after calling it, immediately stop and wait for the user's answer.",
  promptGuidelines: [
    "When you use ask_user_question, it MUST be the very last thing you do in your turn. Never call additional tools or produce further output after ask_user_question. End your turn immediately so the user can respond.",
  ],
  parameters: Type.Object({
    question: Type.String({
      description: "A short, specific question for the user.",
      minLength: 1,
    }),
    options: Type.Array(
      Type.String({
        description: "A short answer option the user can tap.",
        minLength: 1,
      }),
      { minItems: 2, maxItems: 5 },
    ),
    allow_skip: Type.Optional(
      Type.Boolean({
        description: "Whether the UI should show a Skip button.",
      }),
    ),
  }),
  async execute(_toolCallId, params) {
    const question = String((params as { question?: string }).question ?? "").trim();
    const options = normalizeOptions((params as { options?: unknown }).options);
    const allowSkip = Boolean((params as { allow_skip?: boolean }).allow_skip ?? true);

    return {
      content: [
        {
          type: "text" as const,
          text:
            question.length > 0
              ? `[WAITING FOR USER] Asked user: "${question}" — STOP here. Do not call any more tools or produce any more output. End your turn now and wait for the user's reply.`
              : "[WAITING FOR USER] Asked user a follow-up question. STOP here and wait for the user's reply.",
        },
      ],
      details: {
        question,
        options,
        allowSkip,
      } satisfies AskUserQuestionToolDetails,
    };
  },
};
