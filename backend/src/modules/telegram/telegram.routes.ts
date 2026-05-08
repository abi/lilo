import { timingSafeEqual } from "node:crypto";
import { extname } from "node:path";
import type { Hono } from "hono";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { UploadedChatFile } from "../chat/chat.request.js";
import type { PiSdkChatService, SseEvent } from "../chat/chat.service.js";
import { backendConfig, requireConfigValue } from "../../shared/config/config.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import {
  AudioTranscriptionUnavailableError,
  isAudioMimeType,
  normalizeMediaMimeType,
  transcribeAudioWithOpenAi,
} from "../../shared/audio/transcription.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { ASK_USER_QUESTION_TOOL_NAME } from "../../shared/tools/askUserQuestionTool.js";
import {
  CHANNEL_RESPONSE_TOOL_NAME,
  isSendChannelResponseDetails,
  type SendChannelResponseDetails,
} from "../../shared/tools/channelResponseTool.js";
import { readWorkspaceAppPrefs } from "../../shared/workspace/appPrefs.js";
import {
  formatTelegramMessagingOutput,
  type MessagingLinkButton,
} from "../channels/channelOutput.format.js";
import { prepareChannelResponseMedia } from "../channels/channelResponse.js";
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

type TelegramFileAttachment = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  from?: TelegramUser;
  photo?: TelegramPhotoSize[];
  document?: TelegramFileAttachment;
  audio?: TelegramFileAttachment;
  voice?: TelegramFileAttachment;
  video?: TelegramFileAttachment;
  video_note?: TelegramFileAttachment;
  animation?: TelegramFileAttachment;
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
  parameters?: {
    retry_after?: number;
  };
}

type TelegramApiResponse<T> = TelegramApiOkResult<T> | TelegramApiErrorResult;

type TelegramGetFileResult = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

type AskUserQuestionDetails = {
  question: string;
  options: string[];
  allowSkip: boolean;
};

type TelegramVoiceNoteTranscript = {
  name: string;
  mimeType: string;
  transcript?: string;
  error?: string;
  model?: string;
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

const getAllowedTelegramUserIds = (): string[] => {
  const allowedUserIds = backendConfig.channels.telegram.allowedUserIds;
  if (allowedUserIds.length === 0) {
    throw new Error("LILO_TELEGRAM_ALLOWED_USER_IDS is not configured");
  }

  return allowedUserIds;
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

const isImageMimeType = (value: string): boolean =>
  normalizeMediaMimeType(value).startsWith("image/");

const MEDIA_MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".aac": "audio/aac",
  ".amr": "audio/amr",
  ".flac": "audio/flac",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

const MEDIA_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "audio/aac": ".aac",
  "audio/amr": ".amr",
  "audio/flac": ".flac",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "text/plain": ".txt",
  "video/mp4": ".mp4",
  "video/mpeg": ".mpeg",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

const getMediaExtension = (mimeType: string): string =>
  MEDIA_EXTENSION_BY_MIME_TYPE[normalizeMediaMimeType(mimeType)] ?? ".bin";

const getMimeTypeFromFilePath = (filePath: string | undefined): string | null => {
  if (!filePath) {
    return null;
  }

  return MEDIA_MIME_TYPE_BY_EXTENSION[extname(filePath).toLowerCase()] ?? null;
};

const getTelegramUploadName = (
  prefix: string,
  attachment: TelegramFileAttachment,
  mimeType: string,
): string =>
  attachment.file_name?.trim() || `${prefix}-${attachment.file_id}${getMediaExtension(mimeType)}`;

const MAX_TELEGRAM_REPLY_CHARS = 3_800;
const TELEGRAM_RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const telegramApiFetch = async <T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
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

    if (response.ok && payload?.ok === true) {
      return payload.result;
    }

    const description =
      payload && payload.ok === false
        ? payload.description ?? `Telegram API ${method} failed`
        : `Telegram API ${method} failed`;
    lastError = new Error(description);
    const retryAfter =
      payload && payload.ok === false && typeof payload.parameters?.retry_after === "number"
        ? payload.parameters.retry_after * 1_000
        : null;
    const isRetryable =
      attempt < 3 && (TELEGRAM_RETRYABLE_STATUS_CODES.has(response.status) || Boolean(retryAfter));

    console.error(
      `[telegram] API ${method} failed attempt=${attempt} status=${response.status} retryable=${isRetryable} description=${description}`,
    );

    if (!isRetryable) {
      throw lastError;
    }

    await sleep(retryAfter ?? 500 * attempt);
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error(`Telegram API ${method} failed for an unknown reason`));
};

