import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ChatModelSelection,
  isSupportedChatModelSelection,
} from "../pi/runtime.js";

export interface WorkspaceAppPrefs {
  appNames: string[];
  archivedAppNames: string[];
  timeZone: string | null;
  defaultChatModelSelection: ChatModelSelection | null;
}

const isValidTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const getWorkspaceConfigDir = (workspaceRoot: string): string =>
  resolve(workspaceRoot, ".lilo");

export const getWorkspaceConfigPath = (workspaceRoot: string): string =>
  resolve(getWorkspaceConfigDir(workspaceRoot), "config.json");

const getLegacyWorkspaceAppPrefsPath = (workspaceRoot: string): string =>
  resolve(workspaceRoot, ".lilo-app-order.json");

/**
 * Migrate `$workspace/.lilo-app-order.json` → `$workspace/.lilo/config.json`.
 *
 * Called once at server start. If the new config file already exists, the
 * legacy file is simply deleted (new wins). Safe to run repeatedly — it
 * no-ops when the legacy file is absent.
 */
export const migrateLegacyWorkspaceAppPrefs = async (
  workspaceRoot: string,
): Promise<void> => {
  const legacyPath = getLegacyWorkspaceAppPrefsPath(workspaceRoot);
  if (!existsSync(legacyPath)) {
    return;
  }

  const newPath = getWorkspaceConfigPath(workspaceRoot);
  try {
    if (existsSync(newPath)) {
      await unlink(legacyPath);
      console.log(
        `[workspace] legacy ${legacyPath} removed (new ${newPath} already present)`,
      );
      return;
    }

    await mkdir(getWorkspaceConfigDir(workspaceRoot), { recursive: true });
    await rename(legacyPath, newPath);
    console.log(`[workspace] migrated ${legacyPath} → ${newPath}`);
  } catch (error) {
    console.error(
      `[workspace] failed to migrate legacy app prefs at ${legacyPath}:`,
      error,
    );
  }
};

export const readWorkspaceAppPrefs = async (
  workspaceRoot: string,
): Promise<WorkspaceAppPrefs> => {
  try {
    const raw = await readFile(getWorkspaceConfigPath(workspaceRoot), "utf8");
    const parsed = JSON.parse(raw) as {
      appNames?: unknown;
      archivedAppNames?: unknown;
      timeZone?: unknown;
      defaultChatModelSelection?: unknown;
    };

    return {
      appNames: Array.isArray(parsed.appNames)
        ? parsed.appNames.filter((value): value is string => typeof value === "string")
        : [],
      archivedAppNames: Array.isArray(parsed.archivedAppNames)
        ? parsed.archivedAppNames.filter((value): value is string => typeof value === "string")
        : [],
      timeZone: isValidTimeZone(parsed.timeZone) ? parsed.timeZone : null,
      defaultChatModelSelection: isSupportedChatModelSelection(
        parsed.defaultChatModelSelection,
      )
        ? parsed.defaultChatModelSelection
        : null,
    };
  } catch {
    return {
      appNames: [],
      archivedAppNames: [],
      timeZone: null,
      defaultChatModelSelection: null,
    };
  }
};
