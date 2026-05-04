import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { WorkspaceAppLink, WorkspaceFrequentDocument } from "../workspace/types";

interface NativeDesktopHomeProps {
  workspaceApps: WorkspaceAppLink[];
  frequentDocuments?: WorkspaceFrequentDocument[];
  mobile?: boolean;
  onOpenApp: (viewerPath: string) => void;
  onOpenDocument?: (viewerPath: string) => void;
  onReorderApps: (appNames: string[]) => void;
  onSetAppArchived: (appName: string, archived: boolean) => void;
  onCreateChatMessage?: (message: string) => Promise<void> | void;
}

type DragState = {
  appName: string;
  startX: number;
  startY: number;
  pointerId: number;
  activated: boolean;
};

const NATIVE_DESKTOP_APP_NAME = "desktop";
const DRAG_THRESHOLD = 6;

const getAppLabel = (app: WorkspaceAppLink): string => app.displayName ?? app.name;

const documentKindLabel: Record<string, string> = {
  code: "Code",
  json: "JSON",
  markdown: "Markdown",
  text: "Text",
};

const formatOpenCount = (count: number): string =>
  count === 1 ? "Opened once" : `Opened ${count} times`;

const formatDocumentLocation = (relativePath: string): string => {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "Files";
  }

  return segments.slice(0, -1).join("/");
};

const buildVisibleReorder = (
  allApps: WorkspaceAppLink[],
  visibleApps: WorkspaceAppLink[],
  draggedAppName: string,
  targetAppName: string,
  before: boolean,
): string[] | null => {
  const draggedIndex = visibleApps.findIndex((app) => app.name === draggedAppName);
  const targetIndex = visibleApps.findIndex((app) => app.name === targetAppName);

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return null;
  }

  const reorderedVisibleApps = [...visibleApps];
  const [movedApp] = reorderedVisibleApps.splice(draggedIndex, 1);
  const adjustedTargetIndex = reorderedVisibleApps.findIndex((app) => app.name === targetAppName);
  reorderedVisibleApps.splice(before ? adjustedTargetIndex : adjustedTargetIndex + 1, 0, movedApp);

  const reorderedVisibleNames = reorderedVisibleApps.map((app) => app.name);
  let visibleIndex = 0;

  return allApps.map((app) => {
    if (!visibleApps.some((visibleApp) => visibleApp.name === app.name)) {
      return app.name;
    }

    const nextName = reorderedVisibleNames[visibleIndex];
    visibleIndex += 1;
    return nextName;
  });
};

