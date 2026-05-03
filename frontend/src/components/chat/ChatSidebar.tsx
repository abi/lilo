import { WorkspaceSidebar } from "../workspace/WorkspaceSidebar";
import type {
  WorkspaceAppLink,
  WorkspaceEntry,
  WorkspacePreferences,
  WorkspaceTemplateUpdate,
} from "../workspace/types";

interface ChatSidebarProps {
  selectedViewerPath: string | null;
  workspaceTimeZone: string;
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  defaultChatModelSelection?: WorkspacePreferences["defaultChatModelSelection"];
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

export function ChatSidebar({
  selectedViewerPath,
  workspaceTimeZone,
  workspaceApps,
  workspaceEntries,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  defaultChatModelSelection,
  templateUpdates,
  onSelectApp,
  onRefreshWorkspace,
  onSaveWorkspaceTimeZone,
  onDefaultChatModelChange,
  onRequestTemplateUpdate,
  onDismissTemplateUpdate,
  onReorderApps,
}: ChatSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center px-4 py-3">
        <h1 className="font-heading text-sm font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
          Files
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden border-t border-neutral-200 dark:border-neutral-700">
        <WorkspaceSidebar
          workspaceApps={workspaceApps}
          workspaceEntries={workspaceEntries}
          selectedViewerPath={selectedViewerPath}
          workspaceTimeZone={workspaceTimeZone}
          workspaceGitRemoteUrl={workspaceGitRemoteUrl}
          workspaceGitBrowserUrl={workspaceGitBrowserUrl}
          defaultChatModelSelection={defaultChatModelSelection}
          templateUpdates={templateUpdates}
          onSelectApp={onSelectApp}
          onRefresh={onRefreshWorkspace}
          onTimeZoneChange={onSaveWorkspaceTimeZone}
          onDefaultChatModelChange={onDefaultChatModelChange}
          onRequestTemplateUpdate={onRequestTemplateUpdate}
          onDismissTemplateUpdate={onDismissTemplateUpdate}
          onReorderApps={onReorderApps}
        />
      </div>
    </aside>
  );
}
