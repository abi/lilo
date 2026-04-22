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
