import { useCallback, useEffect, useMemo, useState } from "react";
import { DISABLE_WORKSPACE_SYNC } from "../config/runtime";
import { UnauthorizedError, authFetch } from "../lib/auth";
import type {
  WorkspaceAppLink,
  WorkspaceEntry,
  WorkspacePreferences,
} from "../components/workspace/types";
import { API_BASE_URL, formatSetupError, parseErrorMessage } from "./workspace/utils";

const DEFAULT_WORKSPACE_TIME_ZONE = "America/New_York";
const SELECTED_VIEWER_PATH_STORAGE_KEY = "lilo-selected-viewer-path";

const readStoredSelectedViewerPath = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(SELECTED_VIEWER_PATH_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredSelectedViewerPath = (viewerPath: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!viewerPath) {
      localStorage.removeItem(SELECTED_VIEWER_PATH_STORAGE_KEY);
      return;
    }

    localStorage.setItem(SELECTED_VIEWER_PATH_STORAGE_KEY, viewerPath);
  } catch {
    // ignore storage failures
  }
};

const reorderWorkspaceApps = (
  workspaceApps: WorkspaceAppLink[],
  appNames: string[],
): WorkspaceAppLink[] => {
  const uniqueNames = [...new Set(appNames)];
  const currentNames = workspaceApps.map((app) => app.name);

  if (
    uniqueNames.length !== currentNames.length ||
    currentNames.some((name) => !uniqueNames.includes(name))
  ) {
    throw new Error("appNames must include every workspace app exactly once");
  }

  const appByName = new Map(workspaceApps.map((app) => [app.name, app]));
  return uniqueNames.map((name) => {
    const app = appByName.get(name);
    if (!app) {
      throw new Error(`Unknown workspace app: ${name}`);
    }
    return app;
  });
};

const setWorkspaceAppArchived = (
  workspaceApps: WorkspaceAppLink[],
  appName: string,
  archived: boolean,
): WorkspaceAppLink[] => {
  let found = false;
  const nextApps = workspaceApps.map((app) => {
    if (app.name !== appName) {
      return app;
    }

    found = true;
    return {
      ...app,
      archived: archived || undefined,
    };
  });

  if (!found) {
    throw new Error(`Unknown workspace app: ${appName}`);
  }

  return nextApps;
};

const getArchivedAppNames = (workspaceApps: WorkspaceAppLink[]): string[] =>
  workspaceApps.filter((app) => app.archived).map((app) => app.name);

interface UseWorkspaceCatalogOptions {
  activeChatId: string | null;
  initializationError: string | null;
  initialize: () => Promise<void>;
  workspaceVersion: number;
  sendMessage: (chatId: string, message: string) => Promise<void>;
}

