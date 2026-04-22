import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import type { SessionManager } from "@mariozechner/pi-coding-agent";

export const ensureDir = (path: string): string => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }

  return path;
};

export const persistSessionManager = async (sessionManager: SessionManager): Promise<void> => {
  const sessionFile = sessionManager.getSessionFile();
  const header = sessionManager.getHeader();

  if (!sessionFile || !header) {
    return;
  }

  const entries = sessionManager.getEntries();
  const content = `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  await writeFile(sessionFile, content, "utf8");
};