const telegramApiFetchFormData = async <T>(
  botToken: string,
  method: string,
  body: FormData,
): Promise<T> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      body,
    });

    const responseText = await response.text();
    let payload: TelegramApiResponse<T> | null = null;
    try {
      payload = JSON.parse(responseText) as TelegramApiResponse<T>;
    } catch {
      payload = null;
    }

    if (response.ok && payload?.ok === true) {
      return payload.result;
    }

    const description =
      payload && payload.ok === false
        ? payload.description ?? `Telegram API ${method} failed`
        : `Telegram API ${method} failed`;
    lastError = new Error(description);
    const retryAfter =
      payload && payload.ok === false && typeof payload.parameters?.retry_after === "number"
        ? payload.parameters.retry_after * 1_000
        : null;
    const isRetryable =
      attempt < 3 && (TELEGRAM_RETRYABLE_STATUS_CODES.has(response.status) || Boolean(retryAfter));

    console.error(
      `[telegram] API ${method} failed attempt=${attempt} status=${response.status} retryable=${isRetryable} description=${description}`,
    );

    if (!isRetryable) {
      throw lastError;
    }

    await sleep(retryAfter ?? 500 * attempt);
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error(`Telegram API ${method} failed for an unknown reason`));
};

const findTelegramReplySplitIndex = (text: string): number => {
  const search = text.slice(0, MAX_TELEGRAM_REPLY_CHARS + 1);
  const minimumCleanBoundary = Math.floor(MAX_TELEGRAM_REPLY_CHARS * 0.45);
  const boundaries = [
    { pattern: "\n", offset: 0 },
    { pattern: ". ", offset: 1 },
    { pattern: "? ", offset: 1 },
    { pattern: "! ", offset: 1 },
    { pattern: "; ", offset: 1 },
    { pattern: ", ", offset: 1 },
    { pattern: " ", offset: 0 },
  ];

  let best = -1;
  for (const boundary of boundaries) {
    const index = search.lastIndexOf(boundary.pattern);
    if (index >= minimumCleanBoundary && index > best) {
      best = index + boundary.offset;
    }
  }

  return best > 0 ? best : MAX_TELEGRAM_REPLY_CHARS;
};

