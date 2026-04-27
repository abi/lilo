import { isAbsolute, resolve } from "node:path";
import { backendConfig } from "./config.js";
import { REPO_ROOT_DIR } from "./paths.js";

const resolveSessionsRoot = (): string => {
  const explicitPath = backendConfig.sessions.dir;
  if (!explicitPath) {
    throw new Error("LILO_SESSIONS_DIR must be set");
  }

  return isAbsolute(explicitPath) ? explicitPath : resolve(REPO_ROOT_DIR, explicitPath);
};

export const SESSIONS_ROOT_DIR = resolveSessionsRoot();

export const resolveSessionSubdir = (...parts: string[]): string =>
  resolve(SESSIONS_ROOT_DIR, ...parts);
