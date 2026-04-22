import { useWorkspaceCatalog } from "./useWorkspaceCatalog";
import { useWorkspaceFileViewer } from "./useWorkspaceFileViewer";

interface UseWorkspaceStateOptions {
  activeChatId: string | null;
  initializationError: string | null;
  initialize: () => Promise<void>;
  workspaceVersion: number;
  sendMessage: (chatId: string, message: string) => Promise<void>;
}

export function useWorkspaceState(options: UseWorkspaceStateOptions) {
  const workspaceCatalog = useWorkspaceCatalog(options);
  const fileViewer = useWorkspaceFileViewer({
    selectedViewerPath: workspaceCatalog.selectedViewerPath,
    workspaceEntries: workspaceCatalog.workspaceEntries,
    viewerRefreshKey: workspaceCatalog.viewerRefreshKey,
  });

  return {
    ...workspaceCatalog,
    ...fileViewer,
  };
}
