import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED_CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DIR = resolve(SHARED_CONFIG_DIR, "../../../..");

export const loadBackendEnv = (): void => {
  // `process.loadEnvFile()` keeps existing env vars, so load `.env.local`
  // first to give it precedence over `.env` while still letting shell env win.
  for (const envPath of [
    resolve(REPO_ROOT_DIR, ".env.local"),
    resolve(REPO_ROOT_DIR, ".env"),
  ]) {
    if (existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
};

export const readEnv = (name: string): string | null =>
  process.env[name]?.trim() || null;

export const readRequiredEnv = (name: string): string => {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
};

export const readCsvEnv = (name: string): string[] =>
  (readEnv(name) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