export function useWorkspaceCatalog({
  activeChatId,
  initializationError,
  initialize,
  workspaceVersion,
  sendMessage,
}: UseWorkspaceCatalogOptions) {
  const [workspaceApps, setWorkspaceApps] = useState<WorkspaceAppLink[]>([]);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([]);
  const [selectedViewerPath, setSelectedViewerPath] = useState<string | null>(() =>
    readStoredSelectedViewerPath(),
  );
  const [viewerRefreshKey, setViewerRefreshKey] = useState(0);
  const [silentSyncError, setSilentSyncError] = useState<string | null>(null);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>({
    timeZone: DEFAULT_WORKSPACE_TIME_ZONE,
  });

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/workspace/apps`, { signal });
      if (!response.ok) {
        if (response.status === 401) {
          throw new UnauthorizedError();
        }
        setWorkspaceLoadError(
          await parseErrorMessage(response, `Failed to load workspace (${response.status})`),
        );
        return;
      }

      const payload = (await response.json()) as {
        apps?: WorkspaceAppLink[];
        entries?: WorkspaceEntry[];
        preferences?: Partial<WorkspacePreferences>;
      };

      const apps = payload.apps ?? [];
      const entries = payload.entries ?? [];
      setWorkspaceApps(apps);
      setWorkspaceEntries(entries);
      setWorkspacePreferences({
        timeZone: payload.preferences?.timeZone ?? DEFAULT_WORKSPACE_TIME_ZONE,
        gitRemoteUrl: payload.preferences?.gitRemoteUrl,
      });
      setWorkspaceLoadError(null);
      setSelectedViewerPath((current) => {
        if (
          current &&
          (entries.some((entry) => entry.viewerPath === current) ||
            apps.some((app) => app.viewerPath === current || app.href === current))
        ) {
          return current;
        }

        const firstActiveApp = apps.find((app) => !app.archived) ?? apps[0];
        if (firstActiveApp) {
          return firstActiveApp.viewerPath;
        }

        return entries.find((entry) => entry.viewerPath)?.viewerPath ?? null;
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setWorkspaceLoadError(
        error instanceof Error ? error.message : "Failed to load workspace",
      );
    }
  }, []);

  const refreshViewer = useCallback(() => {
    setViewerRefreshKey((value) => value + 1);
  }, []);

  const onSynced = useCallback(() => {
    void loadWorkspace();
    refreshViewer();
  }, [loadWorkspace, refreshViewer]);

  const onSyncError = useCallback(
    (error: string) => {
      if (!activeChatId) {
        return;
      }

      void sendMessage(
        activeChatId,
        `Cloud sync failed with this error. Please fix it:\n\n${error}`,
      );
    },
    [activeChatId, sendMessage],
  );

  const silentSync = useCallback(async () => {
    if (DISABLE_WORKSPACE_SYNC) {
      setSilentSyncError(null);
      return;
    }

    try {
      const response = await authFetch(`${API_BASE_URL}/workspace/sync`, { method: "POST" });
      if (response.ok) {
        setSilentSyncError(null);
        void loadWorkspace();
        refreshViewer();
      } else {
        const body = await response.json().catch(() => null);
        const message = body?.details ?? body?.error ?? `Sync failed (${response.status})`;
        setSilentSyncError(message);
      }
    } catch {
      setSilentSyncError("Network error");
    }
  }, [loadWorkspace, refreshViewer]);

  const clearSilentSyncError = useCallback(() => {
    setSilentSyncError(null);
  }, []);

  const setAppOrder = useCallback(
    async (appNames: string[]) => {
      const previousApps = workspaceApps;
      const nextApps = reorderWorkspaceApps(workspaceApps, appNames);

      setWorkspaceApps(nextApps);

      try {
        const response = await authFetch(`${API_BASE_URL}/workspace/app-order`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ appNames: nextApps.map((app) => app.name) }),
        });

        if (!response.ok) {
          throw new Error(
            await parseErrorMessage(response, "Failed to save app order"),
          );
        }
        return nextApps;
      } catch (error) {
        setWorkspaceApps(previousApps);
        throw error instanceof Error
          ? error
          : new Error("Failed to save app order");
      }
    },
    [workspaceApps],
  );

  const setAppArchived = useCallback(
    async (appName: string, archived: boolean) => {
      const previousApps = workspaceApps;
      const nextApps = setWorkspaceAppArchived(workspaceApps, appName, archived);
      const nextArchivedNames = getArchivedAppNames(nextApps);

      setWorkspaceApps(nextApps);

      try {
        const response = await authFetch(`${API_BASE_URL}/workspace/app-archive`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ archivedAppNames: nextArchivedNames }),
        });

        if (!response.ok) {
          throw new Error(
            await parseErrorMessage(response, "Failed to save app archive state"),
          );
        }
        return nextApps;
      } catch (error) {
        setWorkspaceApps(previousApps);
        throw error instanceof Error
          ? error
          : new Error("Failed to save app archive state");
      }
    },
    [workspaceApps],
  );

  const saveAppOrder = useCallback(
    async (appNames: string[]) => {
      await setAppOrder(appNames).catch(() => undefined);
    },
    [setAppOrder],
  );

  const saveArchivedApps = useCallback(
    async (appName: string, archived: boolean) => {
      await setAppArchived(appName, archived).catch(() => undefined);
    },
    [setAppArchived],
  );

  const saveWorkspaceTimeZone = useCallback(
    async (timeZone: string) => {
      const previous = workspacePreferences;
      setWorkspacePreferences({ timeZone });

      try {
        const response = await authFetch(`${API_BASE_URL}/workspace/preferences`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ timeZone }),
        });

        if (!response.ok) {
          throw new Error("Failed to save workspace preferences");
        }
      } catch {
        setWorkspacePreferences(previous);
      }
    },
    [workspacePreferences],
  );

  const retryStartup = useCallback(() => {
    void initialize();
    void loadWorkspace();
  }, [initialize, loadWorkspace]);

  useEffect(() => {
    void initialize();
    void silentSync();
  }, [initialize, silentSync]);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  useEffect(() => {
    if (workspaceVersion === 0) {
      return;
    }

    void loadWorkspace();
    refreshViewer();
  }, [workspaceVersion, loadWorkspace, refreshViewer]);

  useEffect(() => {
    writeStoredSelectedViewerPath(selectedViewerPath);
  }, [selectedViewerPath]);

  const selectedWorkspaceEntry = useMemo(
    () =>
      selectedViewerPath
        ? workspaceEntries.find((entry) => entry.viewerPath === selectedViewerPath) ?? null
        : null,
    [workspaceEntries, selectedViewerPath],
  );

  const startupError = initializationError ?? workspaceLoadError;
  const startupErrorMessage = startupError ? formatSetupError(startupError) : null;
  const selectedViewerUrl = selectedViewerPath ? `${API_BASE_URL}${selectedViewerPath}` : null;

  return {
    workspaceApps,
    workspaceEntries,
    selectedViewerPath,
    viewerRefreshKey,
    silentSyncError,
    workspacePreferences,
    selectedWorkspaceEntry,
    selectedViewerUrl,
    startupErrorMessage,
    setSelectedViewerPath,
    refreshViewer,
    loadWorkspace,
    onSynced,
    onSyncError,
    clearSilentSyncError,
    setAppOrder,
    setAppArchived,
    saveAppOrder,
    saveArchivedApps,
    saveWorkspaceTimeZone,
    retryStartup,
  };
}
