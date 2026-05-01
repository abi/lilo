import { useEffect, useState } from "react";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { config } from "../../../config/config";
import { authFetch } from "../../../lib/auth";

interface PromptLightboxProps {
  content: string;
  onClose: () => void;
}

export function PromptLightbox({ content, onClose }: PromptLightboxProps) {
  const [activeTab, setActiveTab] = useState<"prompt" | "system">("prompt");
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [systemPromptError, setSystemPromptError] = useState<string | null>(null);
  const [isLoadingSystemPrompt, setIsLoadingSystemPrompt] = useState(false);

  useEffect(() => {
    if (
      activeTab !== "system" ||
      systemPrompt !== null ||
      systemPromptError !== null
    ) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 10_000);

    setIsLoadingSystemPrompt(true);
    void authFetch(`${config.apiBaseUrl}/chats/system-prompt`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load system prompt (${response.status})`);
        }

        const payload = (await response.json()) as { systemPrompt?: unknown };
        if (!cancelled) {
          setSystemPrompt(
            typeof payload.systemPrompt === "string" ? payload.systemPrompt : "",
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSystemPromptError(
            error instanceof DOMException && error.name === "AbortError"
              ? "Timed out while loading system prompt. Is the backend running with the latest code?"
              : error instanceof Error
                ? error.message
                : "Failed to load system prompt",
          );
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setIsLoadingSystemPrompt(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, systemPrompt, systemPromptError]);

  const shownContent = activeTab === "prompt" ? content : systemPrompt ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-neutral-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3 dark:border-neutral-700">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Full Prompt
            </h3>
            <div className="mt-2 flex rounded-lg bg-neutral-100 p-0.5 text-xs font-medium dark:bg-neutral-800">
              <PromptTab
                active={activeTab === "prompt"}
                onClick={() => setActiveTab("prompt")}
              >
                User prompt
              </PromptTab>
              <PromptTab
                active={activeTab === "system"}
                onClick={() => setActiveTab("system")}
              >
                System prompt
              </PromptTab>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-neutral-800 dark:text-neutral-200">
          {activeTab === "system" && isLoadingSystemPrompt ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Loading system prompt...
            </p>
          ) : activeTab === "system" && systemPromptError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <p>{systemPromptError}</p>
              <button
                type="button"
                onClick={() => setSystemPromptError(null)}
                className="mt-2 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
              <MarkdownRenderer content={shownContent} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PromptTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 transition ${
        active
          ? "bg-white text-neutral-950 shadow-sm dark:bg-neutral-950 dark:text-neutral-100"
          : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
