import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config/config";
import { UnauthorizedError, authFetch } from "../lib/auth";
import type {
  WorkspaceAppLink,
  WorkspaceEntry,
  WorkspaceFrequentDocument,
  WorkspacePreferences,
  WorkspaceTemplateUpdate,
} from "../components/workspace/types";
import { formatSetupError, parseErrorMessage } from "./workspace/utils";

const DEFAULT_WORKSPACE_TIME_ZONE = "America/New_York";
const SELECTED_VIEWER_PATH_STORAGE_KEY = "lilo-selected-viewer-path";
const VIEWER_OPEN_STATS_STORAGE_KEY = "lilo-viewer-open-stats";
const VIEWER_URL_PARAM = "viewer";
const NATIVE_DESKTOP_APP_NAME = "desktop";
const DOCUMENT_ENTRY_KINDS = new Set<WorkspaceEntry["kind"]>([
  "code",
  "json",
  "markdown",
  "text",
]);
const MAX_TRACKED_VIEWER_PATHS = 100;

type ViewerOpenStats = Record<
  string,
  {
    count: number;
    lastOpenedAt: number;
  }
>;

const normalizeViewerPath = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.startsWith("/workspace-file/") || trimmed.startsWith("/workspace/")
    ? trimmed
    : null;
};

const readUrlSelectedViewerPath = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeViewerPath(new URL(window.location.href).searchParams.get(VIEWER_URL_PARAM));
  } catch {
    return null;
  }
};

const readStoredSelectedViewerPath = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeViewerPath(localStorage.getItem(SELECTED_VIEWER_PATH_STORAGE_KEY));
  } catch {
    return null;
  }
};

const readInitialSelectedViewerPath = (): string | null =>
  readUrlSelectedViewerPath() ?? readStoredSelectedViewerPath();

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

const readViewerOpenStats = (): ViewerOpenStats => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed = JSON.parse(
      localStorage.getItem(VIEWER_OPEN_STATS_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([viewerPath, rawValue]) => {
        if (!normalizeViewerPath(viewerPath) || !rawValue || typeof rawValue !== "object") {
          return [];
        }

        const value = rawValue as { count?: unknown; lastOpenedAt?: unknown };
        const count = typeof value.count === "number" ? value.count : 0;
        const lastOpenedAt =
          typeof value.lastOpenedAt === "number" ? value.lastOpenedAt : 0;

        if (count <= 0 || lastOpenedAt <= 0) {
          return [];
        }

        return [[viewerPath, { count, lastOpenedAt }] as const];
      }),
    );
  } catch {
    return {};
  }
};

const writeViewerOpenStats = (stats: ViewerOpenStats) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const trimmed = Object.fromEntries(
      Object.entries(stats)
        .sort((left, right) => right[1].lastOpenedAt - left[1].lastOpenedAt)
        .slice(0, MAX_TRACKED_VIEWER_PATHS),
    );
    localStorage.setItem(VIEWER_OPEN_STATS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage failures
  }
};

const isDocumentEntry = (
  entry: WorkspaceEntry | null | undefined,
): entry is WorkspaceEntry & { viewerPath: string } =>
  Boolean(entry?.viewerPath && DOCUMENT_ENTRY_KINDS.has(entry.kind));

