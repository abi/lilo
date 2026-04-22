import { useState } from "react";

interface ImageGenViewProps {
  urls: string[];
  rawInput?: string;
  rawOutput?: string;
  onImageClick?: (src: string) => void;
}

export function ImageGenView({
  urls,
  rawInput,
  rawOutput,
  onImageClick,
}: ImageGenViewProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setShowRaw((value) => !value)}
        className="text-[11px] text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        {showRaw ? "Show preview" : "Show raw"}
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
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: urls.length === 1 ? "1fr" : "repeat(2, 1fr)" }}
        >
          {urls.map((url, index) => (
            <img
              key={`generated-${index}`}
              src={url}
              alt={`Generated image ${index + 1}`}
              className="w-full cursor-pointer rounded-lg border border-neutral-200 object-cover transition hover:opacity-80 dark:border-neutral-700"
              onClick={() => onImageClick?.(url)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
