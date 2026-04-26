import { dirname, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { ensureDir } from "../../shared/session/sessionStore.js";
import { resolveSessionSubdir } from "../../shared/config/sessions.js";

type ChannelName = "email";

interface ChannelThreadRecord {
  chatId: string;
  updatedAt: string;
}

type ChannelThreadMap = Record<string, ChannelThreadRecord>;

const THREAD_STORE_PATH = resolve(resolveSessionSubdir("channels"), "thread-map.json");

const normalizeEmailMessageId = (value: string): string =>
  value
    .trim()
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();

const extractMessageIds = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }

  const bracketed = [...value.matchAll(/<([^>]+)>/g)]
    .map((match) => normalizeEmailMessageId(match[1] ?? ""))
    .filter(Boolean);
  if (bracketed.length > 0) {
    return bracketed;
  }

  return value
    .split(/\s+/)
    .map(normalizeEmailMessageId)
    .filter(Boolean);
};

const buildKey = (channel: ChannelName, messageId: string): string =>
  `${channel}:${normalizeEmailMessageId(messageId)}`;

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

export const resolveEmailThreadRootMessageId = (
  messageId: string | null | undefined,
  references: string | null | undefined,
  inReplyTo?: string | null,
): string | null => {
  const referenceIds = extractMessageIds(references);
  if (referenceIds.length > 0) {
    return referenceIds[0];
  }

  const inReplyToIds = extractMessageIds(inReplyTo);
  if (inReplyToIds.length > 0) {
    return inReplyToIds[0];
  }

  const messageIds = extractMessageIds(messageId);
  return messageIds[0] ?? null;
};

export const resolveEmailChatId = async (
  rootMessageId: string,
): Promise<string | null> => {
  const key = buildKey("email", rootMessageId);
  const map = await readThreadMap();
  return map[key]?.chatId ?? null;
};

export const storeEmailChatId = async (
  rootMessageId: string,
  chatId: string,
  now = new Date(),
): Promise<void> => {
  const key = buildKey("email", rootMessageId);
  const map = await readThreadMap();
  map[key] = { chatId, updatedAt: now.toISOString() };
  await writeThreadMap(map);
};
