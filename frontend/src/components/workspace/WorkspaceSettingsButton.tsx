import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logout, notifyAuthRequired } from "../../lib/auth";
import { ChannelStatusPanel } from "../chat/components/ChannelStatusPanel";
import { WorkspaceAppUpdatesSection } from "./WorkspaceAppUpdatesSection";
import { WorkspaceDefaultModelSection } from "./WorkspaceDefaultModelSection";
import { TIMEZONE_META } from "./timezoneMeta";
import type { WorkspacePreferences, WorkspaceTemplateUpdate } from "./types";

type ThemeOption = "light" | "dark" | "system";

interface WorkspaceSettingsButtonProps {
  workspaceTimeZone: string;
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  defaultChatModelSelection?: WorkspacePreferences["defaultChatModelSelection"];
  templateUpdates?: WorkspaceTemplateUpdate[];
  onRequestTemplateUpdate?: (update: WorkspaceTemplateUpdate) => void;
  onDismissTemplateUpdate?: (update: WorkspaceTemplateUpdate) => Promise<void> | void;
  onOpenAutomations?: () => void;
  onTimeZoneChange: (timeZone: string) => void;
  onDefaultChatModelChange: (
    selection: NonNullable<WorkspacePreferences["defaultChatModelSelection"]>,
  ) => Promise<void> | void;
  theme: ThemeOption;
  onSelectTheme: (theme: ThemeOption) => void;
  triggerClassName?: string;
  triggerIconClassName?: string;
  title?: string;
  /** Optional text label rendered below the icon (used in the sidebar strip). */
  label?: string;
}

const getTimeZoneOptions = (): string[] => {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }

  return ["America/New_York", "UTC"];
};

const formatTimeZoneLabel = (timeZone: string): string =>
  timeZone.split("/").at(-1)?.replace(/_/g, " ") ?? timeZone;

interface SearchIndexEntry {
  label: string;
  iana: string;
  country: string | null;
  aliases: string[];
}

const buildSearchIndex = (timeZone: string): SearchIndexEntry => {
  const meta = TIMEZONE_META[timeZone];
  return {
    label: formatTimeZoneLabel(timeZone).toLowerCase(),
    iana: timeZone.toLowerCase(),
    country: meta?.country ? meta.country.toLowerCase() : null,
    aliases: meta?.aliases?.map((a) => a.toLowerCase()) ?? [],
  };
};

/** Score higher = better match. 0 = no match. */
const scoreTimeZone = (entry: SearchIndexEntry, query: string): number => {
  if (!query) return 0;
  const { label, iana, country, aliases } = entry;

  // Exact label or country match wins by a wide margin.
  if (label === query || country === query) return 1000;
  if (aliases.some((a) => a === query)) return 900;

  // Word-boundary starts — "new" matches "New York" before "Cranston".
  if (label.startsWith(query)) return 500;
  if (country && country.startsWith(query)) return 450;
  if (aliases.some((a) => a.startsWith(query))) return 400;

  // Metadata substring (country or alias) still beats IANA-only substring.
  if (country && country.includes(query)) return 200;
  if (aliases.some((a) => a.includes(query))) return 180;

  // City label substring.
  if (label.includes(query)) return 100;

  // Last resort: substring anywhere in the raw IANA ID (catches "indiana").
  if (iana.includes(query)) return 10;

  return 0;
};

const getDetectedTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

const formatTimeInZone = (timeZone: string, now: Date): string | null => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
};

const THEME_LABELS: Record<"light" | "dark" | "system", string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

function ThemeIcon({ theme, className }: { theme: "light" | "dark" | "system"; className?: string }) {
  if (theme === "dark") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
      </svg>
    );
  }
  if (theme === "light") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.3 17.7-1.4 1.4" />
      <path d="m19.1 4.9-1.4 1.4" />
    </svg>
  );
}

