import type {
  WorkspaceAppLink,
  WorkspaceEntry,
  WorkspaceTemplateUpdate,
} from "../workspace/types";
import { ChatSidebar } from "../chat/ChatSidebar";

interface DesktopSidebarPanelProps {
  width: number;
  hidden: boolean;
  selectedViewerPath: string | null;
  workspaceTimeZone: string;
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  templateUpdates: WorkspaceTemplateUpdate[];
  onSelectApp: (href: string) => void;
  onRefreshWorkspace: () => void;
  onSaveWorkspaceTimeZone: (timeZone: string) => void;
  onRequestTemplateUpdate: (update: WorkspaceTemplateUpdate) => void;
  onDismissTemplateUpdate: (update: WorkspaceTemplateUpdate) => Promise<void>;
  onReorderApps: (appNames: string[]) => void;
}

export function DesktopSidebarPanel({
  width,
  hidden,
  selectedViewerPath,
  workspaceTimeZone,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  workspaceApps,
  workspaceEntries,
  templateUpdates,
  onSelectApp,
  onRefreshWorkspace,
  onSaveWorkspaceTimeZone,
  onRequestTemplateUpdate,
  onDismissTemplateUpdate,
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
        workspaceGitRemoteUrl={workspaceGitRemoteUrl}
        workspaceGitBrowserUrl={workspaceGitBrowserUrl}
        workspaceApps={workspaceApps}
        workspaceEntries={workspaceEntries}
        templateUpdates={templateUpdates}
        onSelectApp={onSelectApp}
        onRefreshWorkspace={onRefreshWorkspace}
        onSaveWorkspaceTimeZone={onSaveWorkspaceTimeZone}
        onRequestTemplateUpdate={onRequestTemplateUpdate}
        onDismissTemplateUpdate={onDismissTemplateUpdate}
        onReorderApps={onReorderApps}
      />
    </div>
  );
}
