import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logout, notifyAuthRequired } from "../../lib/auth";
import { WorkspaceAppUpdatesSection } from "./WorkspaceAppUpdatesSection";
import type { WorkspaceTemplateUpdate } from "./types";

interface WorkspaceSidebarHeaderProps {
  mobile?: boolean;
  onRefresh: () => void;
  workspaceTimeZone: string;
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  templateUpdates?: WorkspaceTemplateUpdate[];
  onTimeZoneChange: (timeZone: string) => void;
  onRequestTemplateUpdate?: (update: WorkspaceTemplateUpdate) => void;
  onDismissTemplateUpdate?: (update: WorkspaceTemplateUpdate) => Promise<void> | void;
}

const getTimeZoneOptions = (): string[] => {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }

  return ["America/New_York", "UTC"];
};

const formatTimeZoneLabel = (timeZone: string): string =>
  timeZone
    .split("/")
    .at(-1)
    ?.replace(/_/g, " ")
    ?? timeZone;

export function WorkspaceSidebarHeader({
  mobile = false,
  onRefresh,
  workspaceTimeZone,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  templateUpdates = [],
  onTimeZoneChange,
  onRequestTemplateUpdate,
  onDismissTemplateUpdate,
}: WorkspaceSidebarHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const options = useMemo(() => getTimeZoneOptions(), []);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selected = workspaceTimeZone;
    const matches = options.filter((timeZone) => {
      if (!normalizedQuery) {
        return true;
      }

      const label = formatTimeZoneLabel(timeZone).toLowerCase();
      return (
        timeZone.toLowerCase().includes(normalizedQuery) ||
        label.includes(normalizedQuery)
      );
    });

    return matches.filter((timeZone) => timeZone !== selected);
  }, [options, query, workspaceTimeZone]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!popupRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
        setQuery("");
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
        setQuery("");
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSettingsOpen]);

  return (
    <div
      className={`relative flex items-center justify-end gap-1 ${mobile ? "px-4 pt-4" : "px-4 pt-3"}`}
    >
      {mobile ? (
        <div className="relative">
          <button
            type="button"
            className="relative mb-1 rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            onClick={() => {
              setIsSettingsOpen(true);
              setQuery("");
            }}
            title="Workspace settings"
          >
            <svg
              className="h-3.5 w-3.5"
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
              <span className="absolute right-0 top-0 flex h-3.5 min-w-3.5 translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-bold leading-none text-white shadow-sm">
                {templateUpdates.length}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      {isSettingsOpen && mobile
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-start justify-center bg-neutral-950/20 px-4 pb-6 pt-20 backdrop-blur-sm dark:bg-black/40">
              <div
                ref={popupRef}
                className={`w-full max-w-2xl overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_80px_rgba(0,0,0,0.12)] dark:border-neutral-700 dark:bg-neutral-900 ${
                  mobile ? "mt-6" : ""
                }`}
              >
                <div className="border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        Workspace Settings
                      </p>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Choose the timezone used in agent prompt context.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                      onClick={() => {
                        setIsSettingsOpen(false);
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
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                      Workspace Git
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
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
                  <WorkspaceAppUpdatesSection
                    className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950"
                    templateUpdates={templateUpdates}
                    onRequestTemplateUpdate={(update) => {
                      onRequestTemplateUpdate?.(update);
                      setIsSettingsOpen(false);
                      setQuery("");
                    }}
                    onDismissTemplateUpdate={(update) =>
                      onDismissTemplateUpdate?.(update)
                    }
                  />
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                      Search Timezones
                    </p>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search city or timezone..."
                      className="mt-2 w-full bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
                    />
                  </div>
                  <div className="mt-4 max-h-[24rem] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-700">
                    <div className="border-b border-neutral-100 dark:border-neutral-800">
                      <div className="px-4 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                          Selected
                        </p>
                      </div>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 bg-neutral-900 px-4 py-3 text-left text-white dark:bg-neutral-100 dark:text-neutral-900"
                        onClick={() => {
                          setIsSettingsOpen(false);
                          setQuery("");
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {formatTimeZoneLabel(workspaceTimeZone)}
                          </p>
                          <p className="truncate text-xs text-white/70 dark:text-neutral-500">
                            {workspaceTimeZone}
                          </p>
                        </div>
                        <svg
                          className="h-4 w-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m5 12 5 5L20 7" />
                        </svg>
                      </button>
                    </div>

                    {filteredOptions.map((timeZone) => {
                      return (
                        <button
                          key={timeZone}
                          type="button"
                          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
                          onClick={() => {
                            onTimeZoneChange(timeZone);
                            setIsSettingsOpen(false);
                            setQuery("");
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {formatTimeZoneLabel(timeZone)}
                            </p>
                            <p className="truncate text-xs text-neutral-400">
                              {timeZone}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
                      onClick={() => {
                        void logout().finally(() => {
                          setIsSettingsOpen(false);
                          setQuery("");
                          notifyAuthRequired();
                        });
                      }}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <button
        type="button"
        className="mb-1 rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        onClick={onRefresh}
        title="Refresh workspace"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0115.4-6.4L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 01-15.4 6.4L3 16" />
        </svg>
      </button>
    </div>
  );
}
