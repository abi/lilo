import { WorkspaceSidebar } from "../workspace/WorkspaceSidebar";
import type { WorkspaceAppLink, WorkspaceEntry } from "../workspace/types";

interface ChatSidebarProps {
  selectedViewerPath: string | null;
  workspaceTimeZone: string;
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  onSelectApp: (href: string) => void;
  onRefreshWorkspace: () => void;
  onSaveWorkspaceTimeZone: (timeZone: string) => void;
  onReorderApps: (appNames: string[]) => void;
}

export function ChatSidebar({
  selectedViewerPath,
  workspaceTimeZone,
  workspaceApps,
  workspaceEntries,
  onSelectApp,
  onRefreshWorkspace,
  onSaveWorkspaceTimeZone,
  onReorderApps,
}: ChatSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center px-4 py-3">
        <h1 className="font-heading text-sm font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
          Workspace
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden border-t border-neutral-200 dark:border-neutral-700">
        <WorkspaceSidebar
          workspaceApps={workspaceApps}
          workspaceEntries={workspaceEntries}
          selectedViewerPath={selectedViewerPath}
          workspaceTimeZone={workspaceTimeZone}
          onSelectApp={onSelectApp}
          onRefresh={onRefreshWorkspace}
          onTimeZoneChange={onSaveWorkspaceTimeZone}
          onReorderApps={onReorderApps}
        />
      </div>
    </aside>
  );
}
