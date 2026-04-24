import { useCallback, useState } from "react";
import { CloudSyncButton } from "../CloudSyncButton";
import { WorkspaceSettingsButton } from "../workspace/WorkspaceSettingsButton";
import type { WorkspaceAppLink } from "../workspace/types";

interface DesktopCollapsedSidebarStripProps {
  workspaceApps: WorkspaceAppLink[];
  selectedViewerPath: string | null;
  showArchived: boolean;
  sidebarOpen: boolean;
  theme: "light" | "dark" | "system";
  workspaceTimeZone: string;
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  onToggleSidebar: () => void;
  onToggleArchived: () => void;
  onSelectApp: (href: string) => void;
  onReorderApps: (appNames: string[]) => void;
  onSelectTheme: (theme: "light" | "dark" | "system") => void;
  onSaveWorkspaceTimeZone: (timeZone: string) => void;
  onOpenCommandPalette: () => void;
  onSync?: () => void;
  onSyncError?: (error: string) => void;
  syncError?: string | null;
  onClearSyncError?: () => void;
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
const commandKeyShortcut = isMac ? "\u2318K" : "Ctrl+K";

const reorderVisibleApps = (
  workspaceApps: WorkspaceAppLink[],
  visibleApps: WorkspaceAppLink[],
  draggedAppName: string,
  targetAppName: string,
): string[] | null => {
  const draggedIndex = visibleApps.findIndex((app) => app.name === draggedAppName);
  const targetIndex = visibleApps.findIndex((app) => app.name === targetAppName);

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return null;
  }

  const reorderedVisibleApps = [...visibleApps];
  const [movedApp] = reorderedVisibleApps.splice(draggedIndex, 1);
  reorderedVisibleApps.splice(targetIndex, 0, movedApp);

  const reorderedNames = reorderedVisibleApps.map((app) => app.name);
  let reorderedVisibleIndex = 0;

  return workspaceApps.map((app) => {
    if (!visibleApps.some((visibleApp) => visibleApp.name === app.name)) {
      return app.name;
    }

    const nextName = reorderedNames[reorderedVisibleIndex];
    reorderedVisibleIndex += 1;
    return nextName;
  });
};

