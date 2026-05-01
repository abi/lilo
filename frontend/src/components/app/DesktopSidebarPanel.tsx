import type {
  WorkspaceAppLink,
  WorkspaceEntry,
  WorkspacePreferences,
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
  defaultChatModelSelection?: WorkspacePreferences["defaultChatModelSelection"];
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  templateUpdates: WorkspaceTemplateUpdate[];
  onSelectApp: (href: string) => void;
  onRefreshWorkspace: () => void;
  onSaveWorkspaceTimeZone: (timeZone: string) => void;
  onDefaultChatModelChange: (
    selection: NonNullable<WorkspacePreferences["defaultChatModelSelection"]>,
  ) => Promise<void> | void;
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
  defaultChatModelSelection,
  workspaceApps,
  workspaceEntries,
  templateUpdates,
  onSelectApp,
  onRefreshWorkspace,
  onSaveWorkspaceTimeZone,
  onDefaultChatModelChange,
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
        defaultChatModelSelection={defaultChatModelSelection}
        workspaceApps={workspaceApps}
        workspaceEntries={workspaceEntries}
        templateUpdates={templateUpdates}
        onSelectApp={onSelectApp}
        onRefreshWorkspace={onRefreshWorkspace}
        onSaveWorkspaceTimeZone={onSaveWorkspaceTimeZone}
        onDefaultChatModelChange={onDefaultChatModelChange}
        onRequestTemplateUpdate={onRequestTemplateUpdate}
        onDismissTemplateUpdate={onDismissTemplateUpdate}
        onReorderApps={onReorderApps}
      />
    </div>
  );
}
