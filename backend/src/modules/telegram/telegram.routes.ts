import { timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { backendConfig, requireConfigValue } from "../../shared/config/config.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { readWorkspaceAppPrefs } from "../../shared/workspace/appPrefs.js";
import { resolveDailyTelegramChatId, storeDailyTelegramChatId } from "./threadStore.js";

type TelegramChat = {
  id: number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  from?: TelegramUser;
  photo?: TelegramPhotoSize[];
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

interface TelegramApiOkResult<T> {
  ok: true;
  result: T;
}

interface TelegramApiErrorResult {
  ok: false;
  error_code?: number;
  description?: string;
}

type TelegramApiResponse<T> = TelegramApiOkResult<T> | TelegramApiErrorResult;

type TelegramGetFileResult = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

const getTelegramBotToken = (): string =>
  requireConfigValue(backendConfig.channels.telegram.botToken, "TELEGRAM_BOT_TOKEN");

const secureCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyTelegramWebhookSecret = (headers: Headers): boolean => {
  const expectedSecret = backendConfig.channels.telegram.webhookSecret;
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = headers.get("x-telegram-bot-api-secret-token") ?? "";
  return secureCompare(providedSecret, expectedSecret);
};

const getTelegramSenderId = (message: TelegramMessage): string | null => {
  const senderId = message.from?.id;
  return typeof senderId === "number" && Number.isFinite(senderId)
    ? String(senderId)
    : null;
};

const isAllowedTelegramSender = (message: TelegramMessage): boolean => {
  const senderId = getTelegramSenderId(message);
  if (!senderId) {
    return false;
  }

  return backendConfig.channels.telegram.allowedUserIds.includes(senderId);
};

const getTelegramThreadTimezone = async (): Promise<string> => {
  const workspacePrefs = await readWorkspaceAppPrefs(WORKSPACE_ROOT);
  return workspacePrefs.timeZone ?? "America/New_York";
};

const describeTelegramUser = (user: TelegramUser | undefined): string => {
  if (!user) {
    return "unknown user";
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (user.username && fullName) {
    return `${fullName} (@${user.username})`;
  }

  if (user.username) {
    return `@${user.username}`;
  }

  if (fullName) {
    return fullName;
  }

  return `user:${user.id}`;
};

const describeTelegramChat = (chat: TelegramChat): string => {
  const name = chat.title?.trim() || chat.username?.trim() || "";
  if (name) {
    return `${name} (${chat.type ?? "chat"})`;
  }

  return `${chat.type ?? "chat"}:${chat.id}`;
};

const buildTelegramThreadKey = (chat: TelegramChat): string => `${chat.type ?? "chat"}:${chat.id}`;

const isSupportedTelegramImageMimeType = (value: string): boolean =>
  /^(image\/jpeg|image\/jpg|image\/png|image\/webp)$/i.test(value.trim());

const telegramApiFetch = async <T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let payload: TelegramApiResponse<T> | null = null;
  try {
    payload = JSON.parse(responseText) as TelegramApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const description =
      payload && payload.ok === false
        ? payload.description ?? `Telegram API ${method} failed`
        : `Telegram API ${method} failed`;
    throw new Error(description);
  }

  return payload.result;
};

const sendTelegramReply = async (chatId: number, body: string): Promise<void> => {
  const botToken = getTelegramBotToken();

  try {
    await telegramApiFetch(botToken, "sendMessage", {
      chat_id: chatId,
      text: body,
    });
  } catch (error) {
    captureBackendException(error, {
      tags: {
        area: "telegram",
        provider: "telegram",
        operation: "send_reply",
        chat_id: chatId,
      },
      level: "error",
      fingerprint: ["telegram", "send_reply"],
    });
    throw error;
  }
};

export const sendTelegramAutomationMessage = async (body: string): Promise<void> => {
  const [allowedUserId] = backendConfig.channels.telegram.allowedUserIds;
  if (!allowedUserId) {
    throw new Error("LILO_TELEGRAM_ALLOWED_USER_IDS is not configured");
  }

  const chatId = Number(allowedUserId);
  if (!Number.isFinite(chatId)) {
    throw new Error("LILO_TELEGRAM_ALLOWED_USER_IDS must contain numeric Telegram user IDs");
  }

  await sendTelegramReply(chatId, body);
};

const downloadTelegramFile = async (botToken: string, fileId: string): Promise<ImageContent | null> => {
  const file = await telegramApiFetch<TelegramGetFileResult>(botToken, "getFile", {
    file_id: fileId,
  });

  if (!file.file_path) {
    return null;
  }

  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
  if (!response.ok) {
    throw new Error(`Failed to download Telegram file ${fileId}: ${response.status}`);
  }

  const mimeType = response.headers.get("content-type")?.trim() || "application/octet-stream";
  if (!isSupportedTelegramImageMimeType(mimeType)) {
    console.log(`[telegram] ignoring unsupported inbound media type=${mimeType} fileId=${fileId}`);
    return null;
  }

  return {
    type: "image",
    mimeType,
    data: Buffer.from(await response.arrayBuffer()).toString("base64"),
  };
};

const loadInboundImages = async (message: TelegramMessage): Promise<ImageContent[]> => {
  const photos = message.photo ?? [];
  if (photos.length === 0) {
    return [];
  }

  const botToken = getTelegramBotToken();
  const preferred = [...photos].sort((left, right) => {
    const leftSize = (left.file_size ?? 0) || left.width * left.height;
    const rightSize = (right.file_size ?? 0) || right.width * right.height;
    return rightSize - leftSize;
  })[0];

  const image = await downloadTelegramFile(botToken, preferred.file_id);
  return image ? [image] : [];
};

const extractTelegramMessage = (update: TelegramUpdate): TelegramMessage | null => update.message ?? null;

export const registerTelegramRoutes = (app: Hono, chatService: PiSdkChatService): void => {
  app.post("/api/inbound-telegram", async (c) => {
    let update: TelegramUpdate;

    if (!verifyTelegramWebhookSecret(c.req.raw.headers)) {
      console.warn("[telegram] rejected inbound webhook with invalid or missing secret");
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      update = (await c.req.json()) as TelegramUpdate;
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const message = extractTelegramMessage(update);
    if (!message?.chat) {
      return c.json({ ok: true, ignored: true }, 200);
    }

    if (!isAllowedTelegramSender(message)) {
      console.warn("[telegram] ignored message from unauthorized sender", {
        senderId: getTelegramSenderId(message) ?? "missing",
        chatId: message.chat.id,
        chatType: message.chat.type ?? "unknown",
      });
      return c.json({ ok: true, ignored: true }, 200);
    }

    const inboundText = (message.text ?? message.caption ?? "").trim();
    const fromLabel = describeTelegramUser(message.from);
    const chatLabel = describeTelegramChat(message.chat);
    const threadKey = buildTelegramThreadKey(message.chat);

    const processTelegram = async () => {
      try {
        const now = new Date();
        const timezone = await getTelegramThreadTimezone();
        const images = await loadInboundImages(message);

        let chatId = await resolveDailyTelegramChatId(threadKey, now, timezone);
        if (!chatId || !(await chatService.hasChat(chatId))) {
          const chat = await chatService.createChat();
          chatId = chat.id;
          await storeDailyTelegramChatId(threadKey, now, timezone, chatId);
          console.log(`[telegram] created chat=${chatId} thread=${threadKey} timezone=${timezone}`);
        }

        let responseText = "";
        await chatService.promptChat(
          chatId,
          {
            message: [
              "You received a Telegram message. Reply with a concise, helpful response.",
              "",
              `From: ${fromLabel}`,
              `Chat: ${chatLabel}`,
              "",
              inboundText || "(empty message)",
            ].join("\n"),
            images,
            attachments: [],
            context: {},
          },
          (event: SseEvent) => {
            if (event.event === "text_delta") {
              const delta = (event.data as { delta?: string }).delta ?? "";
              responseText += delta;
            }
          },
        );

        if (responseText.trim().length > 0) {
          await sendTelegramReply(message.chat.id, responseText.trim());
          console.log(`[telegram] replied chat=${chatId} thread=${threadKey}`);
        }
      } catch (error) {
        captureBackendException(error, {
          tags: {
            area: "telegram",
            provider: "telegram",
            operation: "process_inbound",
            chat_id: message.chat.id,
            chat_type: message.chat.type ?? "unknown",
          },
          level: "error",
        });
        console.error("[telegram] Failed to process inbound Telegram:", error);
      }
    };

    void processTelegram();

    return c.json({ ok: true }, 200);
  });
};
