import { useState } from "react";

const shortenCommand = (command: string): string =>
  command.replace(/\/Users\/[^\s]*?\/lilo\//g, "~/");

interface BashTerminalViewProps {
  command: string;
  output?: string;
  rawInput?: string;
  rawOutput?: string;
}

export function BashTerminalView({
  command,
  output,
  rawInput,
  rawOutput,
}: BashTerminalViewProps) {
  const [showRaw, setShowRaw] = useState(false);
  const shortCommand = shortenCommand(command);

  return (
    <div className="min-w-0 max-w-full space-y-1.5">
      <button
        type="button"
        onClick={() => setShowRaw((value) => !value)}
        className="text-[11px] text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        {showRaw ? "Show terminal" : "Show raw"}
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
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
            </div>
            <span className="min-w-0 flex-1 text-center text-[10px] font-medium text-neutral-500">
              Terminal
            </span>
          </div>
          <div className="px-3 py-2">
            <div className="flex min-w-0 items-start gap-2">
              <span className="select-none font-mono text-xs font-bold text-green-400">$</span>
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs text-neutral-200">
                {shortCommand}
              </pre>
            </div>
          </div>
          {output ? (
            <div className="border-t border-neutral-800/50 px-3 py-2">
              <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-neutral-400">
                {output}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
