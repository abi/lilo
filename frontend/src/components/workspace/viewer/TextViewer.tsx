interface TextViewerProps {
  content: string;
  languageLabel?: string | null;
}

export function TextViewer({ content, languageLabel }: TextViewerProps) {
  const lines = content.split("\n");

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
      {languageLabel ? (
        <div className="border-b border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
          {languageLabel}
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {lines.map((line, index) => (
          <div key={`${index}-${line}`} className="flex min-w-0">
            <span className="w-12 shrink-0 select-none border-r border-neutral-200 bg-neutral-50 px-2 py-0.5 text-right font-mono text-[11px] leading-6 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all [overflow-wrap:anywhere] px-3 py-0.5 font-mono text-[13px] leading-6 text-neutral-800 dark:text-neutral-200">
              {line.length > 0 ? line : " "}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
