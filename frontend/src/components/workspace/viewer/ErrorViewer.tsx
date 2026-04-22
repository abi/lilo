interface ErrorViewerProps {
  message: string;
}

export function ErrorViewer({ message }: ErrorViewerProps) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
      {message}
    </div>
  );
}