export function WorkspaceSettingsButton({
  workspaceTimeZone,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  defaultChatModelSelection,
  templateUpdates = [],
  onRequestTemplateUpdate,
  onDismissTemplateUpdate,
  onOpenAutomations,
  onTimeZoneChange,
  onDefaultChatModelChange,
  theme,
  onSelectTheme,
  triggerClassName = "rounded-lg p-2.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300",
  triggerIconClassName = "h-5 w-5",
  title = "Settings",
  label,
}: WorkspaceSettingsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState<Date>(() => new Date());
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const options = useMemo(() => getTimeZoneOptions(), []);
  const searchIndex = useMemo(() => {
    const map = new Map<string, SearchIndexEntry>();
    for (const tz of options) {
      map.set(tz, buildSearchIndex(tz));
    }
    return map;
  }, [options]);
  const detectedTimeZone = useMemo(() => getDetectedTimeZone(), []);
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const filteredOptions = useMemo(() => {
    if (!hasQuery) {
      return [] as string[];
    }
    const scored: Array<{ tz: string; score: number }> = [];
    for (const tz of options) {
      if (tz === workspaceTimeZone) continue;
      const entry = searchIndex.get(tz);
      if (!entry) continue;
      const score = scoreTimeZone(entry, normalizedQuery);
      if (score > 0) {
        scored.push({ tz, score });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.tz.localeCompare(b.tz));
    return scored.map((s) => s.tz);
  }, [options, searchIndex, hasQuery, normalizedQuery, workspaceTimeZone]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!popupRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    // Refresh "now" whenever the modal opens and then every 30s so the local
    // times beside each timezone stay current without re-rendering constantly.
    setNow(new Date());
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(tick);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={`relative ${triggerClassName}`}
        onClick={() => {
          setIsOpen(true);
          setQuery("");
        }}
        title={title}
      >
        <svg
          className={triggerIconClassName}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        {templateUpdates.length > 0 ? (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
            {templateUpdates.length}
          </span>
        ) : null}
        {label ? <span className="text-[10px] font-medium">{label}</span> : null}
      </button>

      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-start justify-center bg-neutral-950/30 px-4 pb-6 pt-20 backdrop-blur-sm dark:bg-black/50">
              <div
                ref={popupRef}
                className="flex max-h-[calc(100vh-7rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-white/5"
              >
                <header className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
                  <h2 className="font-heading text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    Settings
                  </h2>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    onClick={() => {
                      setIsOpen(false);
                      setQuery("");
                    }}
                    aria-label="Close settings"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <section className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      Appearance
                    </p>
                    <div
                      role="radiogroup"
                      aria-label="Theme"
                      className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      {(["light", "dark", "system"] as const).map((option) => {
                        const isActive = theme === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => onSelectTheme(option)}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                              isActive
                                ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-white/10"
                                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                            }`}
                          >
                            <ThemeIcon theme={option} className="h-3.5 w-3.5" />
                            {THEME_LABELS[option]}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <WorkspaceDefaultModelSection
                    defaultChatModelSelection={defaultChatModelSelection}
                    onDefaultChatModelChange={onDefaultChatModelChange}
                  />

                  <ChannelStatusPanel />

                  <section className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      Workspace Git
                    </p>
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          Remote URL
                        </p>
                        {workspaceGitBrowserUrl ? (
                          <a
                            href={workspaceGitBrowserUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Open repo
                          </a>
                        ) : null}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-neutral-800 dark:text-neutral-100">
                        {workspaceGitRemoteUrl || "Not configured"}
                      </p>
                    </div>
                  </section>

                  <WorkspaceAppUpdatesSection
                    templateUpdates={templateUpdates}
                    onRequestTemplateUpdate={(update) => {
                      onRequestTemplateUpdate?.(update);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    onDismissTemplateUpdate={(update) =>
                      onDismissTemplateUpdate?.(update)
                    }
                  />

                  <section className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-700">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      Automations
                    </p>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-left transition hover:border-neutral-300 hover:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
                      onClick={() => {
                        setIsOpen(false);
                        setQuery("");
                        onOpenAutomations?.();
                      }}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          Automation channel
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                          Pick where scheduled automation replies are sent.
                        </span>
                      </span>
                      <svg
                        className="h-4 w-4 shrink-0 text-neutral-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </section>

                  <section className="flex min-h-0 flex-1 flex-col border-b border-neutral-200 dark:border-neutral-700">
                    <div className="px-4 pt-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                        Timezone
                      </p>
                      <div className="relative">
                        <svg
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
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
                          ref={searchInputRef}
                          type="text"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder={"Search city or timezone\u2026"}
                          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500"
                        />
                      </div>
                    </div>
                    <div className="mt-2 max-h-80 overflow-y-auto px-2 pb-3">
                      {/* Current timezone row — always pinned at top */}
                      <button
                        type="button"
                        className="relative flex w-full items-center gap-2 rounded-lg bg-neutral-100 px-2 py-2 text-left transition dark:bg-neutral-800"
                        onClick={() => {
                          setIsOpen(false);
                          setQuery("");
                        }}
                      >
                        <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {formatTimeZoneLabel(workspaceTimeZone)}
                            {TIMEZONE_META[workspaceTimeZone]?.country ? (
                              <span className="ml-1.5 font-normal text-neutral-500 dark:text-neutral-400">
                                · {TIMEZONE_META[workspaceTimeZone]?.country}
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                            {workspaceTimeZone}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs font-medium tabular-nums text-neutral-700 dark:text-neutral-300">
                            {formatTimeInZone(workspaceTimeZone, now) ?? ""}
                          </span>
                          <span className="block text-[10px] uppercase tracking-wider text-neutral-400">
                            Current
                          </span>
                        </span>
                      </button>

                      {/* Idle state: no search yet — offer "use device timezone" */}
                      {!hasQuery ? (
                        <>
                          {detectedTimeZone && detectedTimeZone !== workspaceTimeZone ? (
                            <button
                              type="button"
                              onClick={() => {
                                onTimeZoneChange(detectedTimeZone);
                                setIsOpen(false);
                                setQuery("");
                              }}
                              className="mt-2 flex w-full items-center gap-3 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-left transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/60"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden
                                >
                                  <circle cx="12" cy="10" r="3" />
                                  <path d="M12 2a8 8 0 0 0-8 8c0 4.5 8 12 8 12s8-7.5 8-12a8 8 0 0 0-8-8z" />
                                </svg>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                  Use device timezone
                                </span>
                                <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                  {formatTimeZoneLabel(detectedTimeZone)}
                                  {TIMEZONE_META[detectedTimeZone]?.country ? (
                                    <span className="ml-1.5 font-normal text-neutral-500 dark:text-neutral-400">
                                      · {TIMEZONE_META[detectedTimeZone]?.country}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {detectedTimeZone}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                                {formatTimeInZone(detectedTimeZone, now) ?? ""}
                              </span>
                            </button>
                          ) : null}
                          <p className="mt-3 px-2 pb-1 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
                            Start typing to search {options.length}+ timezones
                          </p>
                        </>
                      ) : filteredOptions.length === 0 ? (
                        <p className="px-2 py-4 text-center text-xs text-neutral-400">
                          No matching timezones.
                        </p>
                      ) : (
                        <div className="mt-0.5 flex flex-col gap-0.5">
                          {filteredOptions.map((timeZone) => (
                            <button
                              key={timeZone}
                              type="button"
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-neutral-700 transition hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
                              onClick={() => {
                                onTimeZoneChange(timeZone);
                                setIsOpen(false);
                                setQuery("");
                              }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {formatTimeZoneLabel(timeZone)}
                                  {TIMEZONE_META[timeZone]?.country ? (
                                    <span className="ml-1.5 font-normal text-neutral-400 dark:text-neutral-500">
                                      · {TIMEZONE_META[timeZone]?.country}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="block truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                                  {timeZone}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                                {formatTimeInZone(timeZone, now) ?? ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="flex items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                        Account
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        Sign out of this workspace.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-white"
                      onClick={() => {
                        void logout().finally(() => {
                          setIsOpen(false);
                          setQuery("");
                          notifyAuthRequired();
                        });
                      }}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Log out
                    </button>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
