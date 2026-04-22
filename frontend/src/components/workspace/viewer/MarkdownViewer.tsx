import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../../config/runtime";
import { authFetch } from "../../../lib/auth";
import { MarkdownRenderer } from "../../MarkdownRenderer";

interface MarkdownViewerProps {
  content: string;
  basePath?: string | null;
  onOpenWorkspacePath?: (viewerPath: string) => void;
}

type Mode = "preview" | "edit";

const SAVED_FLASH_MS = 2500;

export function MarkdownViewer({
  content,
  basePath,
  onOpenWorkspacePath,
}: MarkdownViewerProps) {
  const [mode, setMode] = useState<Mode>("preview");
  const [draft, setDraft] = useState(content);
  // Server-synced snapshot of the file — initialized from props, then
  // updated on external refresh (new `content`) and on successful save.
  const [syncedContent, setSyncedContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlashUntil, setSavedFlashUntil] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [now, setNow] = useState(Date.now());

  const canEdit = Boolean(basePath && basePath.startsWith("/workspace-file/"));
  const isDirty = draft !== syncedContent;

  // Rehydrate the draft whenever the backing file content changes (file
  // switch or server-side update) and we don't have unsaved edits.
  useEffect(() => {
    setSyncedContent(content);
    setDraft(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // Reset mode + pending state when the underlying file changes.
  useEffect(() => {
    setMode("preview");
    setError(null);
    setSavedFlashUntil(0);
  }, [basePath]);

  const save = async () => {
    if (!canEdit || !basePath || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const relativePath = basePath.replace(/^\/workspace-file\//, "");
      const response = await authFetch(
        `${API_BASE_URL}/workspace-file/${relativePath}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: draft }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          details?: string;
        } | null;
        throw new Error(body?.error ?? `Save failed (${response.status})`);
      }
      setSyncedContent(draft);
      setSavedFlashUntil(Date.now() + SAVED_FLASH_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // ⌘S / Ctrl+S to save while editing.
  useEffect(() => {
    if (mode !== "edit") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isDirty) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isDirty, draft, basePath]);

  // Keep the "Saved" flash ticking so it expires visually without a state
  // change on the parent.
  useEffect(() => {
    if (savedFlashUntil === 0) return;
    const handle = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, savedFlashUntil - Date.now()),
    );
    return () => window.clearTimeout(handle);
  }, [savedFlashUntil]);

  const showSavedFlash = savedFlashUntil > now && !isDirty;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      {canEdit ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <div
            role="tablist"
            aria-label="Markdown view mode"
            className="flex gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {(["preview", "edit"] as const).map((value) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                    active
                      ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-white/10"
                      : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {error ? (
              <span className="text-xs text-red-500 dark:text-red-400">
                {error}
              </span>
            ) : showSavedFlash ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Saved
              </span>
            ) : isDirty ? (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Unsaved changes
              </span>
            ) : null}
            {mode === "edit" ? (
              <button
                type="button"
                onClick={() => void save()}
                disabled={!isDirty || isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
                title="Save (\u2318S)"
              >
                {isSaving ? "Saving\u2026" : "Save"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === "preview" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="prose prose-sm max-w-none space-y-3 text-neutral-900 dark:prose-invert dark:text-neutral-100">
            <MarkdownRenderer
              content={draft}
              basePath={basePath}
              onOpenWorkspacePath={onOpenWorkspacePath}
            />
          </div>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-6 py-5 font-mono text-sm leading-relaxed text-neutral-900 outline-none dark:text-neutral-100"
          placeholder="Type markdown\u2026"
        />
      )}
    </div>
  );
}
