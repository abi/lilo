interface BinaryViewerProps {
  selectedViewerUrl: string | null;
}

export function BinaryViewer({ selectedViewerUrl }: BinaryViewerProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded border border-dashed border-neutral-200 bg-white px-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        This file type does not have an inline viewer yet.
      </p>
      {selectedViewerUrl ? (
        <a
          href={selectedViewerUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
        >
          Open raw file
        </a>
      ) : null}
    </div>
  );
}
