import { useState } from "react";

interface EditDiffViewProps {
  oldString: string;
  newString: string;
  rawInput?: string;
  rawOutput?: string;
}

export function EditDiffView({
  oldString,
  newString,
  rawInput,
  rawOutput,
}: EditDiffViewProps) {
  const [showRaw, setShowRaw] = useState(false);
  const oldLines = oldString.split("\n");
  const newLines = newString.split("\n");

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setShowRaw((value) => !value)}
        className="text-[11px] text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        {showRaw ? "Show diff" : "Show raw"}
      </button>
      {showRaw ? (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
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
        <div className="overflow-x-auto rounded-lg border border-neutral-700 bg-neutral-950 font-mono text-xs">
          {oldLines.length > 0 && oldString.length > 0 ? (
            <div className="border-b border-neutral-800 bg-red-950/30">
              {oldLines.map((line, index) => (
                <div key={`old-${index}`} className="flex">
                  <span className="w-8 shrink-0 select-none border-r border-red-900/40 bg-red-950/50 px-1 text-right text-red-500/70">
                    -
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-words px-2 py-px text-red-400">
                    {line}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {newLines.length > 0 && newString.length > 0 ? (
            <div className="bg-green-950/30">
              {newLines.map((line, index) => (
                <div key={`new-${index}`} className="flex">
                  <span className="w-8 shrink-0 select-none border-r border-green-900/40 bg-green-950/50 px-1 text-right text-green-500/70">
                    +
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-words px-2 py-px text-green-400">
                    {line}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