const reorderWorkspaceApps = (
  workspaceApps: WorkspaceAppLink[],
  appNames: string[],
): WorkspaceAppLink[] => {
  const uniqueNames = [...new Set(appNames)];
  const currentNames = workspaceApps.map((app) => app.name);
  const orderedNames = [
    ...uniqueNames.filter((name) => currentNames.includes(name)),
    ...currentNames.filter((name) => !uniqueNames.includes(name)),
  ];

  if (orderedNames.length !== currentNames.length) {
    throw new Error("appNames contains duplicate or unknown workspace apps");
  }

  const appByName = new Map(workspaceApps.map((app) => [app.name, app]));
  return orderedNames.map((name) => {
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
  const [viewerOpenStats, setViewerOpenStats] =
    useState<ViewerOpenStats>(() => readViewerOpenStats());
  const [templateUpdates, setTemplateUpdates] = useState<WorkspaceTemplateUpdate[]>([]);
  const [selectedViewerPath, setSelectedViewerPath] = useState<string | null>(() =>
    readInitialSelectedViewerPath(),
  );
  const [viewerRefreshKey, setViewerRefreshKey] = useState(0);
  const [silentSyncError, setSilentSyncError] = useState<string | null>(null);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const lastTrackedViewerPathRef = useRef<string | null>(null);
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>({
    timeZone: DEFAULT_WORKSPACE_TIME_ZONE,
  });

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await authFetch(`${config.apiBaseUrl}/workspace/apps`, { signal });
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
        templateUpdates?: WorkspaceTemplateUpdate[];
        preferences?: Partial<WorkspacePreferences>;
      };

      const apps = (payload.apps ?? []).filter(
        (app) => app.name !== NATIVE_DESKTOP_APP_NAME,
      );
      const entries = payload.entries ?? [];
      const updates = payload.templateUpdates ?? [];
      setWorkspaceApps(apps);
      setWorkspaceEntries(entries);
      setTemplateUpdates(updates);
      setWorkspacePreferences({
        timeZone: payload.preferences?.timeZone ?? DEFAULT_WORKSPACE_TIME_ZONE,
        defaultChatModelSelection: payload.preferences?.defaultChatModelSelection,
        automationOutputChannel: payload.preferences?.automationOutputChannel ?? "whatsapp",
        gitRemoteUrl: payload.preferences?.gitRemoteUrl,
        gitBrowserUrl: payload.preferences?.gitBrowserUrl,
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
    if (!config.workspace.syncEnabled) {
      setSilentSyncError(null);
      return;
    }

    try {
      const response = await authFetch(`${config.apiBaseUrl}/workspace/sync`, { method: "POST" });
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
        const response = await authFetch(`${config.apiBaseUrl}/workspace/app-order`, {
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
        const response = await authFetch(`${config.apiBaseUrl}/workspace/app-archive`, {
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
      setWorkspacePreferences((current) => ({ ...current, timeZone }));

      try {
        const response = await authFetch(`${config.apiBaseUrl}/workspace/preferences`, {
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

  const saveDefaultChatModelSelection = useCallback(
    async (
      defaultChatModelSelection: NonNullable<
        WorkspacePreferences["defaultChatModelSelection"]
      >,
    ) => {
      const previous = workspacePreferences;
      setWorkspacePreferences((current) => ({
        ...current,
        defaultChatModelSelection,
      }));

      try {
        const response = await authFetch(`${config.apiBaseUrl}/workspace/preferences`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ defaultChatModelSelection }),
        });

        if (!response.ok) {
          throw new Error("Failed to save workspace preferences");
        }
      } catch {
        setWorkspacePreferences(previous);
        throw new Error("Failed to save default model");
      }
    },
    [workspacePreferences],
  );

  const saveAutomationOutputChannel = useCallback(
    async (
      automationOutputChannel: NonNullable<
        WorkspacePreferences["automationOutputChannel"]
      >,
    ) => {
      const previous = workspacePreferences;
      setWorkspacePreferences((current) => ({
        ...current,
        automationOutputChannel,
      }));

      try {
        const response = await authFetch(`${config.apiBaseUrl}/workspace/preferences`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ automationOutputChannel }),
        });

        if (!response.ok) {
          throw new Error("Failed to save workspace preferences");
        }
      } catch {
        setWorkspacePreferences(previous);
        throw new Error("Failed to save automation channel");
      }
    },
    [workspacePreferences],
  );

  const dismissTemplateUpdate = useCallback(
    async (update: WorkspaceTemplateUpdate) => {
      const previousUpdates = templateUpdates;
      setTemplateUpdates((updates) =>
        updates.filter((item) => item.appName !== update.appName),
      );

      try {
        const response = await authFetch(
          `${config.apiBaseUrl}/workspace/template-updates/${encodeURIComponent(update.appName)}/dismiss`,
          { method: "POST" },
        );

        if (!response.ok) {
          throw new Error(
            await parseErrorMessage(response, "Failed to dismiss app update"),
          );
        }

        await loadWorkspace();
      } catch (error) {
        setTemplateUpdates(previousUpdates);
        throw error instanceof Error
          ? error
          : new Error("Failed to dismiss app update");
      }
    },
    [loadWorkspace, templateUpdates],
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

  useEffect(() => {
    if (!isDocumentEntry(selectedWorkspaceEntry)) {
      lastTrackedViewerPathRef.current = null;
      return;
    }

    if (lastTrackedViewerPathRef.current === selectedWorkspaceEntry.viewerPath) {
      return;
    }
    lastTrackedViewerPathRef.current = selectedWorkspaceEntry.viewerPath;

    setViewerOpenStats((current) => {
      const previous = current[selectedWorkspaceEntry.viewerPath] ?? {
        count: 0,
        lastOpenedAt: 0,
      };
      const next = {
        ...current,
        [selectedWorkspaceEntry.viewerPath]: {
          count: previous.count + 1,
          lastOpenedAt: Date.now(),
        },
      };
      writeViewerOpenStats(next);
      return next;
    });
  }, [selectedWorkspaceEntry]);

  const frequentDocuments = useMemo<WorkspaceFrequentDocument[]>(() => {
    return workspaceEntries
      .filter(isDocumentEntry)
      .flatMap((entry) => {
        const stats = viewerOpenStats[entry.viewerPath];
        if (!stats) {
          return [];
        }

        return [
          {
            entry,
            openCount: stats.count,
            lastOpenedAt: stats.lastOpenedAt,
          },
        ];
      })
      .sort((left, right) => {
        if (right.openCount !== left.openCount) {
          return right.openCount - left.openCount;
        }
        return right.lastOpenedAt - left.lastOpenedAt;
      })
      .slice(0, 6);
  }, [viewerOpenStats, workspaceEntries]);

  const startupError = initializationError ?? workspaceLoadError;
  const startupErrorMessage = startupError ? formatSetupError(startupError) : null;
  const selectedViewerUrl = selectedViewerPath ? `${config.apiBaseUrl}${selectedViewerPath}` : null;

  return {
    workspaceApps,
    workspaceEntries,
    templateUpdates,
    selectedViewerPath,
    viewerRefreshKey,
    silentSyncError,
    workspacePreferences,
    selectedWorkspaceEntry,
    frequentDocuments,
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
    saveDefaultChatModelSelection,
    saveAutomationOutputChannel,
    dismissTemplateUpdate,
    retryStartup,
  };
}
