interface ChatErrorNoticeProps {
  chatId: string;
  error: string;
  canRetry: boolean;
  onRetryLastMessage: (chatId: string) => Promise<void>;
  onClearError: (chatId: string) => void;
}

export function ChatErrorNotice({
  chatId,
  error,
  canRetry,
  onRetryLastMessage,
  onClearError,
}: ChatErrorNoticeProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
      <p className="font-medium">Provider error</p>
      <p className="mt-1 whitespace-pre-wrap">{error}</p>
      <div className="mt-3 flex items-center gap-3">
        {canRetry ? (
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
            onClick={() => void onRetryLastMessage(chatId)}
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          className="text-xs font-medium text-red-400 underline transition hover:text-red-600"
          onClick={() => onClearError(chatId)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
