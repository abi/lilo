import { dirname, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { ensureDir } from "../../shared/session/sessionStore.js";
import { resolveSessionSubdir } from "../../shared/config/sessions.js";
import { normalizeWhatsAppPhoneNumber } from "./whatsapp.address.js";

type ChannelName = "whatsapp";

interface ChannelThreadRecord {
  chatId: string;
  updatedAt: string;
}

type ChannelThreadMap = Record<string, ChannelThreadRecord>;

const THREAD_STORE_PATH = resolve(resolveSessionSubdir("channels"), "thread-map.json");

const buildKey = (channel: ChannelName, from: string, dayKey: string): string =>
  `${channel}:${normalizeWhatsAppPhoneNumber(from)}:${dayKey}`;

const toDayKey = (now: Date, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch (error) {
    console.warn(
      `[whatsapp] Invalid workspace timezone ${JSON.stringify(timeZone)}; falling back to UTC`,
      error,
    );
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
};

const readThreadMap = async (): Promise<ChannelThreadMap> => {
  try {
    const raw = await readFile(THREAD_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const normalized: ChannelThreadMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const maybeRecord = value as Record<string, unknown>;
      if (typeof maybeRecord.chatId !== "string") {
        continue;
      }

      normalized[key] = {
        chatId: maybeRecord.chatId,
        updatedAt:
          typeof maybeRecord.updatedAt === "string"
            ? maybeRecord.updatedAt
            : new Date(0).toISOString(),
      };
    }

    return normalized;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
};

const writeThreadMap = async (map: ChannelThreadMap): Promise<void> => {
  ensureDir(dirname(THREAD_STORE_PATH));
  await writeFile(THREAD_STORE_PATH, `${JSON.stringify(map, null, 2)}\n`, "utf8");
};

export const resolveDailyWhatsAppChatId = async (
  fromAddress: string,
  now: Date,
  timeZone: string,
): Promise<string | null> => {
  const dayKey = toDayKey(now, timeZone);
  const key = buildKey("whatsapp", fromAddress, dayKey);
  const map = await readThreadMap();
  return map[key]?.chatId ?? null;
};

export const storeDailyWhatsAppChatId = async (
  fromAddress: string,
  now: Date,
  timeZone: string,
  chatId: string,
): Promise<void> => {
  const dayKey = toDayKey(now, timeZone);
  const key = buildKey("whatsapp", fromAddress, dayKey);
  const map = await readThreadMap();
  map[key] = { chatId, updatedAt: now.toISOString() };
  await writeThreadMap(map);
};
