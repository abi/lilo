interface EmptyViewerProps {
  message: string;
}

export function EmptyViewer({ message }: EmptyViewerProps) {
  return (
    <div className="flex h-full items-center justify-center rounded border border-dashed border-neutral-200 bg-white text-sm text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900">
      {message}
    </div>
  );
}