function AppIcon({
  app,
}: {
  app: WorkspaceAppLink;
}) {
  if (app.iconHref) {
    return (
      <img
        src={app.iconHref}
        alt={app.name}
        className="h-11 w-11 rounded-lg object-cover"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-200 text-sm font-bold uppercase text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
      {app.displayName ? app.displayName.charAt(0) : "?"}
    </div>
  );
}

function AppButton({
  app,
  selectedViewerPath,
  archived = false,
  isDropTarget = false,
  pinned = false,
  onSelectApp,
  onDragStart,
  onDragEnd,
  onDragOverItem,
  onDropOnItem,
}: {
  app: WorkspaceAppLink;
  selectedViewerPath: string | null;
  archived?: boolean;
  isDropTarget?: boolean;
  pinned?: boolean;
  onSelectApp: (href: string) => void;
  onDragStart: (appName: string) => void;
  onDragEnd: () => void;
  onDragOverItem: (appName: string) => void;
  onDropOnItem: (appName: string) => void;
}) {
  const isActive = selectedViewerPath?.startsWith(app.href);
  const label = app.displayName ?? app.name;
  const dragHandlers = pinned
    ? {}
    : {
        draggable: true,
        onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", app.name);
          onDragStart(app.name);
        },
        onDragEnd,
        onDragOver: (event: React.DragEvent<HTMLButtonElement>) => {
          event.preventDefault();
          onDragOverItem(app.name);
        },
        onDrop: (event: React.DragEvent<HTMLButtonElement>) => {
          event.preventDefault();
          onDropOnItem(app.name);
        },
      };

  return (
    <button
      type="button"
      {...dragHandlers}
      onClick={() => onSelectApp(app.viewerPath)}
      className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition ${
        isActive ? "bg-neutral-100 dark:bg-neutral-800" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      } ${archived ? "opacity-60" : ""} ${
        isDropTarget ? "ring-2 ring-neutral-300 dark:ring-neutral-600" : ""
      }`}
      title={archived ? `${label} (archived)` : label}
    >
      <AppIcon app={app} />
      <span className="line-clamp-2 w-full break-words text-center text-[10px] font-medium leading-tight text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
    </button>
  );
}

export function DesktopCollapsedSidebarStrip({
  workspaceApps,
  selectedViewerPath,
  showArchived,
  sidebarOpen,
  theme,
  workspaceTimeZone,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  onToggleSidebar,
  onToggleArchived,
  onSelectApp,
  onReorderApps,
  onSelectTheme,
  onSaveWorkspaceTimeZone,
  onOpenCommandPalette,
  onSync,
  onSyncError,
  syncError,
  onClearSyncError,
}: DesktopCollapsedSidebarStripProps) {
  const [draggedAppName, setDraggedAppName] = useState<string | null>(null);
  const [dropTargetAppName, setDropTargetAppName] = useState<string | null>(null);
  const desktopApp = workspaceApps.find((app) => app.name === "desktop");
  const activeApps = workspaceApps.filter(
    (app) => !app.archived && app.name !== "desktop",
  );
  const archivedApps = workspaceApps.filter(
    (app) => app.archived && app.name !== "desktop",
  );
  const handleDropOnApp = useCallback(
    (targetAppName: string) => {
      if (!draggedAppName || draggedAppName === targetAppName) {
        setDraggedAppName(null);
        setDropTargetAppName(null);
        return;
      }

      const visibleApps = archivedApps.some((app) => app.name === targetAppName)
        ? archivedApps
        : activeApps;
      const reorderedAppNames = reorderVisibleApps(
        workspaceApps,
        visibleApps,
        draggedAppName,
        targetAppName,
      );

      if (reorderedAppNames) {
        onReorderApps(reorderedAppNames);
      }

      setDraggedAppName(null);
      setDropTargetAppName(null);
    },
    [activeApps, archivedApps, draggedAppName, onReorderApps, workspaceApps],
  );

  const isDesktopActive =
    desktopApp && selectedViewerPath?.startsWith(desktopApp.href);

  return (
    <div className="hidden min-h-0 w-24 shrink-0 flex-col items-center gap-2 border-r border-neutral-200 bg-white px-2 py-3 dark:border-neutral-700 dark:bg-neutral-900 md:flex">
      <button
        type="button"
        onClick={() => {
          if (desktopApp) {
            onSelectApp(desktopApp.viewerPath);
          }
        }}
        disabled={!desktopApp}
        className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition disabled:cursor-default disabled:opacity-100 ${
          isDesktopActive
            ? "bg-neutral-100 dark:bg-neutral-800"
            : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
        title={desktopApp ? "Open Desktop" : "Lilo"}
      >
        <img
          src="/favicon.svg"
          alt=""
          aria-hidden
          className="h-9 w-9 shrink-0 object-contain"
        />
        <span className="font-heading text-xs font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Lilo
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleSidebar}
        className={`flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition ${
          sidebarOpen
            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
            : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        }`}
        title={sidebarOpen ? "Hide workspace" : "Show workspace"}
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <span className="text-[10px] font-medium">Workspace</span>
      </button>

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        title={`Search apps (${commandKeyShortcut})`}
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1 py-0 font-sans text-[9px] font-medium leading-tight text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          {commandKeyShortcut}
        </kbd>
      </button>

      <div className="my-1 h-px w-10 bg-neutral-200 dark:bg-neutral-700" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
        {activeApps.map((app) => (
          <AppButton
            key={app.name}
            app={app}
            selectedViewerPath={selectedViewerPath}
            onSelectApp={onSelectApp}
            isDropTarget={dropTargetAppName === app.name && draggedAppName !== app.name}
            onDragStart={(appName) => {
              setDraggedAppName(appName);
              setDropTargetAppName(appName);
            }}
            onDragEnd={() => {
              setDraggedAppName(null);
              setDropTargetAppName(null);
            }}
            onDragOverItem={setDropTargetAppName}
            onDropOnItem={handleDropOnApp}
          />
        ))}

        {archivedApps.length > 0 ? (
          <>
            <div className="my-1 h-px w-10 bg-neutral-200 dark:bg-neutral-700" />
            <button
              type="button"
              onClick={onToggleArchived}
              className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              title={showArchived ? "Hide archived" : "Show archived"}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="5" rx="1" />
                <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                <path d="M10 12h4" />
              </svg>
              <span className="w-full truncate text-center text-[10px] font-medium">
                {showArchived ? "Hide" : `${archivedApps.length} archived`}
              </span>
            </button>
            {showArchived
              ? archivedApps.map((app) => (
                  <AppButton
                    key={app.name}
                    app={app}
                    selectedViewerPath={selectedViewerPath}
                    archived
                    onSelectApp={onSelectApp}
                    isDropTarget={dropTargetAppName === app.name && draggedAppName !== app.name}
                    onDragStart={(appName) => {
                      setDraggedAppName(appName);
                      setDropTargetAppName(appName);
                    }}
                    onDragEnd={() => {
                      setDraggedAppName(null);
                      setDropTargetAppName(null);
                    }}
                    onDragOverItem={setDropTargetAppName}
                    onDropOnItem={handleDropOnApp}
                  />
                ))
              : null}
          </>
        ) : null}
      </div>

      <div className="mt-auto flex shrink-0 flex-col items-center gap-1 pt-2">
        <div className="mb-1 h-px w-10 bg-neutral-200 dark:bg-neutral-700" />
        {onSync ? (
          <CloudSyncButton
            vertical
            onSynced={onSync}
            onError={onSyncError}
            externalError={syncError}
            onClearExternalError={onClearSyncError}
          />
        ) : null}
        <WorkspaceSettingsButton
          workspaceTimeZone={workspaceTimeZone}
          workspaceGitRemoteUrl={workspaceGitRemoteUrl}
          workspaceGitBrowserUrl={workspaceGitBrowserUrl}
          onTimeZoneChange={onSaveWorkspaceTimeZone}
          theme={theme}
          onSelectTheme={onSelectTheme}
          title="Settings"
          label="Settings"
          triggerClassName="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        />
      </div>
    </div>
  );
}
