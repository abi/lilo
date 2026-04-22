import type { WorkspaceAppLink, WorkspaceEntry } from "../workspace/types";
import { ChatSidebar } from "../chat/ChatSidebar";

interface DesktopSidebarPanelProps {
  width: number;
  hidden: boolean;
  selectedViewerPath: string | null;
  workspaceTimeZone: string;
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  onSelectApp: (href: string) => void;
  onRefreshWorkspace: () => void;
  onSaveWorkspaceTimeZone: (timeZone: string) => void;
  onReorderApps: (appNames: string[]) => void;
}

export function DesktopSidebarPanel({
  width,
  hidden,
  selectedViewerPath,
  workspaceTimeZone,
  workspaceApps,
  workspaceEntries,
  onSelectApp,
  onRefreshWorkspace,
  onSaveWorkspaceTimeZone,
  onReorderApps,
}: DesktopSidebarPanelProps) {
  return (
    <div
      className={`shrink-0 transition-all ${hidden ? "hidden" : "hidden md:block"}`}
      style={{ width: `${width}px` }}
    >
      <ChatSidebar
        selectedViewerPath={selectedViewerPath}
        workspaceTimeZone={workspaceTimeZone}
        workspaceApps={workspaceApps}
        workspaceEntries={workspaceEntries}
        onSelectApp={onSelectApp}
        onRefreshWorkspace={onRefreshWorkspace}
        onSaveWorkspaceTimeZone={onSaveWorkspaceTimeZone}
        onReorderApps={onReorderApps}
      />
    </div>
  );
}
