import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceAppLink } from "../workspace/types";

interface CommandPaletteProps {
  open: boolean;
  workspaceApps: WorkspaceAppLink[];
  onClose: () => void;
  onSelectApp: (app: WorkspaceAppLink) => void;
}

type ScoredApp = {
  app: WorkspaceAppLink;
  score: number;
  index: number;
};

const scoreApp = (app: WorkspaceAppLink, query: string): number => {
  if (!query) return 1;
  const name = app.name.toLowerCase();
  const display = (app.displayName ?? "").toLowerCase();
  if (name === query || display === query) return 1000;
  if (name.startsWith(query) || display.startsWith(query)) return 500;
  if (name.includes(query) || display.includes(query)) return 100;
  return 0;
};

export function CommandPalette({
  open,
  workspaceApps,
  onClose,
  onSelectApp,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Always pin the built-in Desktop app to the front, regardless of
    // archive state or search score.
    const desktopApp = workspaceApps.find((app) => app.name === "desktop");
    const rest = workspaceApps.filter(
      (app) => !app.archived && app.name !== "desktop",
    );
    // With no query, preserve the user's workspace ordering (matches the
    // Desktop grid and the collapsed sidebar strip exactly).
    if (!q) {
      return desktopApp ? [desktopApp, ...rest] : rest;
    }
    const desktopMatch = desktopApp && scoreApp(desktopApp, q) > 0;
    const scored: ScoredApp[] = [];
    rest.forEach((app, index) => {
      const score = scoreApp(app, q);
      if (score > 0) {
        scored.push({ app, score, index });
      }
    });
    // Sort by score, then fall back to the workspace array order so ties
    // match the rest of the UI.
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    const matches = scored.map((s) => s.app);
    return desktopMatch && desktopApp ? [desktopApp, ...matches] : matches;
  }, [workspaceApps, query]);

  // Reset state when opened/closed.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [open]);

  // Clamp selection when filtered results change.
  useEffect(() => {
    setSelectedIndex((i) => {
      if (filtered.length === 0) return 0;
      if (i >= filtered.length) return filtered.length - 1;
      return i;
    });
  }, [filtered.length]);

  // Scroll selected row into view.
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${selectedIndex}"]`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const app = filtered[selectedIndex];
        if (app) {
          onSelectApp(app);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, selectedIndex, onClose, onSelectApp]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-neutral-950/30 px-4 pb-6 pt-[15vh] backdrop-blur-sm dark:bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-white/5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
          <svg
            className="h-4 w-4 shrink-0 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={"Search apps\u2026"}
            className="w-full bg-transparent py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <kbd className="hidden shrink-0 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-neutral-500 sm:inline dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-neutral-400 dark:text-neutral-500">
              {query.trim() ? "No matching apps." : "No apps available."}
            </p>
          ) : (
            filtered.map((app, index) => {
              const isActive = index === selectedIndex;
              return (
                <button
                  key={app.name}
                  type="button"
                  data-palette-index={index}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => onSelectApp(app)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                      : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
                  }`}
                >
                  {app.iconHref ? (
                    <img
                      src={app.iconHref}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-lg border border-neutral-200 object-cover dark:border-neutral-700"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-200 text-xs font-bold uppercase text-neutral-600 dark:border-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                      {(app.displayName ?? app.name).charAt(0)}
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {app.displayName ?? app.name}
                    </span>
                    {app.displayName && app.displayName !== app.name ? (
                      <span className="block truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                        {app.name}
                      </span>
                    ) : null}
                  </span>
                  {isActive ? (
                    <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-neutral-500 sm:inline-flex dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                      {"\u21B5"}
                    </kbd>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-neutral-200 px-3 py-2 text-[11px] text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-[10px] font-medium dark:border-neutral-700 dark:bg-neutral-800">
              {"\u2191"}
            </kbd>
            <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-[10px] font-medium dark:border-neutral-700 dark:bg-neutral-800">
              {"\u2193"}
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-[10px] font-medium dark:border-neutral-700 dark:bg-neutral-800">
              {"\u21B5"}
            </kbd>
            open
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
