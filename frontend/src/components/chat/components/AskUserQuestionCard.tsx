import type { AskUserQuestionDetails } from "../types";

interface AskUserQuestionCardProps {
  messageId: string;
  details: AskUserQuestionDetails;
  answered: boolean;
  isBusy: boolean;
  isQuestionPending: boolean;
  onSubmitQuestionAnswer: (messageId: string, response: string) => void;
}

export function AskUserQuestionCard({
  messageId,
  details,
  answered,
  isBusy,
  isQuestionPending,
  onSubmitQuestionAnswer,
}: AskUserQuestionCardProps) {
  const cardDisabled = isBusy || answered || isQuestionPending;
  const statusText = answered
    ? "✓ Answered"
    : isQuestionPending
      ? "Sending..."
      : isBusy
        ? "Waiting for agent to finish..."
        : "";

  return (
    <div className="max-w-3xl">
      <div
        className={`overflow-hidden rounded-2xl border bg-white dark:bg-neutral-950 ${
          answered
            ? "border-neutral-200 dark:border-neutral-700"
            : "border-neutral-900 shadow-md dark:border-neutral-400"
        }`}
      >
        <div
          className={`px-5 py-4 ${
            answered ? "bg-neutral-50 dark:bg-neutral-900" : "bg-neutral-900 dark:bg-neutral-100"
          }`}
        >
          <p
            className={`text-lg font-semibold leading-snug ${
              answered
                ? "text-neutral-500 dark:text-neutral-400"
                : "text-white dark:text-neutral-900"
            }`}
          >
            {details.question}
          </p>
        </div>

        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {details.options.map((option, index) => (
            <button
              key={`${messageId}-${option}`}
              type="button"
              className={`flex w-full items-center gap-4 px-5 py-4 text-left transition disabled:cursor-not-allowed ${
                answered
                  ? "opacity-60"
                  : isBusy
                    ? "opacity-70"
                    : "hover:bg-neutral-50 active:bg-neutral-100 dark:hover:bg-neutral-900 dark:active:bg-neutral-800"
              }`}
              disabled={cardDisabled}
              onClick={() =>
                onSubmitQuestionAnswer(
                  messageId,
                  `Answer to your question "${details.question}": ${option}`,
                )
              }
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  answered
                    ? "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                    : "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`min-w-0 flex-1 text-base ${
                  answered
                    ? "text-neutral-400 dark:text-neutral-500"
                    : "font-medium text-neutral-900 dark:text-neutral-100"
                }`}
              >
                {option}
              </span>
              {!answered ? (
                <svg
                  className="h-5 w-5 shrink-0 text-neutral-300 dark:text-neutral-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>

        {details.allowSkip || statusText ? (
          <div className="flex items-center justify-end border-t border-neutral-100 px-5 py-2.5 dark:border-neutral-800">
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {statusText}
            </span>
            {details.allowSkip && !answered ? (
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                disabled={cardDisabled}
                onClick={() =>
                  onSubmitQuestionAnswer(
                    messageId,
                    `I'm skipping your question "${details.question}". Please choose a reasonable default and continue.`,
                  )
                }
              >
                Skip →
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
