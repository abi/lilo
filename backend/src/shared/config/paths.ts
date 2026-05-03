import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backendConfig } from "./config.js";
import { initializeAppUpdateStateForBootstrappedWorkspace } from "../workspace/templateUpdates.js";

const SHARED_CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(SHARED_CONFIG_DIR, "../../..");

export const REPO_ROOT_DIR = resolve(BACKEND_DIR, "..");

export const WORKSPACE_TEMPLATE_DIR = resolve(REPO_ROOT_DIR, "workspace-template");

export const getWorkspaceGitUrl = (): string | null =>
  backendConfig.workspace.gitUrl;

export const getSafeWorkspaceGitUrl = (): string | null => {
  const workspaceGitUrl = getWorkspaceGitUrl();
  if (!workspaceGitUrl) {
    return null;
  }

  try {
    const parsed = new URL(workspaceGitUrl);
    if (parsed.username) {
      parsed.username = "****";
    }
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return workspaceGitUrl.replace(/\/\/[^/@]+@/, "//****@");
  }
};

export const getWorkspaceGitBrowserUrl = (): string | null => {
  const workspaceGitUrl = getWorkspaceGitUrl();
  if (!workspaceGitUrl) {
    return null;
  }

  try {
    const parsed = new URL(workspaceGitUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    parsed.username = "";
    parsed.password = "";
    parsed.pathname = parsed.pathname.replace(/\.git$/, "");
    return parsed.toString();
  } catch {
    return null;
  }
};

const runWorkspaceGit = (workspaceDir: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd: workspaceDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const ensureWorkspaceGitSafeDirectory = (workspaceDir: string): void => {
  try {
    const configuredDirectories = execFileSync(
      "git",
      ["config", "--global", "--get-all", "safe.directory"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (configuredDirectories.includes(workspaceDir)) {
      return;
    }
  } catch {
    // Missing config is fine; we add the Render/Railway volume path below.
  }

  try {
    execFileSync("git", ["config", "--global", "--add", "safe.directory", workspaceDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(`Registered workspace git safe.directory: ${workspaceDir}`);
  } catch (error) {
    console.warn("Failed to register workspace git safe.directory", {
      workspaceDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const isWorkspaceGitRepo = (workspaceDir: string): boolean => {
  try {
    return runWorkspaceGit(workspaceDir, ["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
};

const ensureWorkspaceGitRemote = (workspaceDir: string): void => {
  const workspaceGitUrl = getWorkspaceGitUrl();
  if (!workspaceGitUrl) {
    return;
  }

  if (!isWorkspaceGitRepo(workspaceDir)) {
    console.log("Initializing git repo for workspace...");
    runWorkspaceGit(workspaceDir, ["init", "-b", "main"]);
  }

  const currentOrigin = (() => {
    try {
      return runWorkspaceGit(workspaceDir, ["remote", "get-url", "origin"]);
    } catch {
      return null;
    }
  })();

  if (!currentOrigin) {
    runWorkspaceGit(workspaceDir, ["remote", "add", "origin", workspaceGitUrl]);
    console.log("Workspace git remote configured.");
    return;
  }

  if (currentOrigin !== workspaceGitUrl) {
    runWorkspaceGit(workspaceDir, ["remote", "set-url", "origin", workspaceGitUrl]);
    console.log("Workspace git remote updated.");
  }
};

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
  initializeAppUpdateStateForBootstrappedWorkspace(workspaceDir, WORKSPACE_TEMPLATE_DIR);
  console.log("Workspace bootstrapped.");
};

export const resolveWorkspaceRoot = (): string => {
  const explicitPath = backendConfig.workspace.dir;
  if (!explicitPath) {
    throw new Error("LILO_WORKSPACE_DIR must be set");
  }

  const workspaceDir = isAbsolute(explicitPath)
    ? explicitPath
    : resolve(REPO_ROOT_DIR, explicitPath);

  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  ensureWorkspaceGitSafeDirectory(workspaceDir);
  bootstrapWorkspaceIfEmpty(workspaceDir);
  ensureWorkspaceGitRemote(workspaceDir);

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
