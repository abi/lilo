import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBackendEnv } from "./env.js";

const SHARED_CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(SHARED_CONFIG_DIR, "../../..");

export const REPO_ROOT_DIR = resolve(BACKEND_DIR, "..");

const WORKSPACE_TEMPLATE_DIR = resolve(REPO_ROOT_DIR, "workspace-template");

loadBackendEnv();

/**
 * If the workspace directory is empty (no user content), copy the bundled
 * template apps into it so every new workspace starts with a useful default set.
 */
const bootstrapWorkspaceIfEmpty = (workspaceDir: string): void => {
  if (!existsSync(WORKSPACE_TEMPLATE_DIR)) return;

  const entries = existsSync(workspaceDir) ? readdirSync(workspaceDir) : [];
  const hasUserContent = entries.some(
    (e) => !e.startsWith(".") && e !== "node_modules",
  );
  if (hasUserContent) return;

  console.log("Bootstrapping workspace from template...");
  cpSync(WORKSPACE_TEMPLATE_DIR, workspaceDir, { recursive: true });
  console.log("Workspace bootstrapped.");
};

export const resolveWorkspaceRoot = (): string => {
  const explicitPath = process.env.LILO_WORKSPACE_DIR?.trim();
  if (!explicitPath) {
    throw new Error("LILO_WORKSPACE_DIR must be set");
  }

  const workspaceDir = isAbsolute(explicitPath)
    ? explicitPath
    : resolve(REPO_ROOT_DIR, explicitPath);

  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  bootstrapWorkspaceIfEmpty(workspaceDir);

  return workspaceDir;
};

export const WORKSPACE_ROOT = resolveWorkspaceRoot();

export const resolveWorkspaceAppRoot = (appName: string): string | null => {
  if (appName.includes("..") || appName.includes("/") || appName.includes("\\")) {
    return null;
  }

  const appRoot = resolve(WORKSPACE_ROOT, appName);
  if (!appRoot.startsWith(WORKSPACE_ROOT)) {
    return null;
  }

  return appRoot;
};
