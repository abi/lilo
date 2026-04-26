import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getWorkspaceConfigPath } from "./appPrefs.js";

export interface WorkspaceTemplateUpdate {
  appName: string;
  displayName?: string;
  currentVersion: string | null;
  latestVersion: string;
}

interface TemplateManifest {
  id?: unknown;
  name?: unknown;
  templateVersion?: unknown;
}

interface WorkspaceTemplateUpdateApp {
  name: string;
  displayName?: string;
}

interface WorkspaceAppUpdateStateEntry {
  templateVersionApplied?: unknown;
  updatedAt?: unknown;
  status?: unknown;
}

interface WorkspaceAppUpdateState {
  version?: unknown;
  apps?: unknown;
}

const APP_UPDATES_FILENAME = "app-updates.json";

const normalizeString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const parseVersionParts = (value: string): number[] =>
  value.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });

const compareVersions = (left: string, right: string): number => {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.localeCompare(right);
};

const getAppUpdatesPath = (workspaceRoot: string): string =>
  resolve(dirname(getWorkspaceConfigPath(workspaceRoot)), APP_UPDATES_FILENAME);

const readJsonFile = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
};

const readTemplateManifest = (
  templateRoot: string,
  appName: string,
): TemplateManifest | null => {
  const manifestPath = resolve(templateRoot, appName, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  return readJsonFile<TemplateManifest>(manifestPath);
};

const readWorkspaceManifest = (
  workspaceRoot: string,
  appName: string,
): TemplateManifest | null => {
  const manifestPath = resolve(workspaceRoot, appName, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  return readJsonFile<TemplateManifest>(manifestPath);
};

const readAppUpdateState = (workspaceRoot: string): Record<string, WorkspaceAppUpdateStateEntry> => {
  const parsed = readJsonFile<WorkspaceAppUpdateState>(getAppUpdatesPath(workspaceRoot));
  if (!parsed?.apps || typeof parsed.apps !== "object") {
    return {};
  }
  return parsed.apps as Record<string, WorkspaceAppUpdateStateEntry>;
};

const getAppliedVersion = (
  workspaceRoot: string,
  appName: string,
  updateState: Record<string, WorkspaceAppUpdateStateEntry>,
): string | null => {
  const stateVersion = normalizeString(updateState[appName]?.templateVersionApplied);
  if (stateVersion) {
    return stateVersion;
  }

  const workspaceManifest = readWorkspaceManifest(workspaceRoot, appName);
  return (
    normalizeString((workspaceManifest as { templateVersionApplied?: unknown } | null)?.templateVersionApplied) ??
    normalizeString(workspaceManifest?.templateVersion)
  );
};

export const initializeAppUpdateStateForBootstrappedWorkspace = (
  workspaceRoot: string,
  templateRoot: string,
): void => {
  if (!existsSync(templateRoot)) {
    return;
  }

  const apps: Record<string, WorkspaceAppUpdateStateEntry> = {};
  for (const entry of readdirSync(templateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = readTemplateManifest(templateRoot, entry.name);
    const templateVersion = normalizeString(manifest?.templateVersion);
    if (!templateVersion) continue;
    apps[entry.name] = {
      templateVersionApplied: templateVersion,
      updatedAt: new Date().toISOString(),
      status: "applied",
    };
  }

  if (Object.keys(apps).length === 0) {
    return;
  }

  const updatesPath = getAppUpdatesPath(workspaceRoot);
  mkdirSync(dirname(updatesPath), { recursive: true });
  writeFileSync(updatesPath, `${JSON.stringify({ version: 1, apps }, null, 2)}\n`, "utf8");
};

export const getWorkspaceTemplateUpdates = (
  workspaceRoot: string,
  templateRoot: string,
  workspaceApps: WorkspaceTemplateUpdateApp[],
): WorkspaceTemplateUpdate[] => {
  if (!existsSync(templateRoot)) {
    return [];
  }

  const updateState = readAppUpdateState(workspaceRoot);
  return workspaceApps.flatMap((app) => {
    const manifest = readTemplateManifest(templateRoot, app.name);
    const latestVersion = normalizeString(manifest?.templateVersion);
    if (!manifest || !latestVersion) {
      return [];
    }

    const currentVersion = getAppliedVersion(workspaceRoot, app.name, updateState);
    if (currentVersion && compareVersions(currentVersion, latestVersion) >= 0) {
      return [];
    }

    return [
      {
        appName: app.name,
        displayName: app.displayName,
        currentVersion,
        latestVersion,
      },
    ];
  });
};
