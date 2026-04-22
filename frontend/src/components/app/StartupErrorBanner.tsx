interface StartupErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export function StartupErrorBanner({
  message,
  onRetry,
}: StartupErrorBannerProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
      <div className="w-full max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950/80 dark:text-red-300">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">Backend setup error</p>
            <p className="mt-1 whitespace-pre-wrap">{message}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
