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
        <svg viewBox="0 0 2048 1837" className="h-9 w-9 shrink-0" aria-hidden>
          <defs>
            <linearGradient
              id="stripLogoGrad"
              x1="247.588"
              y1="385.958"
              x2="1526.08"
              y2="1642.72"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#00d4aa" />
              <stop offset="1" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <path
            fill="url(#stripLogoGrad)"
            d="M 637.537 154.42 C 687.037 152.046 744.732 155.51 793.933 161.548 C 1005.35 187.302 1204.5 274.743 1366.53 412.96 C 1587.76 601.684 1723.95 871.333 1744.54 1161.39 C 1747.44 1198.78 1748.56 1248.63 1744.75 1285.3 C 1735.18 1376.08 1698.31 1461.82 1639.01 1531.22 C 1556.67 1627.25 1447.96 1679.26 1322.68 1688.9 C 1263.78 1690.31 1205.62 1689.88 1146.71 1689.88 L 895.102 1689.87 L 737.873 1689.86 C 676.216 1689.9 625.867 1692.38 565.102 1679.03 C 491.64 1662.77 423.431 1628.34 366.723 1578.89 C 276.394 1500.52 220.892 1389.47 212.422 1270.18 C 209.77 1229.72 211.047 1180.06 211.047 1138.77 L 211.057 920.065 L 211.059 707.633 C 211.054 640.647 207.439 573.144 221.904 507.66 C 238.248 433.914 272.848 365.452 322.531 308.555 C 402.429 216.77 516.037 161.181 637.537 154.42 z"
          />
          <path
            fill="#f5f5f5"
            d="M 957.843 634.507 C 1116.65 622.701 1254.89 742.029 1266.41 900.858 C 1277.93 1059.69 1158.35 1197.71 999.501 1208.94 C 841.057 1220.14 703.463 1100.94 691.974 942.516 C 680.485 784.093 799.441 646.283 957.843 634.507 z"
          />
        </svg>
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
