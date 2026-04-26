import { useWorkspaceTreeState } from "./hooks/useWorkspaceTreeState";
import { WorkspaceSidebarHeader } from "./WorkspaceSidebarHeader";
import { WorkspaceTree } from "./tree/WorkspaceTree";
import type { WorkspaceAppLink, WorkspaceEntry, WorkspaceTemplateUpdate } from "./types";

export type { WorkspaceAppLink, WorkspaceEntry, WorkspaceEntryKind } from "./types";

interface WorkspaceSidebarProps {
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  selectedViewerPath: string | null;
  workspaceTimeZone: string;
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  templateUpdates?: WorkspaceTemplateUpdate[];
  mobile?: boolean;
  onSelectApp: (href: string) => void;
  onRefresh: () => void;
  onTimeZoneChange: (timeZone: string) => void;
  onRequestTemplateUpdate?: (update: WorkspaceTemplateUpdate) => void;
  onReorderApps?: (appNames: string[]) => void;
}

export function WorkspaceSidebar({
  workspaceApps,
  workspaceEntries,
  selectedViewerPath,
  workspaceTimeZone,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  templateUpdates = [],
  mobile = false,
  onSelectApp,
  onRefresh,
  onTimeZoneChange,
  onRequestTemplateUpdate,
  onReorderApps,
}: WorkspaceSidebarProps) {
  const {
    showArchived,
    setShowArchived,
    expandedPaths,
    childrenByParent,
    selectedEntry,
    visibleAppEntries,
    archivedAppEntries,
    otherTopLevelEntries,
    toggleExpanded,
    setExpanded,
  } = useWorkspaceTreeState({
    workspaceApps,
    workspaceEntries,
    selectedViewerPath,
  });

  return (
    <div className="flex h-full flex-col">
      <WorkspaceSidebarHeader
        mobile={mobile}
        onRefresh={onRefresh}
        workspaceTimeZone={workspaceTimeZone}
        workspaceGitRemoteUrl={workspaceGitRemoteUrl}
        workspaceGitBrowserUrl={workspaceGitBrowserUrl}
        templateUpdates={templateUpdates}
        onTimeZoneChange={onTimeZoneChange}
        onRequestTemplateUpdate={onRequestTemplateUpdate}
      />

      <div className={`${mobile ? "px-4 pb-4" : "px-4 pb-4"} min-h-0 flex-1 overflow-y-auto`}>
        {workspaceApps.length === 0 && workspaceEntries.length === 0 ? (
          <p className="text-sm text-neutral-400">No files found.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <WorkspaceTree
              entries={visibleAppEntries}
              workspaceApps={workspaceApps}
              childrenByParent={childrenByParent}
              expandedPaths={expandedPaths}
              selectedViewerPath={selectedViewerPath}
              selectedEntry={selectedEntry}
              onSelectApp={onSelectApp}
              onToggleExpanded={toggleExpanded}
              onSetExpanded={setExpanded}
              onReorderApps={onReorderApps}
            />

            <WorkspaceTree
              entries={otherTopLevelEntries}
              workspaceApps={workspaceApps}
              childrenByParent={childrenByParent}
              expandedPaths={expandedPaths}
              selectedViewerPath={selectedViewerPath}
              selectedEntry={selectedEntry}
              onSelectApp={onSelectApp}
              onToggleExpanded={toggleExpanded}
              onSetExpanded={setExpanded}
              onReorderApps={onReorderApps}
            />

            {archivedAppEntries.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowArchived((value) => !value)}
                  className="mt-2 flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-widest text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <svg
                    className={`h-3 w-3 shrink-0 transition ${showArchived ? "rotate-90" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  Archived ({archivedAppEntries.length})
                </button>
                {showArchived ? (
                  <div className="flex flex-col gap-1 opacity-70">
                    <WorkspaceTree
                      entries={archivedAppEntries}
                      workspaceApps={workspaceApps}
                      childrenByParent={childrenByParent}
                      expandedPaths={expandedPaths}
                      selectedViewerPath={selectedViewerPath}
                      selectedEntry={selectedEntry}
                      onSelectApp={onSelectApp}
                      onToggleExpanded={toggleExpanded}
                      onSetExpanded={setExpanded}
                      onReorderApps={onReorderApps}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