function NativeAppIcon({ app, large = false }: { app: WorkspaceAppLink; large?: boolean }) {
  const label = getAppLabel(app);

  if (app.iconHref) {
    return (
      <img
        src={app.iconHref}
        alt=""
        aria-hidden
        className={`${large ? "h-24 w-24 rounded-[22px] max-sm:h-[72px] max-sm:w-[72px] max-sm:rounded-2xl" : "h-20 w-20 rounded-[18px]"} object-cover shadow-[0_14px_34px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.08)] transition group-hover:shadow-[0_20px_48px_rgba(15,23,42,0.16),0_4px_10px_rgba(15,23,42,0.08)]`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`${large ? "h-24 w-24 rounded-[22px] text-4xl max-sm:h-[72px] max-sm:w-[72px] max-sm:rounded-2xl max-sm:text-3xl" : "h-20 w-20 rounded-[18px] text-3xl"} flex items-center justify-center bg-gradient-to-br from-blue-500 to-slate-900 font-heading font-bold uppercase text-white shadow-[0_14px_34px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.08)]`}
    >
      {label.charAt(0)}
    </div>
  );
}

export function NativeDesktopHome({
  workspaceApps,
  frequentDocuments = [],
  mobile = false,
  onOpenApp,
  onOpenDocument = onOpenApp,
  onReorderApps,
  onSetAppArchived,
  onCreateChatMessage,
}: NativeDesktopHomeProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    appName: string;
    before: boolean;
  } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dropTargetRef = useRef<{
    appName: string;
    before: boolean;
  } | null>(null);
  const [justDragged, setJustDragged] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);

  const launcherApps = useMemo(
    () => workspaceApps.filter((app) => app.name !== NATIVE_DESKTOP_APP_NAME),
    [workspaceApps],
  );
  const activeApps = useMemo(
    () => launcherApps.filter((app) => !app.archived),
    [launcherApps],
  );
  const archivedApps = useMemo(
    () => launcherApps.filter((app) => app.archived),
    [launcherApps],
  );
  const renderedApps = showArchived ? [...activeApps, ...archivedApps] : activeApps;

  const clearDrag = useCallback(() => {
    dragStateRef.current = null;
    dropTargetRef.current = null;
    setDragState(null);
    setDropTarget(null);
  }, []);

  const updateDragState = useCallback((state: DragState | null) => {
    dragStateRef.current = state;
    setDragState(state);
  }, []);

  const updateDropTarget = useCallback((target: typeof dropTarget) => {
    dropTargetRef.current = target;
    setDropTarget(target);
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || event.pointerId !== current.pointerId) {
        return;
      }

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.activated && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }

      const next = current.activated ? current : { ...current, activated: true };
      if (!current.activated) {
        setJustDragged(true);
        updateDragState(next);
      }

      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-native-desktop-app]");

      if (!target || target.dataset.nativeDesktopApp === next.appName) {
        updateDropTarget(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      updateDropTarget({
        appName: target.dataset.nativeDesktopApp ?? "",
        before: event.clientX - rect.left < rect.width / 2,
      });
    },
    [updateDragState, updateDropTarget],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      const current = dragStateRef.current;
      const currentDropTarget = dropTargetRef.current;
      if (!current || event.pointerId !== current.pointerId) {
        clearDrag();
        return;
      }

      if (current.activated && currentDropTarget?.appName) {
        const visibleGroup = archivedApps.some((app) => app.name === currentDropTarget.appName)
          ? archivedApps
          : activeApps;
        const nextOrder = buildVisibleReorder(
          launcherApps,
          visibleGroup,
          current.appName,
          currentDropTarget.appName,
          currentDropTarget.before,
        );
        if (nextOrder) {
          onReorderApps(nextOrder);
        }
      }

      clearDrag();
      window.setTimeout(() => setJustDragged(false), 0);
    },
    [
      activeApps,
      archivedApps,
      clearDrag,
      handlePointerMove,
      launcherApps,
      onReorderApps,
    ],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, app: WorkspaceAppLink) => {
      if (
        event.button !== 0 ||
        (event.target instanceof HTMLElement && event.target.closest("[data-archive-button]"))
      ) {
        return;
      }

      event.preventDefault();
      updateDragState({
        appName: app.name,
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
        activated: false,
      });
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp, updateDragState],
  );

  const handleSubmitChat = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const message = chatDraft.trim();
      if (!message || !onCreateChatMessage) {
        return;
      }

      setIsSendingChat(true);
      try {
        await onCreateChatMessage(message);
        setChatDraft("");
      } finally {
        setIsSendingChat(false);
      }
    },
    [chatDraft, onCreateChatMessage],
  );

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fbf9f6] text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50 ${
        mobile ? "md:hidden" : ""
      }`}
    >
      <div
        className={`min-h-0 flex-1 overflow-y-auto px-6 py-10 max-sm:px-3 max-sm:py-6 ${
          mobile ? "max-sm:pb-40" : ""
        }`}
      >
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center">
          <div className="grid grid-cols-6 gap-x-4 gap-y-8 max-xl:grid-cols-5 max-lg:grid-cols-4 max-sm:grid-cols-3 max-sm:gap-x-2 max-sm:gap-y-6">
            {renderedApps.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-neutral-300 bg-white/60 p-10 text-center text-sm font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
                No apps found.
              </div>
            ) : null}

            {renderedApps.map((app) => {
              const label = getAppLabel(app);
              const isDropTarget = dropTarget?.appName === app.name && dragState?.appName !== app.name;
              const dropClass = isDropTarget
                ? dropTarget?.before
                  ? "before:absolute before:left-0 before:top-2 before:h-24 before:w-1 before:rounded-full before:bg-blue-600 before:shadow-[0_0_18px_rgba(37,99,235,0.55)] max-sm:before:h-[72px]"
                  : "after:absolute after:right-0 after:top-2 after:h-24 after:w-1 after:rounded-full after:bg-blue-600 after:shadow-[0_0_18px_rgba(37,99,235,0.55)] max-sm:after:h-[72px]"
                : "";
              const isDragging = dragState?.appName === app.name && dragState.activated;

              return (
                <div
                  key={app.name}
                  data-native-desktop-app={app.name}
                  className={`group relative flex touch-none select-none flex-col items-center gap-2 rounded-3xl px-1 py-2 text-center transition ${
                    app.archived ? "opacity-55 saturate-75" : ""
                  } ${isDragging ? "opacity-25" : "hover:-translate-y-1"} ${dropClass}`}
                  title={app.archived ? `${label} (archived)` : label}
                >
                  <button
                    type="button"
                    onPointerDown={(event) => startDrag(event, app)}
                    onClick={(event) => {
                      if (justDragged) {
                        event.preventDefault();
                        return;
                      }
                      onOpenApp(app.viewerPath);
                    }}
                    className="flex flex-col items-center gap-2"
                  >
                    <NativeAppIcon app={app} large />
                    <span className="max-w-32 truncate text-sm font-semibold tracking-[-0.005em] text-neutral-800 dark:text-neutral-100 max-sm:max-w-24 max-sm:text-xs">
                      {label}
                    </span>
                  </button>
                  <button
                    data-archive-button
                    type="button"
                    aria-label={app.archived ? `Unarchive ${label}` : `Archive ${label}`}
                    title={app.archived ? "Unarchive" : "Archive"}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onSetAppArchived(app.name, !app.archived);
                    }}
                    className={`absolute right-5 top-0 flex h-7 w-7 items-center justify-center rounded-full text-white opacity-100 shadow-lg transition md:scale-90 md:opacity-0 md:group-hover:scale-100 md:group-hover:opacity-100 md:group-focus-within:scale-100 md:group-focus-within:opacity-100 ${
                      app.archived ? "bg-cyan-600" : "bg-red-500"
                    }`}
                  >
                    {app.archived ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 4h18v4H3z" />
                        <path d="M5 8v12h14V8" />
                        <path d="M12 18v-7" />
                        <path d="m8 14 4-4 4 4" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 4h18v4H3z" />
                        <path d="M5 8v12h14V8" />
                        <path d="M12 11v7" />
                        <path d="m8 15 4 4 4-4" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {archivedApps.length > 0 ? (
            <footer
              className={
                mobile
                  ? "pointer-events-none fixed inset-x-0 bottom-[132px] z-20 flex justify-center px-3 md:hidden"
                  : "mt-8 flex justify-center"
              }
            >
              <button
                type="button"
                onClick={() => setShowArchived((value) => !value)}
                className="pointer-events-auto rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-neutral-500 shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-900/90 dark:text-neutral-400 dark:ring-white/10 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              >
                {showArchived
                  ? `Hide archived apps (${archivedApps.length})`
                  : `Show archived apps (${archivedApps.length})`}
              </button>
            </footer>
          ) : null}

          <section className="mt-10 rounded-[2rem] bg-white/70 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-black/5 backdrop-blur dark:bg-neutral-900/70 dark:ring-white/10 max-sm:mt-8 max-sm:rounded-3xl max-sm:p-4">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.16em] text-neutral-950 dark:text-neutral-50">
                  Frequently opened
                </h2>
                <p className="mt-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  Quick access to the documents you keep coming back to.
                </p>
              </div>
              {frequentDocuments.length > 0 ? (
                <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-bold text-white dark:bg-neutral-50 dark:text-neutral-950">
                  Top {frequentDocuments.length}
                </span>
              ) : null}
            </div>

            {frequentDocuments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-4 py-5 text-sm font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-400">
                Open a markdown, text, code, or JSON file and it will show up here.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                {frequentDocuments.map(({ entry, openCount }) => (
                  <button
                    key={entry.viewerPath}
                    type="button"
                    onClick={() => entry.viewerPath && onOpenDocument(entry.viewerPath)}
                    className="group flex min-w-0 items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-neutral-950 to-neutral-700 text-sm font-black uppercase text-white shadow-inner dark:from-neutral-100 dark:to-neutral-300 dark:text-neutral-950">
                      {entry.name.split(".").pop()?.slice(0, 2) ?? "F"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-neutral-950 dark:text-neutral-50">
                        {entry.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        {formatDocumentLocation(entry.relativePath)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 flex-col items-end sm:flex">
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                        {documentKindLabel[entry.kind] ?? "File"}
                      </span>
                      <span className="mt-1 text-[11px] font-semibold text-neutral-400">
                        {formatOpenCount(openCount)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {mobile && onCreateChatMessage ? (
        <form
          onSubmit={handleSubmitChat}
          className="pointer-events-none fixed inset-x-0 bottom-[72px] z-30 px-3 pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 p-2 pl-4 shadow-[0_18px_42px_rgba(15,23,42,0.16),0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-black/5 backdrop-blur dark:bg-neutral-900/95 dark:ring-white/10">
            <input
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder="Chat with Lilo"
              enterKeyHint="send"
              className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-neutral-400 dark:text-neutral-100"
            />
            <button
              type="submit"
              disabled={!chatDraft.trim() || isSendingChat}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-slate-950 text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-35"
              aria-label="Send"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