const splitOversizedTelegramText = (text: string): string[] => {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > MAX_TELEGRAM_REPLY_CHARS) {
    const splitIndex = findTelegramReplySplitIndex(remaining);
    const chunk = remaining.slice(0, splitIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
};

const splitTelegramReply = (body: string): string[] => {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  const appendChunk = (chunk: string) => {
    const trimmed = chunk.trim();
    if (trimmed.length === 0) {
      return;
    }

    if (trimmed.length > MAX_TELEGRAM_REPLY_CHARS) {
      splitOversizedTelegramText(trimmed).forEach(appendChunk);
      return;
    }

    const previous = chunks[chunks.length - 1];
    const joined = previous ? `${previous}\n\n${trimmed}` : trimmed;
    if (previous && joined.length <= MAX_TELEGRAM_REPLY_CHARS) {
      chunks[chunks.length - 1] = joined;
      return;
    }

    chunks.push(trimmed);
  };

  paragraphs.forEach(appendChunk);
  return chunks;
};

const buildTelegramInlineKeyboard = (
  linkButtons: MessagingLinkButton[],
): { inline_keyboard: Array<Array<{ text: string; url: string }>> } | undefined => {
  if (linkButtons.length === 0) {
    return undefined;
  }

  return {
    inline_keyboard: linkButtons.map((button) => [
      {
        text: button.text,
        url: button.url,
      },
    ]),
  };
};

const sendTelegramReply = async (
  chatId: number,
  body: string,
  linkButtons: MessagingLinkButton[] = [],
): Promise<void> => {
  const botToken = getTelegramBotToken();
  const replyMarkup = buildTelegramInlineKeyboard(linkButtons);

  try {
    await telegramApiFetch(botToken, "sendMessage", {
      chat_id: chatId,
      text: body,
      parse_mode: "HTML",
      link_preview_options: {
        is_disabled: true,
      },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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

const sendTelegramReplyChunked = async (chatId: number, body: string): Promise<number> => {
  const formatted = formatTelegramMessagingOutput(body, {
    publicAppUrl: backendConfig.server.publicAppUrl,
  });
  const chunks = splitTelegramReply(formatted.text);

  for (const [index, chunk] of chunks.entries()) {
    const linkButtons = index === chunks.length - 1 ? formatted.linkButtons : [];
    await sendTelegramReply(chatId, chunk, linkButtons);
  }

  return chunks.length;
};

const sendTelegramChannelResponse = async (
  chatId: number,
  details: SendChannelResponseDetails,
): Promise<number> => {
  const botToken = getTelegramBotToken();
  const mediaBatch = await prepareChannelResponseMedia(details);
  let sentCount = 0;

  for (const media of mediaBatch) {
    const method =
      media.responseType === "voice"
        ? "sendVoice"
        : media.responseType === "image"
          ? "sendPhoto"
          : "sendDocument";
    const field =
      media.responseType === "voice"
        ? "voice"
        : media.responseType === "image"
          ? "photo"
          : "document";
    const action =
      media.responseType === "voice"
        ? "upload_voice"
        : media.responseType === "image"
          ? "upload_photo"
          : "upload_document";

    await sendTelegramChatAction(chatId, action);

    const formData = new FormData();
    formData.set("chat_id", String(chatId));
    if (media.caption) {
      formData.set("caption", media.caption);
    }
    if (media.url) {
      formData.set(field, media.url);
    } else if (media.bytes) {
      const audioBuffer = media.bytes.buffer.slice(
        media.bytes.byteOffset,
        media.bytes.byteOffset + media.bytes.byteLength,
      ) as ArrayBuffer;
      formData.set(field, new Blob([audioBuffer], { type: media.mimeType }), media.filename);
    } else {
      throw new Error("Telegram channel response media has no URL or bytes");
    }

    try {
      await telegramApiFetchFormData<unknown>(botToken, method, formData);
      sentCount += 1;
    } catch (error) {
      captureBackendException(error, {
        tags: {
          area: "telegram",
          provider: "telegram",
          operation: "send_channel_response",
          chat_id: chatId,
          response_type: media.responseType,
          mime_type: media.mimeType,
        },
        extras: {
          filename: media.filename,
          hasUrl: Boolean(media.url),
          byteLength: media.bytes?.byteLength ?? null,
        },
        level: "error",
        fingerprint: ["telegram", "send_channel_response", media.responseType],
      });
      throw error;
    }
  }

  return sentCount;
};

export const sendTelegramAutomationMessage = async (body: string): Promise<void> => {
  const allowedUserIds = getAllowedTelegramUserIds();
  const failures: Array<{ recipient: string; error: unknown }> = [];

  for (const allowedUserId of allowedUserIds) {
    const chatId = Number(allowedUserId);
    if (!Number.isFinite(chatId)) {
      throw new Error("LILO_TELEGRAM_ALLOWED_USER_IDS must contain numeric Telegram user IDs");
    }

    try {
      await sendTelegramReplyChunked(chatId, body);
    } catch (error) {
      failures.push({ recipient: allowedUserId, error });
    }
  }

  if (failures.length > 0) {
    const error = new Error(
      `Failed to send Telegram automation message to ${failures.length} allowed user(s)`,
    );
    captureBackendException(error, {
      tags: {
        area: "telegram",
        provider: "telegram",
        operation: "send_automation_fanout",
      },
      extras: {
        recipients: failures.map((failure) => failure.recipient),
        errors: failures.map(({ error: failure }) =>
          failure instanceof Error ? failure.message : String(failure),
        ),
      },
    });
    throw error;
  }
};

const sendTelegramChatAction = async (
  chatId: number,
  action: "typing" | "upload_photo" | "upload_document" | "upload_voice",
): Promise<void> => {
  const botToken = getTelegramBotToken();
  await telegramApiFetch(botToken, "sendChatAction", {
    chat_id: chatId,
    action,
  });
};

const sendTelegramThumbsUpReaction = async (
  chatId: number,
  messageId: number,
): Promise<void> => {
  const botToken = getTelegramBotToken();
  await telegramApiFetch(botToken, "setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: "emoji", emoji: "👍" }],
  });
};

const startTelegramTypingIndicatorLoop = (chatId: number): (() => void) => {
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    try {
      await sendTelegramChatAction(chatId, "typing");
    } catch (error) {
      console.warn(
        `[telegram] failed to send typing indicator chat=${chatId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  void tick();
  interval = setInterval(() => {
    if (!stopped) {
      void tick();
    }
  }, 4_000);

  return () => {
    stopped = true;
    if (interval) {
      clearInterval(interval);
    }
  };
};

const downloadTelegramFile = async (
  botToken: string,
  attachment: TelegramFileAttachment,
  prefix: string,
): Promise<UploadedChatFile | null> => {
  const file = await telegramApiFetch<TelegramGetFileResult>(botToken, "getFile", {
    file_id: attachment.file_id,
  });

  if (!file.file_path) {
    return null;
  }

  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
  if (!response.ok) {
    throw new Error(`Failed to download Telegram file ${attachment.file_id}: ${response.status}`);
  }

  const mimeType = normalizeMediaMimeType(
    attachment.mime_type?.trim()
      || getMimeTypeFromFilePath(file.file_path)
      || response.headers.get("content-type")?.trim()
      || "application/octet-stream",
  );
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString("base64");
  const image: ImageContent | undefined = isImageMimeType(mimeType)
    ? {
        type: "image",
        mimeType,
        data,
      }
    : undefined;

  return {
    originalName: getTelegramUploadName(prefix, attachment, mimeType),
    mimeType,
    size: arrayBuffer.byteLength,
    bytes: new Uint8Array(arrayBuffer),
    image,
  };
};

const loadInboundMedia = async (message: TelegramMessage): Promise<UploadedChatFile[]> => {
  const botToken = getTelegramBotToken();
  const uploads: UploadedChatFile[] = [];
  const photos = message.photo ?? [];

  if (photos.length > 0) {
    const preferred = [...photos].sort((left, right) => {
      const leftSize = (left.file_size ?? 0) || left.width * left.height;
      const rightSize = (right.file_size ?? 0) || right.width * right.height;
      return rightSize - leftSize;
    })[0];

    try {
      const upload = await downloadTelegramFile(
        botToken,
        {
          file_id: preferred.file_id,
          file_name: `telegram-photo-${message.message_id}.jpg`,
          mime_type: "image/jpeg",
          file_size: preferred.file_size,
        },
        "telegram-photo",
      );
      if (upload) {
        uploads.push(upload);
      }
    } catch (error) {
      console.warn("[telegram] failed to process inbound photo", {
        fileId: preferred.file_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const attachments: Array<{ prefix: string; file: TelegramFileAttachment | undefined }> = [
    { prefix: "telegram-document", file: message.document },
    { prefix: "telegram-audio", file: message.audio },
    { prefix: "telegram-voice", file: message.voice },
    { prefix: "telegram-video", file: message.video },
    { prefix: "telegram-video-note", file: message.video_note },
    { prefix: "telegram-animation", file: message.animation },
  ];

  for (const { prefix, file } of attachments) {
    if (!file?.file_id) {
      continue;
    }

    try {
      const upload = await downloadTelegramFile(botToken, file, prefix);
      if (upload) {
        uploads.push(upload);
      }
    } catch (error) {
      console.warn("[telegram] failed to process inbound media", {
        prefix,
        fileId: file.file_id,
        mimeType: file.mime_type ?? "unknown",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return uploads;
};

const extractTelegramMessage = (update: TelegramUpdate): TelegramMessage | null => update.message ?? null;

const transcribeInboundVoiceNotes = async (
  uploads: UploadedChatFile[],
): Promise<TelegramVoiceNoteTranscript[]> => {
  const voiceNotes = uploads.filter((upload) => isAudioMimeType(upload.mimeType));
  const transcripts: TelegramVoiceNoteTranscript[] = [];

  for (const upload of voiceNotes) {
    const mimeType = normalizeMediaMimeType(upload.mimeType);
    try {
      const result = await transcribeAudioWithOpenAi({
        bytes: upload.bytes,
        fileName: upload.originalName,
        mimeType,
        prompt: "This is a short Telegram voice or audio message to a personal assistant named Lilo.",
      });

      transcripts.push({
        name: upload.originalName,
        mimeType,
        transcript: result.text,
        model: result.model,
      });
      console.log(
        `[telegram] transcribed audio name=${upload.originalName} mimeType=${mimeType} model=${result.model} transcriptLength=${result.text.length}`,
      );
    } catch (error) {
      const unavailable = error instanceof AudioTranscriptionUnavailableError;
      transcripts.push({
        name: upload.originalName,
        mimeType,
        error: unavailable ? "not_configured" : "failed",
      });

      if (!unavailable) {
        captureBackendException(error, {
          tags: {
            area: "telegram",
            provider: "openai",
            operation: "transcribe_audio",
            mime_type: mimeType,
          },
          extras: {
            fileName: upload.originalName,
            fileSize: upload.size,
          },
          level: "error",
          fingerprint: ["telegram", "audio", "transcription"],
        });
      }

      console.warn("[telegram] failed to transcribe audio", {
        fileName: upload.originalName,
        mimeType,
        unavailable,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return transcripts;
};

const buildInboundTelegramPrompt = ({
  inboundText,
  fromLabel,
  chatLabel,
  transcripts,
}: {
  inboundText: string;
  fromLabel: string;
  chatLabel: string;
  transcripts: TelegramVoiceNoteTranscript[];
}): string => {
  const parts = [
    "Channel: Telegram",
    "",
    "You received a Telegram message. Reply with a concise, helpful response.",
    "",
    `From: ${fromLabel}`,
    `Chat: ${chatLabel}`,
    "",
    `Telegram message from user: ${inboundText || "(empty message)"}`,
  ];

  if (transcripts.length > 0) {
    parts.push("", "Audio transcript(s):");
    for (const [index, transcript] of transcripts.entries()) {
      const label = `Audio ${index + 1} (${transcript.name}, ${transcript.mimeType})`;
      if (transcript.transcript) {
        parts.push(`${label}: ${transcript.transcript}`);
      } else {
        parts.push(`${label}: transcription unavailable`);
      }
    }
  }

  return parts.join("\n");
};

const getAskUserQuestionDetails = (value: unknown): AskUserQuestionDetails | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const details = value as {
    question?: unknown;
    options?: unknown;
    allowSkip?: unknown;
  };
  const question = typeof details.question === "string" ? details.question.trim() : "";
  const options = Array.isArray(details.options)
    ? details.options
        .filter((option): option is string => typeof option === "string")
        .map((option) => option.trim())
        .filter(Boolean)
    : [];

  if (!question && options.length === 0) {
    return null;
  }

  return {
    question,
    options,
    allowSkip: typeof details.allowSkip === "boolean" ? details.allowSkip : true,
  };
};

const formatTelegramQuestionFallback = (details: AskUserQuestionDetails): string => {
  const parts = [
    details.question || "Could you reply with a bit more information?",
  ];

  if (details.options.length > 0) {
    parts.push(
      "",
      "Reply with one of these options:",
      ...details.options.map((option, index) => `${index + 1}. ${option}`),
    );
  }

  if (details.allowSkip) {
    parts.push("", "You can also reply with \"skip\" if you want me to choose a reasonable default.");
  }

  return parts.join("\n");
};

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
        await sendTelegramThumbsUpReaction(message.chat.id, message.message_id);
      } catch (error) {
        console.warn("[telegram] failed to set thumbs up reaction", {
          chatId: message.chat.id,
          messageId: message.message_id,
          error: error instanceof Error ? error.message : String(error),
        });
        captureBackendException(error, {
          tags: {
            area: "telegram",
            provider: "telegram",
            operation: "set_message_reaction",
            chat_id: message.chat.id,
          },
          extras: {
            messageId: message.message_id,
            reaction: "thumbs_up",
          },
          level: "warning",
          fingerprint: ["telegram", "set_message_reaction", "thumbs_up"],
        });
      }

      const stopTypingIndicator = startTelegramTypingIndicatorLoop(message.chat.id);

      try {
        const now = new Date();
        const timezone = await getTelegramThreadTimezone();
        const inboundMedia = await loadInboundMedia(message);
        const audioTranscripts = await transcribeInboundVoiceNotes(inboundMedia);

        let chatId = await resolveDailyTelegramChatId(threadKey, now, timezone);
        if (!chatId || !(await chatService.hasChat(chatId))) {
          const chat = await chatService.createChat();
          chatId = chat.id;
          await storeDailyTelegramChatId(threadKey, now, timezone, chatId);
          console.log(`[telegram] created chat=${chatId} thread=${threadKey} timezone=${timezone}`);
        }

        const resolvedUploads = inboundMedia.length > 0
          ? await chatService.resolveUploads(
              chatId,
              await chatService.storeUploads(chatId, inboundMedia),
            )
          : { images: [], attachments: [] };
        const inboundPrompt = buildInboundTelegramPrompt({
          inboundText,
          fromLabel,
          chatLabel,
          transcripts: audioTranscripts,
        });
        console.log(
          `[telegram] inbound chat=${message.chat.id} thread=${threadKey} textLength=${inboundText.length} mediaCount=${inboundMedia.length} imageCount=${resolvedUploads.images.length} attachmentCount=${resolvedUploads.attachments.length} audioTranscriptCount=${audioTranscripts.length} timezone=${timezone}`,
        );

        const currentChat = await chatService.getChat(chatId);
        if (currentChat?.status === "streaming") {
          console.log(`[telegram] steering active chat=${chatId} thread=${threadKey}`);
          await chatService.steerChat(chatId, {
            message: inboundPrompt,
            images: resolvedUploads.images,
            attachments: resolvedUploads.attachments,
            context: {},
          });
          console.log(`[telegram] steer accepted chat=${chatId} thread=${threadKey}`);
          return;
        }

        let responseText = "";
        let currentAssistantMessageText = "";
        let sentMessageCount = 0;
        let completionReason: string | null = null;
        let sendQueue = Promise.resolve();

        const enqueueTelegramSend = (
          text: string,
          kind: "assistant" | "question_fallback",
        ) => {
          const bodyToSend = text.trim();
          if (bodyToSend.length === 0) {
            return;
          }

          sendQueue = sendQueue.then(async () => {
            const chunks = await sendTelegramReplyChunked(message.chat.id, bodyToSend);
            sentMessageCount += chunks;
            console.log(
              `[telegram] replied chat=${chatId} thread=${threadKey} kind=${kind} chunks=${chunks} sentMessageCount=${sentMessageCount}`,
            );
          });
        };

        const flushAssistantMessage = () => {
          const text = currentAssistantMessageText.trim();
          currentAssistantMessageText = "";
          enqueueTelegramSend(text, "assistant");
        };

        await chatService.promptChat(
          chatId,
          {
            message: inboundPrompt,
            images: resolvedUploads.images,
            attachments: resolvedUploads.attachments,
            context: {},
          },
          (event: SseEvent) => {
            if (event.event === "assistant_message_start") {
              currentAssistantMessageText = "";
            }

            if (event.event === "text_delta") {
              const delta = (event.data as { delta?: string }).delta ?? "";
              responseText += delta;
              currentAssistantMessageText += delta;
            }

            if (event.event === "assistant_message_end") {
              flushAssistantMessage();
            }

            if (event.event === "tool_result") {
              const toolName = (event.data as { toolName?: unknown }).toolName;
              if (toolName === ASK_USER_QUESTION_TOOL_NAME) {
                flushAssistantMessage();
                const details = getAskUserQuestionDetails(
                  (event.data as { details?: unknown }).details,
                );
                if (details) {
                  const fallback = formatTelegramQuestionFallback(details);
                  responseText += `\n\n${fallback}`;
                  enqueueTelegramSend(fallback, "question_fallback");
                }
              }

              if (toolName === CHANNEL_RESPONSE_TOOL_NAME) {
                flushAssistantMessage();
                const details = (event.data as { details?: unknown }).details;
                if (isSendChannelResponseDetails(details)) {
                  sendQueue = sendQueue.then(async () => {
                    const sentCount = await sendTelegramChannelResponse(message.chat.id, details);
                    sentMessageCount += sentCount;
                    console.log(
                      `[telegram] sent channel response chat=${chatId} thread=${threadKey} responseType=${details.responseType} sentMessageCount=${sentMessageCount}`,
                    );
                  });
                }
              }
            }

            if (event.event === "done") {
              completionReason =
                typeof (event.data as { reason?: unknown }).reason === "string"
                  ? (event.data as { reason: string }).reason
                  : "completed";
            }

            if (event.event === "error") {
              completionReason = "error";
            }
          },
        );

        flushAssistantMessage();
        await sendQueue;

        console.log(
          `[telegram] prompt finished chat=${chatId} thread=${threadKey} completionReason=${
            completionReason ?? "unknown"
          } responseLength=${responseText.trim().length} sentMessageCount=${sentMessageCount}`,
        );

        if (completionReason !== "completed" || sentMessageCount === 0) {
          const reason = completionReason ?? "unknown";
          const severity = completionReason === "aborted" ? "warning" : "error";
          const skipError = new Error(
            `Telegram reply skipped for chat=${chatId} because completionReason=${reason} sentMessageCount=${sentMessageCount} responseLength=${responseText.trim().length}`,
          );
          captureBackendException(skipError, {
            tags: {
              area: "telegram",
              provider: "telegram",
              operation: "skip_reply",
              chat_id: message.chat.id,
              completion_reason: reason,
            },
            extras: {
              chatId,
              responseText,
              responseLength: responseText.trim().length,
              sentMessageCount,
              imageCount: resolvedUploads.images.length,
              attachmentCount: resolvedUploads.attachments.length,
              audioCount: audioTranscripts.length,
              audioTranscriptCount: audioTranscripts.filter((item) => item.transcript).length,
              textLength: inboundText.length,
            },
            level: severity,
            fingerprint: ["telegram", "skip_reply", reason],
          });
          console.error(
            `[telegram] skipped reply chat=${chatId} thread=${threadKey} completionReason=${reason} sentMessageCount=${sentMessageCount} responseLength=${responseText.trim().length}`,
          );
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
      } finally {
        stopTypingIndicator();
      }
    };

    void processTelegram();

    return c.json({ ok: true }, 200);
  });
};
