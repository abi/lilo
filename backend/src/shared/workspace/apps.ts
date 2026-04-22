import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { WORKSPACE_ROOT, resolveWorkspaceAppRoot } from "../config/paths.js";

interface WorkspaceAppManifestRecord {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  icon?: unknown;
  iconDark?: unknown;
  entry?: unknown;
}

export interface WorkspaceAppDefinition {
  name: string;
  displayName?: string;
  description?: string;
  rootPath: string;
  rootHref: string;
  viewerPath: string;
  entryRelativePath: string;
  iconHref?: string;
  iconDarkHref?: string;
}

const encodeWorkspacePath = (value: string): string =>
  value.split("/").map((segment) => encodeURIComponent(segment)).join("/");

const buildWorkspaceAppRootHref = (appName: string): string =>
  `/workspace/${encodeURIComponent(appName)}`;

const buildWorkspaceAppAssetPath = (appName: string, relativePath: string): string =>
  `${buildWorkspaceAppRootHref(appName)}/${encodeWorkspacePath(relativePath)}`;

const normalizeManifestPath = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.startsWith("/")) {
    return null;
  }

  const segments = trimmed.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  return segments.join("/");
};

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const parseWorkspaceAppManifest = (
  appName: string,
  appRoot: string,
  manifest: WorkspaceAppManifestRecord,
): WorkspaceAppDefinition | null => {
  const manifestId = normalizeOptionalString(manifest.id);
  if (manifestId && manifestId !== appName) {
    return null;
  }

  const entryRelativePath = normalizeManifestPath(manifest.entry);
  if (!entryRelativePath) {
    return null;
  }

  const entryAbsolutePath = resolve(appRoot, entryRelativePath);
  if (
    !entryAbsolutePath.startsWith(appRoot) ||
    !existsSync(entryAbsolutePath) ||
    extname(entryAbsolutePath).toLowerCase() !== ".html"
  ) {
    return null;
  }

  const iconRelativePath = normalizeManifestPath(manifest.icon);
  const iconDarkRelativePath = normalizeManifestPath(manifest.iconDark);

  return {
    name: appName,
    displayName: normalizeOptionalString(manifest.name),
    description: normalizeOptionalString(manifest.description),
    rootPath: appRoot,
    rootHref: buildWorkspaceAppRootHref(appName),
    viewerPath: buildWorkspaceAppAssetPath(appName, entryRelativePath),
    entryRelativePath,
    iconHref: iconRelativePath
      ? buildWorkspaceAppAssetPath(appName, iconRelativePath)
      : undefined,
    iconDarkHref: iconDarkRelativePath
      ? buildWorkspaceAppAssetPath(appName, iconDarkRelativePath)
      : undefined,
  };
};

const parseWorkspaceAppManifestString = (
  appName: string,
  appRoot: string,
  manifestRaw: string,
): WorkspaceAppDefinition | null => {
  try {
    return parseWorkspaceAppManifest(
      appName,
      appRoot,
      JSON.parse(manifestRaw) as WorkspaceAppManifestRecord,
    );
  } catch {
    return null;
  }
};

export const getWorkspaceAppDefinitionSync = (
  appName: string,
): WorkspaceAppDefinition | null => {
  const appRoot = resolveWorkspaceAppRoot(appName);
  if (!appRoot) {
    return null;
  }

  const manifestPath = resolve(appRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifestRaw = readFileSync(manifestPath, "utf8");
    return parseWorkspaceAppManifestString(appName, appRoot, manifestRaw);
  } catch {
    return null;
  }
};

export const getWorkspaceAppDefinition = async (
  appName: string,
): Promise<WorkspaceAppDefinition | null> => {
  const appRoot = resolveWorkspaceAppRoot(appName);
  if (!appRoot) {
    return null;
  }

  const manifestPath = resolve(appRoot, "manifest.json");
  try {
    const manifestRaw = await readFile(manifestPath, "utf8");
    return parseWorkspaceAppManifestString(appName, appRoot, manifestRaw);
  } catch {
    return null;
  }
};

export const isWorkspaceAppNameSync = (appName: string): boolean =>
  Boolean(getWorkspaceAppDefinitionSync(appName));

export const listWorkspaceApps = async (): Promise<WorkspaceAppDefinition[]> => {
  if (!existsSync(WORKSPACE_ROOT)) {
    return [];
  }

  const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
  const apps = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => getWorkspaceAppDefinition(entry.name)),
  );

  return apps
    .filter((app): app is WorkspaceAppDefinition => Boolean(app))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const listWorkspaceAppsSync = (): WorkspaceAppDefinition[] => {
  if (!existsSync(WORKSPACE_ROOT)) {
    return [];
  }

  return readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => getWorkspaceAppDefinitionSync(entry.name))
    .filter((app): app is WorkspaceAppDefinition => Boolean(app))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const workspaceAppFileExists = async (
  appName: string,
  relativePath: string,
): Promise<boolean> => {
  const definition = await getWorkspaceAppDefinition(appName);
  if (!definition) {
    return false;
  }

  const absolutePath = resolve(definition.rootPath, relativePath);
  if (!absolutePath.startsWith(definition.rootPath)) {
    return false;
  }

  try {
    const info = await stat(absolutePath);
    return info.isFile();
  } catch {
    return false;
  }
};
