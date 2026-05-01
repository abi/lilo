import { CloudSyncButton } from "../CloudSyncButton";
import { WorkspaceSidebar } from "../workspace/WorkspaceSidebar";
import type {
  WorkspaceAppLink,
  WorkspaceEntry,
  WorkspacePreferences,
  WorkspaceTemplateUpdate,
} from "../workspace/types";

interface MobileWorkspaceScreenProps {
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  selectedViewerPath: string | null;
  workspaceTimeZone: string;
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  defaultChatModelSelection?: WorkspacePreferences["defaultChatModelSelection"];
  templateUpdates: WorkspaceTemplateUpdate[];
  syncError?: string | null;
  onSelectApp: (href: string) => void;
  onRefreshWorkspace: () => void;
  onSaveWorkspaceTimeZone: (timeZone: string) => void;
  onDefaultChatModelChange: (
    selection: NonNullable<WorkspacePreferences["defaultChatModelSelection"]>,
  ) => Promise<void> | void;
  onRequestTemplateUpdate: (update: WorkspaceTemplateUpdate) => void;
  onDismissTemplateUpdate: (update: WorkspaceTemplateUpdate) => Promise<void>;
  onReorderApps: (appNames: string[]) => void;
  onSynced: () => void;
  onSyncError: (error: string) => void;
  onClearSyncError: () => void;
}

export function MobileWorkspaceScreen({
  workspaceApps,
  workspaceEntries,
  selectedViewerPath,
  workspaceTimeZone,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  defaultChatModelSelection,
  templateUpdates,
  syncError,
  onSelectApp,
  onRefreshWorkspace,
  onSaveWorkspaceTimeZone,
  onDefaultChatModelChange,
  onRequestTemplateUpdate,
  onDismissTemplateUpdate,
  onReorderApps,
  onSynced,
  onSyncError,
  onClearSyncError,
}: MobileWorkspaceScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900 md:hidden">
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-neutral-900 dark:text-neutral-100">
          Workspace
        </h2>
        <div className="mt-2">
          <CloudSyncButton
            onSynced={onSynced}
            onError={onSyncError}
            externalError={syncError}
            onClearExternalError={onClearSyncError}
            className="flex-1"
          />
        </div>
      </header>
      <WorkspaceSidebar
        mobile
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
  );
}
