import { useState } from "react";
import { shortenFilePath } from "../../lib/toolSummaries";

interface ReadFileViewProps {
  filePath: string;
  content: string;
  rawInput?: string;
  rawOutput?: string;
}

export function ReadFileView({
  filePath,
  content,
  rawInput,
  rawOutput,
}: ReadFileViewProps) {
  const [showRaw, setShowRaw] = useState(false);
  const lines = content.split("\n");
  const shortPath = shortenFilePath(filePath);

  return (
    <div className="min-w-0 max-w-full space-y-1.5">
      <button
        type="button"
        onClick={() => setShowRaw((value) => !value)}
        className="text-[11px] text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        {showRaw ? "Show preview" : "Show raw"}
      </button>
      {showRaw ? (
        <div className="max-w-full overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
          {rawInput ? (
            <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-700">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Input
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-neutral-700 dark:text-neutral-300">
                {rawInput}
              </pre>
            </div>
          ) : null}
          {rawOutput ? (
            <div className="px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Output
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-neutral-950 p-3 font-mono text-xs text-neutral-300">
                {rawOutput}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="max-w-full overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-lg">
          <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
            <svg
              className="h-3.5 w-3.5 text-neutral-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="text-[11px] font-medium text-neutral-400">{shortPath}</span>
          </div>
          <div className="overflow-x-auto">
            {lines.map((line, index) => (
              <div key={index} className="flex">
                <span className="w-10 shrink-0 select-none border-r border-neutral-800 bg-neutral-900/50 px-2 text-right font-mono text-[11px] leading-5 text-neutral-600">
                  {index + 1}
                </span>
                <span className="flex-1 whitespace-pre-wrap break-words px-3 font-mono text-xs leading-5 text-neutral-300">
                  {line}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
