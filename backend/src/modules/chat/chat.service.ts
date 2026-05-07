import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { AgentSessionEvent, SessionContext } from "@mariozechner/pi-coding-agent";
import {
  SessionManager,
  createAgentSession,
} from "@mariozechner/pi-coding-agent";
import {
  type ImageContent,
  complete,
  getEnvApiKey,
  getModel,
  type TextContent,
} from "@mariozechner/pi-ai";
import type { UploadedChatFile } from "./chat.request.js";
import {
  OPEN_APP_TOOL_NAME,
  isOpenAppDetails,
} from "../../shared/tools/openAppTool.js";
import { buildPiSystemPrompt } from "../../shared/prompts/piSystemPrompt.js";
import { backendConfig } from "../../shared/config/config.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import { resolveSessionSubdir } from "../../shared/config/sessions.js";
import {
  type ChatModelSelection,
  getDefaultChatModelSelection,
  getPromptFirstEventTimeoutMs,
  getPromptTimeoutMs,
  isSupportedChatModelSelection,
  resolvePiModel,
} from "../../shared/pi/runtime.js";
import { createSystemPromptResourceLoader } from "../../shared/pi/resourceLoader.js";
import { ensureDir, persistSessionManager } from "../../shared/session/sessionStore.js";
import { createStreamingTimeouts } from "../../shared/session/timeouts.js";
import {
  getLatestAssistantMessage,
  reportPiUpstreamError,
} from "../../shared/pi/errorReporting.js";
import { captureBackendException } from "../../shared/observability/sentry.js";
import { CUSTOM_TOOLS } from "../../shared/tools/index.js";
import { readWorkspaceAppPrefs } from "../../shared/workspace/appPrefs.js";

export type ChatMessageRole =
  | "user"
  | "assistant"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "system";

export interface ChatAttachment {
  name: string;
  type: string;
  previewUrl: string;
  kind?: "image" | "file" | "selected_element";
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: string;
  toolDetails?: unknown;
  isError?: boolean;
  attachments?: ChatAttachment[];
  viewerPath?: string;
  appName?: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status: "idle" | "streaming" | "error";
  activeRunId: string | null;
  activeRunLastSeq: number | null;
  modelProvider: ChatModelSelection["provider"];
  modelId: ChatModelSelection["modelId"];
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
}

export interface ChatContextSelectedElement {
  html: string;
  tagName?: string;
  label?: string;
  textPreview?: string;
  previewUrl?: string;
}

export interface ChatLocationSnapshot {
  latitude?: number;
  longitude?: number;
  horizontalAccuracyMeters?: number;
  altitudeMeters?: number | null;
  courseDegrees?: number | null;
  speedMetersPerSecond?: number | null;
  capturedAt?: string;
  source?: string;
}

export interface ChatLocationContext {
  current?: ChatLocationSnapshot;
  recent?: ChatLocationSnapshot[];
}

export interface ChatContext {
  viewerPath?: string;
  selectedElement?: ChatContextSelectedElement;
  selectedElements?: ChatContextSelectedElement[];
  location?: ChatLocationContext;
}

export interface ChatPromptInput {
  message: string;
  images: ImageContent[];
  attachments: ChatPromptAttachment[];
  context: ChatContext;
}

export interface ChatPromptOptions {
  streamingBehavior?: "steer" | "followUp";
}

export interface SseEvent {
  event:
    | "assistant_message_start"
    | "assistant_message_end"
    | "assistant_text_start"
    | "assistant_text_end"
    | "status"
    | "text_delta"
    | "thinking_delta"
    | "tool_call"
    | "tool_result"
    | "done"
    | "error";
  data: Record<string, unknown>;
}

export type ChatRunStatus = "streaming" | "completed" | "aborted" | "error";

export interface ChatRunEventEnvelope {
  chatId: string;
  runId: string;
  seq: number;
  status: ChatRunStatus;
  event: SseEvent;
  replay?: boolean;
}

export interface ChatRunSnapshot {
  chatId: string;
  activeRunId: string | null;
  runId: string | null;
  status: ChatRunStatus | "idle";
  lastSeq: number;
  events: ChatRunEventEnvelope[];
}

export interface ChatUpdatedEvent {
  chatId: string;
  title: string;
}

interface AppMemoryContextEntry {
  appName: string;
  memory: string;
}

const escapeXmlText = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatLocationSnapshot = (
  snapshot: ChatLocationSnapshot,
  tagName: "current_location" | "recent_location",
): string | null => {
  const latitude = finiteNumber(snapshot.latitude);
  const longitude = finiteNumber(snapshot.longitude);
  const horizontalAccuracyMeters = finiteNumber(snapshot.horizontalAccuracyMeters);

  if (latitude === null || longitude === null || horizontalAccuracyMeters === null) {
    return null;
  }

  const lines = [`<${tagName}>`];
  lines.push(`<latitude>${latitude}</latitude>`);
  lines.push(`<longitude>${longitude}</longitude>`);
  lines.push(`<horizontal_accuracy_meters>${horizontalAccuracyMeters}</horizontal_accuracy_meters>`);

  const altitudeMeters = finiteNumber(snapshot.altitudeMeters);
  if (altitudeMeters !== null) {
    lines.push(`<altitude_meters>${altitudeMeters}</altitude_meters>`);
  }

  const courseDegrees = finiteNumber(snapshot.courseDegrees);
  if (courseDegrees !== null) {
    lines.push(`<course_degrees>${courseDegrees}</course_degrees>`);
  }

  const speedMetersPerSecond = finiteNumber(snapshot.speedMetersPerSecond);
  if (speedMetersPerSecond !== null) {
    lines.push(`<speed_meters_per_second>${speedMetersPerSecond}</speed_meters_per_second>`);
  }

  if (typeof snapshot.capturedAt === "string" && snapshot.capturedAt.trim().length > 0) {
    lines.push(`<captured_at>${escapeXmlText(snapshot.capturedAt.trim())}</captured_at>`);
  }

  if (typeof snapshot.source === "string" && snapshot.source.trim().length > 0) {
    lines.push(`<source>${escapeXmlText(snapshot.source.trim())}</source>`);
  }

  lines.push(`</${tagName}>`);
  return lines.join("\n");
};

interface ChatMetadata {
  modelSelection?: ChatModelSelection;
  title?: string;
}

const GLOBAL_MEMORY_INDEX_PATH = "memory/INDEX.md";
const CHAT_METADATA_SUFFIX = ".lilo-chat.json";
const CHAT_TITLE_TRANSCRIPT_CHAR_LIMIT = 1_400_000;

type SessionAgentMessage = SessionContext["messages"][number];

class ChatNotFoundError extends Error {
  constructor(chatId: string) {
    super(`Chat "${chatId}" was not found`);
    this.name = "ChatNotFoundError";
  }
}

class ChatBusyError extends Error {
  constructor(chatId: string) {
    super(`Chat "${chatId}" is already processing a prompt`);
    this.name = "ChatBusyError";
  }
}

interface LiveChatHandle {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"];
  sessionManager: SessionManager;
  status: "idle" | "streaming" | "error";
  stopRequested: boolean;
  lastError: string | null;
  activeRunId: string | null;
}

type ChatStreamListener = (event: SseEvent) => void | Promise<void>;
type ChatRunListener = (event: ChatRunEventEnvelope) => void | Promise<void>;
type ChatUpdatedListener = (event: ChatUpdatedEvent) => void | Promise<void>;

interface ChatRunState {
  id: string;
  status: ChatRunStatus;
  nextSeq: number;
  lastSeq: number;
  events: ChatRunEventEnvelope[];
}

interface ChatRunRegistry {
  activeRunId: string | null;
  lastRunId: string | null;
  runs: Map<string, ChatRunState>;
}

interface StoredUpload {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  absolutePath: string;
  workspacePath: string;
  image?: ImageContent;
  createdAt: number;
}

export interface ChatPromptAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  absolutePath: string;
  workspacePath: string;
  createdAt: string;
  expiresAt: string;
  isImage: boolean;
}

const MAX_STORED_UPLOADS_PER_CHAT = 24;
const UPLOAD_TTL_MS = 1000 * 60 * 60 * 48;
const TMP_UPLOAD_ROOT = "tmp/uploads";

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizeGeneratedTitle = (value: string): string => {
  const normalized = normalizeText(value)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[Tt]itle:\s*/g, "");

  if (!normalized) {
    return "";
  }

  return normalized;
};

const resolveChatTitleModel = () => {
  const hasOpenAiKey = typeof getEnvApiKey("openai") === "string";
  const hasAnthropicKey = typeof getEnvApiKey("anthropic") === "string";

  if (hasAnthropicKey && !hasOpenAiKey) {
    const model = getModel("anthropic", "claude-haiku-4-5");
    if (!model) {
      throw new Error('Unable to resolve model "anthropic/claude-haiku-4-5" from the Pi SDK');
    }
    return model;
  }

  const model = getModel("openai", "gpt-5.4-nano");
  if (!model) {
    throw new Error('Unable to resolve model "openai/gpt-5.4-nano" from the Pi SDK');
  }
  return model;
};

const formatPersistedErrorMessage = (message: string): string => {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Pi hit an upstream provider error. Please try again.";
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: unknown; type?: unknown };
      message?: unknown;
    };
    const nestedMessage =
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : trimmed;

    if (/overloaded/i.test(nestedMessage)) {
      return `Pi's model provider is overloaded right now.\n\n${trimmed}`;
    }

    if (/internal server error/i.test(nestedMessage)) {
      return `Pi's model provider returned an internal server error.\n\n${trimmed}`;
    }
  } catch {
    if (/overloaded/i.test(trimmed)) {
      return `Pi's model provider is overloaded right now.\n\n${trimmed}`;
    }

    if (/internal server error/i.test(trimmed)) {
      return `Pi's model provider returned an internal server error.\n\n${trimmed}`;
    }
  }

  return `Pi ran into an upstream error.\n\n${trimmed}`;
};

const resolveSessionDir = (): string => {
  return ensureDir(resolveSessionSubdir("chats"));
};

const contentToText = (
  value: string | (TextContent | ImageContent)[] | unknown,
): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        if (!entry || typeof entry !== "object" || !("type" in entry)) {
          return JSON.stringify(entry, null, 2);
        }

        if (entry.type === "text") {
          return entry.text;
        }

        if (entry.type === "image") {
          return "[Image attachment]";
        }

        if (entry.type === "thinking") {
          return entry.thinking;
        }

        if (entry.type === "toolCall") {
          return JSON.stringify(entry.arguments ?? {}, null, 2);
        }

        return JSON.stringify(entry, null, 2);
      })
      .filter((part) => part.length > 0);

    return parts.join("\n");
  }

  if (
    value &&
    typeof value === "object" &&
    "content" in value &&
    Array.isArray((value as { content?: unknown[] }).content)
  ) {
    const content = (value as { content: unknown[] }).content;
    const text = contentToText(content);
    if (text.length > 0) {
      return text;
    }
  }

  if (
    value &&
    typeof value === "object" &&
    "details" in value &&
    (value as { details?: unknown }).details !== undefined
  ) {
    return JSON.stringify((value as { details: unknown }).details, null, 2);
  }

  if (value == null) {
    return "";
  }

  return JSON.stringify(value, null, 2);
};

const buildTitleTranscript = (messages: ChatMessage[]): string => {
  const lines: string[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    const content = normalizeText(message.content);
    if (!content) {
      continue;
    }

    lines.push(`Assistant: ${content}`);
  }

  const transcript = lines.join("\n");
  if (transcript.length <= CHAT_TITLE_TRANSCRIPT_CHAR_LIMIT) {
    return transcript;
  }

  const marker = `\n\n[Transcript truncated to fit title model context. Omitted ${transcript.length - CHAT_TITLE_TRANSCRIPT_CHAR_LIMIT} chars.]\n\n`;
  const availableChars = CHAT_TITLE_TRANSCRIPT_CHAR_LIMIT - marker.length;
  const headChars = Math.max(0, Math.floor(availableChars / 2));
  const tailChars = Math.max(0, availableChars - headChars);

  return `${transcript.slice(0, headChars)}${marker}${transcript.slice(-tailChars)}`;
};

const formatArchivedAppsContext = (appNames: string[]): string => {
  if (appNames.length === 0) {
    return "";
  }

  const archivedAppsList = appNames.map((name) => `- ${name}`).join("\n");
  return [
    "The following workspace apps are archived:",
    archivedAppsList,
    "",
    "Archived apps still exist, but you should not use, modify, or update them unless the user explicitly asks you to work on them or confirms that you should.",
  ].join("\n");
};

const serializeAgentMessages = (messages: SessionAgentMessage[]): ChatMessage[] => {
  const serialized: ChatMessage[] = [];

  const pushMessage = (
    role: ChatMessageRole,
    content: string,
    timestamp: number,
    extra: Partial<ChatMessage> = {},
  ) => {
    const normalized = content.trim();
    if (normalized.length === 0 && role !== "tool_result" && role !== "tool_call") {
      return;
    }

    serialized.push({
      id: randomUUID(),
      role,
      content: normalized,
      timestamp,
      ...extra,
    });
  };

  for (const message of messages) {
    if (message.role === "user") {
      const content = contentToText(message.content);
      const attachments: ChatMessage["attachments"] = [];
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (
            block &&
            typeof block === "object" &&
            "type" in block &&
            block.type === "image" &&
            "data" in block &&
            typeof block.data === "string" &&
            "mimeType" in block &&
            typeof block.mimeType === "string"
          ) {
            attachments.push({
              name: "image",
              type: block.mimeType,
              previewUrl: `data:${block.mimeType};base64,${block.data}`,
              kind: "image",
            });
          }
        }
      }
      pushMessage(
        "user",
        content.length > 0 ? content : "[Image attachment]",
        message.timestamp,
        attachments.length > 0 ? { attachments } : {},
      );
      continue;
    }

    if (message.role === "assistant") {
      let thinkingBuffer = "";
      let assistantBuffer = "";

      const flushThinking = () => {
        if (thinkingBuffer.trim().length > 0) {
          pushMessage("thinking", thinkingBuffer, message.timestamp);
        }
        thinkingBuffer = "";
      };

      const flushAssistant = () => {
        if (assistantBuffer.trim().length > 0) {
          pushMessage("assistant", assistantBuffer, message.timestamp);
        }
        assistantBuffer = "";
      };

      for (const block of message.content) {
        if (block.type === "thinking") {
          flushAssistant();
          thinkingBuffer += block.thinking;
          continue;
        }

        if (block.type === "text") {
          flushThinking();
          assistantBuffer += block.text;
          continue;
        }

        if (block.type === "toolCall") {
          flushThinking();
          flushAssistant();
          pushMessage(
            "tool_call",
            block.name,
            message.timestamp,
            {
              toolName: block.name,
              toolInput: JSON.stringify(block.arguments ?? {}, null, 2),
            },
          );
        }
      }

      flushThinking();
      flushAssistant();

      if (
        message.stopReason === "error" &&
        typeof message.errorMessage === "string" &&
        message.errorMessage.trim().length > 0
      ) {
        pushMessage(
          "system",
          formatPersistedErrorMessage(message.errorMessage),
          message.timestamp,
          { isError: true },
        );
      }
      continue;
    }

    if (message.role === "toolResult") {
      pushMessage(
        "tool_result",
        contentToText(message.content),
        message.timestamp,
        {
          toolName: message.toolName,
          toolDetails: message.details,
          isError: message.isError,
          ...(message.toolName === OPEN_APP_TOOL_NAME && isOpenAppDetails(message.details)
            ? {
                viewerPath: message.details.viewerPath,
                appName: message.details.appName,
              }
            : {}),
        },
      );
      continue;
    }

    if (message.role === "custom") {
      if (message.customType === "lilo_system_prompt" || message.display === false) {
        continue;
      }

      pushMessage("system", contentToText(message.content), message.timestamp);
      continue;
    }

    if (message.role === "bashExecution") {
      pushMessage(
        "tool_result",
        `Command: ${message.command}\n\n${message.output}`,
        message.timestamp,
        {
          toolName: "bash",
          isError: Boolean(message.exitCode && message.exitCode !== 0),
        },
      );
      continue;
    }

    if (message.role === "branchSummary") {
      pushMessage("system", message.summary, message.timestamp);
      continue;
    }

    if (message.role === "compactionSummary") {
      pushMessage("system", message.summary, message.timestamp);
    }
  }

  return serialized;
};

const mapSessionEventToSse = (event: AgentSessionEvent): SseEvent[] => {
  const mapped: SseEvent[] = [];

  if (event.type === "agent_start") {
    mapped.push({
      event: "status",
      data: { state: "working", phase: "agent_start" },
    });
  }

  if (event.type === "message_start" && event.message.role === "assistant") {
    mapped.push({
      event: "assistant_message_start",
      data: {},
    });
  }

  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_start") {
      mapped.push({
        event: "assistant_text_start",
        data: {},
      });
    }

    if (event.assistantMessageEvent.type === "text_delta") {
      mapped.push({
        event: "text_delta",
        data: { delta: event.assistantMessageEvent.delta },
      });
    }

    if (event.assistantMessageEvent.type === "text_end") {
      mapped.push({
        event: "assistant_text_end",
        data: {},
      });
    }

    if (event.assistantMessageEvent.type === "thinking_delta") {
      mapped.push({
        event: "thinking_delta",
        data: { delta: event.assistantMessageEvent.delta },
      });
      mapped.push({
        event: "status",
        data: { state: "thinking", phase: event.assistantMessageEvent.type },
      });
    }
  }

  if (event.type === "message_end" && event.message.role === "assistant") {
    mapped.push({
      event: "assistant_message_end",
      data: {},
    });
  }

  if (event.type === "tool_execution_start") {
    mapped.push({
      event: "status",
      data: { state: "working", phase: "tool_execution_start" },
    });
    mapped.push({
      event: "tool_call",
      data: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.args ?? {},
      },
    });
  }

  if (event.type === "tool_execution_end") {
    const details =
      event.result &&
      typeof event.result === "object" &&
      "details" in event.result
        ? (event.result as { details?: unknown }).details
        : undefined;

    mapped.push({
      event: "tool_result",
      data: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        output: contentToText(event.result),
        isError: event.isError,
        details,
      },
    });
  }

  if (event.type === "agent_end") {
    mapped.push({
      event: "status",
      data: { state: "working", phase: "agent_end" },
    });
  }

  return mapped;
};

export class PiSdkChatService {
  private readonly workspaceDir = WORKSPACE_ROOT;

  private readonly sessionDir = resolveSessionDir();

  private readonly liveChats = new Map<string, LiveChatHandle>();

  private readonly runListeners = new Map<string, Set<ChatRunListener>>();

  private readonly chatUpdatedListeners = new Map<string, Set<ChatUpdatedListener>>();

  private readonly chatRuns = new Map<string, ChatRunRegistry>();

  private readonly uploads = new Map<string, Map<string, StoredUpload>>();

  async healthStatus(): Promise<{
    status: "ok";
    sdk: "ready";
    activeRuns: number;
    sessionDir: string;
    timestamp: string;
  }> {
    return {
      status: "ok",
      sdk: "ready",
      activeRuns: [...this.liveChats.values()].filter(
        (chat) => chat.status === "streaming",
      ).length,
      sessionDir: this.sessionDir,
      timestamp: new Date().toISOString(),
    };
  }

  async listChats(): Promise<ChatSummary[]> {
    const sessions = await SessionManager.list(this.workspaceDir, this.sessionDir);
    return Promise.all(
      sessions
        .sort((left, right) => right.modified.getTime() - left.modified.getTime())
        .map((session) => this.toSummary(session)),
    );
  }

  private async getWorkspaceDefaultChatModelSelection(): Promise<ChatModelSelection> {
    const prefs = await readWorkspaceAppPrefs(this.workspaceDir);
    return prefs.defaultChatModelSelection ?? getDefaultChatModelSelection();
  }

  async createChat(modelSelection?: ChatModelSelection): Promise<ChatDetail> {
    const resolvedModelSelection =
      modelSelection ?? (await this.getWorkspaceDefaultChatModelSelection());
    const sessionManager = SessionManager.create(this.workspaceDir, this.sessionDir);
    await persistSessionManager(sessionManager);
    await this.writeChatModelSelection(
      sessionManager.getSessionFile(),
      resolvedModelSelection,
    );

    return {
      id: sessionManager.getSessionId(),
      title: "New chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      status: "idle",
      activeRunId: null,
      activeRunLastSeq: null,
      modelProvider: resolvedModelSelection.provider,
      modelId: resolvedModelSelection.modelId,
      messages: [],
    };
  }

  async updateChatModel(
    chatId: string,
    modelSelection: ChatModelSelection,
  ): Promise<ChatSummary> {
    const sessionInfo = await this.findSessionInfo(chatId);
    if (!sessionInfo) {
      throw new ChatNotFoundError(chatId);
    }

    const live = this.liveChats.get(chatId);
    if (live?.session.isStreaming || live?.status === "streaming") {
      throw new ChatBusyError(chatId);
    }

    await this.writeChatModelSelection(sessionInfo.path, modelSelection);
    if (live) {
      this.liveChats.delete(chatId);
    }

    return this.toSummary(sessionInfo);
  }

  async hasChat(chatId: string): Promise<boolean> {
    const info = await this.findSessionInfo(chatId);
    return Boolean(info);
  }

  async getSystemPrompt(): Promise<string> {
    return buildPiSystemPrompt(this.workspaceDir, {
      publicAppUrl: backendConfig.server.publicAppUrl,
    });
  }

  async getChat(chatId: string): Promise<ChatDetail | null> {
    const sessionInfo = await this.findSessionInfo(chatId);
    if (!sessionInfo) {
      return null;
    }

    const summary = await this.toSummary(sessionInfo);
    const live = this.liveChats.get(chatId);
    const messages = live
      ? serializeAgentMessages(live.session.messages)
      : this.loadSerializedMessagesFromSessionInfo(sessionInfo);

    return {
      ...summary,
      messageCount: messages.length,
      messages,
    };
  }

  async stopChat(chatId: string): Promise<void> {
    const live = this.liveChats.get(chatId);
    if (!live || !live.session.isStreaming) {
      return;
    }

    live.stopRequested = true;
    await live.session.abort();
  }

  async steerChat(chatId: string, input: ChatPromptInput): Promise<void> {
    const live = await this.getOrCreateLiveChat(chatId);

    if (!live.session.isStreaming && live.status !== "streaming") {
      throw new ChatBusyError(chatId);
    }

    const message = await this.composePromptText(
      input.message,
      input.context,
      input.images.length,
      input.attachments,
    );

    await live.session.prompt(message, {
      ...(input.images.length > 0 ? { images: input.images } : {}),
      streamingBehavior: "steer",
    });
  }

  async storeUploads(
    chatId: string,
    files: UploadedChatFile[],
  ): Promise<string[]> {
    if (!(await this.hasChat(chatId))) {
      throw new ChatNotFoundError(chatId);
    }

    await this.cleanupExpiredUploadFiles(Date.now());
    const chatUploads = this.getOrCreateUploadStore(chatId);
    const createdAt = Date.now();
    const chatUploadDir = resolve(this.workspaceDir, TMP_UPLOAD_ROOT, chatId);
    await mkdir(chatUploadDir, { recursive: true });

    const uploadIds: string[] = [];
    for (const file of files) {
      const id = randomUUID();
      const safeName = this.sanitizeUploadName(file.originalName);
      const fileName = `${id}-${safeName}`;
      const absolutePath = resolve(chatUploadDir, fileName);
      const workspacePath = `${TMP_UPLOAD_ROOT}/${chatId}/${fileName}`;
      await writeFile(absolutePath, file.bytes);
      chatUploads.set(id, {
        id,
        name: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        absolutePath,
        workspacePath,
        image: file.image,
        createdAt,
      });
      uploadIds.push(id);
    }

    await this.pruneUploads(chatUploads, createdAt);
    return uploadIds;
  }

  async resolveUploads(
    chatId: string,
    uploadIds: string[],
  ): Promise<{ images: ImageContent[]; attachments: ChatPromptAttachment[] }> {
    if (uploadIds.length === 0) {
      return { images: [], attachments: [] };
    }

    const chatUploads = this.uploads.get(chatId);
    if (!chatUploads) {
      throw new Error("Uploaded files were not found");
    }

    const now = Date.now();
    await this.pruneUploads(chatUploads, now);

    const storedUploads = uploadIds.map((uploadId) => {
      const stored = chatUploads.get(uploadId);
      if (!stored) {
        throw new Error(`Uploaded file "${uploadId}" was not found or expired`);
      }

      return stored;
    });

    return {
      images: storedUploads
        .map((stored) => stored.image)
        .filter((image): image is ImageContent => Boolean(image)),
      attachments: storedUploads.map((stored) => this.toPromptAttachment(stored)),
    };
  }

  async promptChat(
    chatId: string,
    input: ChatPromptInput,
    onEvent?: ChatStreamListener,
    onRunCreated?: (runId: string) => void | Promise<void>,
    options?: ChatPromptOptions,
  ): Promise<string> {
    const live = await this.getOrCreateLiveChat(chatId);

    if (live.session.isStreaming || live.status === "streaming") {
      throw new ChatBusyError(chatId);
    }

    const run = this.createRunState(chatId);
    live.status = "streaming";
    live.stopRequested = false;
    live.lastError = null;
    live.activeRunId = run.id;

    let sentTerminalEvent = false;
    const promptTimeoutMs = getPromptTimeoutMs();
    const promptFirstEventTimeoutMs = getPromptFirstEventTimeoutMs();

    const timeouts = createStreamingTimeouts({
      firstEventTimeoutMs: promptFirstEventTimeoutMs,
      promptTimeoutMs,
      isStreaming: () => live.status === "streaming",
      onFirstEventTimeout: () => {
        void live.session.abort();
      },
      onPromptTimeout: () => {
        void live.session.abort();
      },
    });

    const unsubscribe = live.session.subscribe((event) => {
      timeouts.markEventSeen();
      const mapped = mapSessionEventToSse(event);
      for (const sse of mapped) {
        if (sse.event === "done" || sse.event === "error") {
          sentTerminalEvent = true;
        }
        void this.emitChatEvent(chatId, run, sse, onEvent);
      }
    });

    try {
      await Promise.resolve(onRunCreated?.(run.id));

      await this.emitChatEvent(
        chatId,
        run,
        {
          event: "status",
          data: { state: "working", phase: "request_accepted" },
        },
        onEvent,
      );

      const message = await this.composePromptText(
        input.message,
        input.context,
        input.images.length,
        input.attachments,
      );
      await live.session.prompt(message, {
        ...(input.images.length > 0 ? { images: input.images } : {}),
        ...(options?.streamingBehavior
          ? { streamingBehavior: options.streamingBehavior }
          : {}),
      });
      const latestAssistantMessage = getLatestAssistantMessage(live.session.messages);
      console.log(
        `[chat-service] prompt completed chat=${chatId} run=${run.id} stopReason=${latestAssistantMessage?.stopReason ?? "unknown"} errorMessage=${typeof latestAssistantMessage?.errorMessage === "string" ? JSON.stringify(latestAssistantMessage.errorMessage) : "none"}`,
      );
      if (
        latestAssistantMessage?.stopReason === "error" ||
        (typeof latestAssistantMessage?.errorMessage === "string" &&
          latestAssistantMessage.errorMessage.trim().length > 0)
      ) {
        reportPiUpstreamError({
          area: "chat_agent_run",
          error:
            latestAssistantMessage?.errorMessage ??
            "Pi SDK prompt resolved with an upstream provider error",
          latestAssistantMessage,
          tags: {
            chatId,
            runId: run.id,
            runStatus: sentTerminalEvent ? "error_event_emitted" : "resolved_with_error",
            timeout: "none",
          },
          extras: {
            promptMessageLength: input.message.length,
            hasImages: input.images.length > 0,
            imageCount: input.images.length,
            hasContext: Boolean(
              input.context.viewerPath ||
                input.context.selectedElement ||
                input.context.selectedElements?.length,
            ),
            liveLastError: live.lastError,
            promptResolved: true,
          },
          fingerprint: ["chat-agent-run", chatId, latestAssistantMessage?.stopReason ?? "unknown"],
        });
      }
      live.status = "idle";
      live.activeRunId = null;

      if (!sentTerminalEvent) {
        run.status = "completed";
        await this.emitChatEvent(
          chatId,
          run,
          {
            event: "status",
            data: { state: "idle", phase: "prompt_resolved" },
          },
          onEvent,
        );
        await this.emitChatEvent(
          chatId,
          run,
          {
            event: "done",
            data: { reason: "completed" },
          },
          onEvent,
        );
        sentTerminalEvent = true;
      }

      void this.updateChatTitle(chatId, live.session.messages);
    } catch (error) {
      const latestAssistantMessage = getLatestAssistantMessage(live.session.messages);
      console.log(
        `[chat-service] prompt failed chat=${chatId} run=${run.id} stopReason=${latestAssistantMessage?.stopReason ?? "unknown"} errorMessage=${typeof latestAssistantMessage?.errorMessage === "string" ? JSON.stringify(latestAssistantMessage.errorMessage) : "none"} error=${error instanceof Error ? error.message : String(error)}`,
      );
      if (live.stopRequested) {
        live.status = "idle";
        live.activeRunId = null;
        if (!sentTerminalEvent) {
          run.status = "aborted";
          await this.emitChatEvent(
            chatId,
            run,
            {
              event: "done",
              data: { reason: "aborted" },
            },
            onEvent,
          );
        }
        return run.id;
      }

      if (timeouts.getState().firstEventTimedOut) {
        live.status = "error";
        live.lastError = `Pi SDK did not emit any events within ${promptFirstEventTimeoutMs}ms`;
        live.activeRunId = null;
        run.status = "error";
      } else if (timeouts.getState().promptTimedOut) {
        live.status = "error";
        live.lastError = `Timed out waiting for Pi SDK to finish the prompt after ${promptTimeoutMs}ms`;
        live.activeRunId = null;
        run.status = "error";
      } else {
        const messageText =
          error instanceof Error ? error.message : "Unknown Pi SDK prompt failure";

        if (/abort/i.test(messageText)) {
          live.status = "idle";
          live.activeRunId = null;
          if (!sentTerminalEvent) {
            run.status = "aborted";
            await this.emitChatEvent(
              chatId,
              run,
              {
                event: "done",
                data: { reason: "aborted" },
              },
              onEvent,
            );
          }
          return run.id;
        }

        live.status = "error";
        live.lastError = messageText;
        live.activeRunId = null;
        run.status = "error";
      }

      reportPiUpstreamError({
        area: "chat_agent_run",
        error,
        latestAssistantMessage,
        tags: {
          chatId,
          runId: run.id,
          runStatus: run.status,
          timeout: timeouts.getState().firstEventTimedOut
            ? "first_event"
            : timeouts.getState().promptTimedOut
              ? "prompt"
              : "none",
        },
        extras: {
          errorMessage: latestAssistantMessage?.errorMessage ?? null,
          promptMessageLength: input.message.length,
          hasImages: input.images.length > 0,
          imageCount: input.images.length,
          hasContext: Boolean(
            input.context.viewerPath ||
              input.context.selectedElement ||
              input.context.selectedElements?.length,
          ),
          liveLastError: live.lastError,
        },
        fingerprint: ["chat-agent-run", chatId, latestAssistantMessage?.stopReason ?? "unknown"],
      });

      if (!sentTerminalEvent) {
        await this.emitChatEvent(
          chatId,
          run,
          {
            event: "error",
            data: {
              message: live.lastError ?? "Unknown Pi SDK streaming failure",
            },
          },
          onEvent,
        );
        await this.emitChatEvent(
          chatId,
          run,
          {
            event: "done",
            data: { reason: "error" },
          },
          onEvent,
        );
      }
    } finally {
      timeouts.clear();
      live.stopRequested = false;
      unsubscribe();
    }

    return run.id;
  }

  subscribeToRunStream(
    chatId: string,
    runId: string | null,
    afterSeq: number,
    listener: ChatRunListener,
  ): { unsubscribe: () => void; snapshot: ChatRunSnapshot } {
    const listeners = this.runListeners.get(chatId) ?? new Set<ChatRunListener>();
    this.runListeners.set(chatId, listeners);
    listeners.add(listener);

    const snapshot = this.getRunSnapshot(chatId, runId, afterSeq);

    return {
      snapshot,
      unsubscribe: () => {
        const current = this.runListeners.get(chatId);
        if (!current) {
          return;
        }

        current.delete(listener);
        if (current.size === 0) {
          this.runListeners.delete(chatId);
        }
      },
    };
  }

  subscribeToChatUpdates(
    chatId: string,
    listener: ChatUpdatedListener,
  ): { unsubscribe: () => void } {
    const listeners = this.chatUpdatedListeners.get(chatId) ?? new Set<ChatUpdatedListener>();
    listeners.add(listener);
    this.chatUpdatedListeners.set(chatId, listeners);

    return {
      unsubscribe: () => {
        const current = this.chatUpdatedListeners.get(chatId);
        if (!current) {
          return;
        }

        current.delete(listener);
        if (current.size === 0) {
          this.chatUpdatedListeners.delete(chatId);
        }
      },
    };
  }

  private async emitChatEvent(
    chatId: string,
    run: ChatRunState,
    event: SseEvent,
    directListener?: ChatStreamListener,
  ): Promise<void> {
    const envelope = this.appendRunEvent(chatId, run, event);
    const listeners = this.runListeners.get(chatId);
    const pending: Promise<void>[] = [];

    if (directListener) {
      pending.push(Promise.resolve(directListener(event)));
    }

    if (listeners) {
      for (const listener of listeners) {
        pending.push(
          Promise.resolve(listener(envelope)).catch((error) => {
            console.warn(`[chat] failed to deliver stream event for ${chatId}:`, error);
          }),
        );
      }
    }

    await Promise.all(pending);
  }

  private async emitChatUpdated(chatId: string, event: ChatUpdatedEvent): Promise<void> {
    const listeners = this.chatUpdatedListeners.get(chatId);
    if (!listeners) {
      return;
    }

    await Promise.all(
      [...listeners].map((listener) =>
        Promise.resolve(listener(event)).catch((error) => {
          console.warn(`[chat] failed to deliver chat update for ${chatId}:`, error);
        }),
      ),
    );
  }

  private createRunState(chatId: string): ChatRunState {
    const registry = this.getOrCreateRunRegistry(chatId);
    const run: ChatRunState = {
      id: randomUUID(),
      status: "streaming",
      nextSeq: 1,
      lastSeq: 0,
      events: [],
    };

    registry.activeRunId = run.id;
    registry.lastRunId = run.id;
    registry.runs.set(run.id, run);
    this.pruneRunRegistry(registry);
    return run;
  }

  private appendRunEvent(
    chatId: string,
    run: ChatRunState,
    event: SseEvent,
  ): ChatRunEventEnvelope {
    const terminalReason =
      event.event === "done" && typeof event.data.reason === "string" ? event.data.reason : null;

    if (terminalReason === "completed") {
      run.status = "completed";
    } else if (terminalReason === "aborted") {
      run.status = "aborted";
    } else if (terminalReason === "error" || event.event === "error") {
      run.status = "error";
    }

    const envelope: ChatRunEventEnvelope = {
      chatId,
      runId: run.id,
      seq: run.nextSeq++,
      status: run.status,
      event,
    };
    run.lastSeq = envelope.seq;
    run.events.push(envelope);

    const registry = this.getOrCreateRunRegistry(chatId);
    if (registry.activeRunId === run.id && run.status !== "streaming") {
      registry.activeRunId = null;
    }

    return envelope;
  }

  private getRunSnapshot(
    chatId: string,
    runId: string | null,
    afterSeq: number,
  ): ChatRunSnapshot {
    const registry = this.chatRuns.get(chatId);
    const targetRunId = runId ?? registry?.activeRunId ?? null;
    const run = targetRunId && registry ? registry.runs.get(targetRunId) ?? null : null;

    return {
      chatId,
      activeRunId: registry?.activeRunId ?? null,
      runId: run?.id ?? null,
      status: run?.status ?? "idle",
      lastSeq: run?.lastSeq ?? 0,
      events:
        run?.events
          .filter((event) => event.seq > afterSeq)
          .map((event) => ({ ...event, replay: true })) ?? [],
    };
  }

  private getOrCreateRunRegistry(chatId: string): ChatRunRegistry {
    const existing = this.chatRuns.get(chatId);
    if (existing) {
      return existing;
    }

    const registry: ChatRunRegistry = {
      activeRunId: null,
      lastRunId: null,
      runs: new Map<string, ChatRunState>(),
    };
    this.chatRuns.set(chatId, registry);
    return registry;
  }

  private pruneRunRegistry(registry: ChatRunRegistry): void {
    const keepIds = [...registry.runs.keys()].filter((runId) => runId === registry.activeRunId);
    const completedIds = [...registry.runs.keys()].filter((runId) => runId !== registry.activeRunId);
    const retainedCompletedIds = completedIds.slice(-4);
    const retainedIds = new Set([...keepIds, ...retainedCompletedIds]);

    for (const runId of registry.runs.keys()) {
      if (!retainedIds.has(runId)) {
        registry.runs.delete(runId);
      }
    }
  }

  private getOrCreateUploadStore(chatId: string): Map<string, StoredUpload> {
    const existing = this.uploads.get(chatId);
    if (existing) {
      return existing;
    }

    const uploads = new Map<string, StoredUpload>();
    this.uploads.set(chatId, uploads);
    return uploads;
  }

  private async pruneUploads(chatUploads: Map<string, StoredUpload>, now: number): Promise<void> {
    for (const [uploadId, upload] of [...chatUploads.entries()]) {
      if (now - upload.createdAt > UPLOAD_TTL_MS) {
        await this.deleteStoredUploadFile(upload);
        chatUploads.delete(uploadId);
      }
    }

    const retained = [...chatUploads.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_STORED_UPLOADS_PER_CHAT)
      .map((upload) => upload.id);
    const retainedIds = new Set(retained);

    for (const [uploadId, upload] of [...chatUploads.entries()]) {
      if (!retainedIds.has(uploadId)) {
        await this.deleteStoredUploadFile(upload);
        chatUploads.delete(uploadId);
      }
    }
  }

  private async cleanupExpiredUploadFiles(now: number): Promise<void> {
    const uploadRoot = resolve(this.workspaceDir, TMP_UPLOAD_ROOT);
    await mkdir(uploadRoot, { recursive: true });

    for (const [chatId, chatUploads] of this.uploads.entries()) {
      await this.pruneUploads(chatUploads, now);
      if (chatUploads.size === 0) {
        this.uploads.delete(chatId);
      }
    }

    const chatDirs = await readdir(uploadRoot, { withFileTypes: true }).catch(() => []);
    for (const chatDir of chatDirs) {
      if (!chatDir.isDirectory()) {
        continue;
      }

      const absoluteChatDir = resolve(uploadRoot, chatDir.name);
      const entries = await readdir(absoluteChatDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const absoluteEntryPath = resolve(absoluteChatDir, entry.name);
        const info = await stat(absoluteEntryPath).catch(() => null);
        if (!info) {
          continue;
        }

        const ageMs = now - Math.max(info.mtimeMs, info.ctimeMs);
        if (ageMs > UPLOAD_TTL_MS) {
          await rm(absoluteEntryPath, { recursive: true, force: true }).catch(() => undefined);
        }
      }

      const remaining = await readdir(absoluteChatDir).catch(() => []);
      if (remaining.length === 0) {
        await rm(absoluteChatDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  private sanitizeUploadName(value: string): string {
    const base = basename(value || "upload")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base.length > 0 ? base : "upload";
  }

  private toPromptAttachment(upload: StoredUpload): ChatPromptAttachment {
    return {
      id: upload.id,
      name: upload.name,
      mimeType: upload.mimeType,
      size: upload.size,
      absolutePath: upload.absolutePath,
      workspacePath: upload.workspacePath,
      createdAt: new Date(upload.createdAt).toISOString(),
      expiresAt: new Date(upload.createdAt + UPLOAD_TTL_MS).toISOString(),
      isImage: Boolean(upload.image),
    };
  }

  private async deleteStoredUploadFile(upload: StoredUpload): Promise<void> {
    await rm(upload.absolutePath, { force: true }).catch(() => undefined);
  }

  private async composePromptText(
    rawMessage: string,
    context: ChatContext,
    imageCount: number,
    attachments: ChatPromptAttachment[],
  ): Promise<string> {
    let message = rawMessage.trim();
    // Normalize: merge legacy `selectedElement` into `selectedElements` array
    const selectedElements = [
      ...(context.selectedElements ?? []),
      ...(context.selectedElement && !context.selectedElements ? [context.selectedElement] : []),
    ].filter((el) => typeof el.html === "string" && el.html.trim().length > 0);
    const hasSelectedElements = selectedElements.length > 0;

    if (message.length === 0 && imageCount > 0) {
      message = imageCount === 1
        ? "Please inspect the attached image."
        : `Please inspect the attached ${imageCount} images.`;
    } else if (message.length === 0 && attachments.length > 0) {
      message = attachments.length === 1
        ? "Please inspect the attached file."
        : `Please inspect the attached ${attachments.length} files.`;
    } else if (message.length === 0 && hasSelectedElements) {
      message = selectedElements.length === 1
        ? "Please inspect the selected UI element."
        : `Please inspect the ${selectedElements.length} selected UI elements.`;
    }

    // Build context block
    const contextParts: string[] = [];

    const workspacePrefs = await readWorkspaceAppPrefs(this.workspaceDir);
    const workspaceTimeZone = workspacePrefs.timeZone ?? "America/New_York";

    // Current date/time in the workspace-selected timezone
    const workspaceTime = new Date().toLocaleString("en-US", {
      timeZone: workspaceTimeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
    contextParts.push(`<current_time>${workspaceTime}</current_time>`);
    contextParts.push(`<current_time_zone>${workspaceTimeZone}</current_time_zone>`);

    if (context.viewerPath) {
      contextParts.push(`<current_viewer>${context.viewerPath}</current_viewer>`);
    }

    if (context.location?.current) {
      const currentLocation = formatLocationSnapshot(context.location.current, "current_location");
      const recentLocations = (context.location.recent ?? [])
        .slice(0, 10)
        .map((snapshot) => formatLocationSnapshot(snapshot, "recent_location"))
        .filter((value): value is string => Boolean(value));

      if (currentLocation) {
        const locationParts = [
          "<user_location_context>",
          currentLocation,
          ...(
            recentLocations.length > 0
              ? ["<recent_locations>", ...recentLocations, "</recent_locations>"]
              : []
          ),
          "</user_location_context>",
        ];
        contextParts.push(locationParts.join("\n"));
      }
    }

    if (attachments.length > 0) {
      contextParts.push("<uploaded_files>");
      for (const attachment of attachments) {
        contextParts.push("<uploaded_file>");
        contextParts.push(`<uploaded_file_name>${attachment.name}</uploaded_file_name>`);
        contextParts.push(`<uploaded_file_mime_type>${attachment.mimeType}</uploaded_file_mime_type>`);
        contextParts.push(`<uploaded_file_size_bytes>${attachment.size}</uploaded_file_size_bytes>`);
        contextParts.push(`<uploaded_file_workspace_path>${attachment.workspacePath}</uploaded_file_workspace_path>`);
        contextParts.push(`<uploaded_file_absolute_path>${attachment.absolutePath}</uploaded_file_absolute_path>`);
        contextParts.push(`<uploaded_file_created_at>${attachment.createdAt}</uploaded_file_created_at>`);
        contextParts.push(`<uploaded_file_expires_at>${attachment.expiresAt}</uploaded_file_expires_at>`);
        contextParts.push(`<uploaded_file_is_image>${attachment.isImage ? "true" : "false"}</uploaded_file_is_image>`);
        contextParts.push("</uploaded_file>");
      }
      contextParts.push("</uploaded_files>");
    }

    for (const selectedElement of selectedElements) {
      contextParts.push("<selected_element>");
      if (selectedElement.tagName) {
        contextParts.push(
          `<selected_element_tag_name>${selectedElement.tagName}</selected_element_tag_name>`,
        );
      }
      if (selectedElement.label) {
        contextParts.push(
          `<selected_element_label>${selectedElement.label}</selected_element_label>`,
        );
      }
      if (selectedElement.textPreview) {
        contextParts.push(
          `<selected_element_text_preview>${selectedElement.textPreview}</selected_element_text_preview>`,
        );
      }
      contextParts.push(
        `<selected_element_html>\n${selectedElement.html}\n</selected_element_html>`,
      );
      contextParts.push("</selected_element>");
    }

    // Build <workspace_apps> from each app's manifest.json
    try {
      const entries = await readdir(this.workspaceDir, { withFileTypes: true });
      const manifests: Array<{ id: string; description: string }> = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = resolve(this.workspaceDir, entry.name, "manifest.json");
        try {
          const raw = await readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(raw) as { id?: string; description?: string };
          const id = manifest.id ?? entry.name;
          if (manifest.description) {
            manifests.push({ id, description: manifest.description });
          }
        } catch {
          // no manifest — skip this folder
        }
      }
      if (manifests.length > 0) {
        manifests.sort((a, b) => a.id.localeCompare(b.id));
        const header = "| App | Description |\n|---|---|";
        const rows = manifests
          .map((m) => `| **${m.id}** | ${m.description} |`)
          .join("\n");
        contextParts.push(`<workspace_apps>\n${header}\n${rows}\n</workspace_apps>`);
      }
    } catch {
      // workspace dir missing or unreadable — skip
    }

    const globalMemoryIndex = await this.loadGlobalMemoryIndex();
    if (globalMemoryIndex) {
      contextParts.push(
        `<workspace_memory_index>\n${globalMemoryIndex}\n</workspace_memory_index>`,
      );
    }

    const appMemories = await this.loadAppMemoryContext();
    for (const entry of appMemories) {
      contextParts.push(
        `<app_memory app="${entry.appName}">\n${entry.memory}\n</app_memory>`,
      );
    }

    const archivedAppsContext = formatArchivedAppsContext(workspacePrefs.archivedAppNames);
    if (archivedAppsContext.length > 0) {
      contextParts.push(`<archived_apps>\n${archivedAppsContext}\n</archived_apps>`);
    }

    if (contextParts.length > 0) {
      const contextBlock = `<additional_context>\n${contextParts.join("\n")}\n</additional_context>`;
      message = message.length > 0 ? `${message}\n\n${contextBlock}` : contextBlock;
    }

    return message;
  }

  private async loadGlobalMemoryIndex(): Promise<string> {
    try {
      const memoryPath = resolve(this.workspaceDir, GLOBAL_MEMORY_INDEX_PATH);
      return (await readFile(memoryPath, "utf-8")).trim();
    } catch {
      return "";
    }
  }

  private async loadAppMemoryContext(): Promise<AppMemoryContextEntry[]> {
    try {
      const workspaceEntries = await readdir(this.workspaceDir, { withFileTypes: true });
      const memories = await Promise.all(
        workspaceEntries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const memoryPath = resolve(this.workspaceDir, entry.name, "MEMORY.md");
            try {
              const memory = (await readFile(memoryPath, "utf-8")).trim();
              if (memory.length === 0) {
                return null;
              }

              return {
                appName: entry.name,
                memory,
              } satisfies AppMemoryContextEntry;
            } catch {
              return null;
            }
          }),
      );

      return memories
        .filter((entry): entry is AppMemoryContextEntry => entry !== null)
        .sort((a, b) => a.appName.localeCompare(b.appName));
    } catch (error) {
      captureBackendException(error, {
        tags: {
          area: "chat",
          operation: "load_app_memory_context",
        },
        extras: {
          workspaceDir: this.workspaceDir,
        },
        level: "warning",
      });
      return [];
    }
  }

  private async getOrCreateLiveChat(chatId: string): Promise<LiveChatHandle> {
    const existing = this.liveChats.get(chatId);
    if (existing) {
      return existing;
    }

    const sessionInfo = await this.findSessionInfo(chatId);
    if (!sessionInfo) {
      throw new ChatNotFoundError(chatId);
    }

    const sessionManager = SessionManager.open(sessionInfo.path, this.sessionDir);
    const systemPrompt = await buildPiSystemPrompt(this.workspaceDir, {
      publicAppUrl: backendConfig.server.publicAppUrl,
    });
    const resourceLoader = await createSystemPromptResourceLoader(
      this.workspaceDir,
      systemPrompt,
    );
    const modelSelection = await this.readChatModelSelection(sessionInfo.path);
    const { session } = await createAgentSession({
      cwd: this.workspaceDir,
      model: resolvePiModel(modelSelection),
      thinkingLevel: "high",
      sessionManager,
      customTools: CUSTOM_TOOLS,
      resourceLoader,
    });
    // Pi defaults to parallel tool execution, but the SDK does not expose this
    // through createAgentSession options yet. Keep the runtime choice explicit.
    session.agent.toolExecution = "parallel";

    const live: LiveChatHandle = {
      session,
      sessionManager,
      status: "idle",
      stopRequested: false,
      lastError: null,
      activeRunId: null,
    };

    this.liveChats.set(chatId, live);
    return live;
  }

  private loadSerializedMessagesFromSessionInfo(
    sessionInfo: Awaited<ReturnType<typeof SessionManager.list>>[number],
  ): ChatMessage[] {
    const sessionManager = SessionManager.open(sessionInfo.path, this.sessionDir);
    return serializeAgentMessages(sessionManager.buildSessionContext().messages);
  }

  private async getChatSummary(chatId: string): Promise<ChatSummary | null> {
    const sessionInfo = await this.findSessionInfo(chatId);
    if (!sessionInfo) {
      return null;
    }

    return this.toSummary(sessionInfo);
  }

  private async findSessionInfo(chatId: string): Promise<Awaited<ReturnType<typeof SessionManager.list>>[number] | null> {
    const sessions = await SessionManager.list(this.workspaceDir, this.sessionDir);
    return sessions.find((session) => session.id === chatId) ?? null;
  }

  private async toSummary(
    sessionInfo: Awaited<ReturnType<typeof SessionManager.list>>[number],
  ): Promise<ChatSummary> {
    const live = this.liveChats.get(sessionInfo.id);
    const registry = this.chatRuns.get(sessionInfo.id);
    const activeRun =
      registry?.activeRunId != null ? registry.runs.get(registry.activeRunId) ?? null : null;
    const metadata = await this.readChatMetadata(sessionInfo.path);
    const modelSelection = metadata.modelSelection ?? getDefaultChatModelSelection();
    const storedTitle = metadata.title ?? null;
    const normalizedTitle = normalizeText(
      sessionInfo.firstMessage
        .replace(/\s*<additional_context>[\s\S]*?<\/additional_context>/g, "")
        .replace(/\s*\[Currently viewing in viewer:[^\]]*\]/g, ""),
    );

    return {
      id: sessionInfo.id,
      title:
        storedTitle && storedTitle.length > 0
          ? storedTitle
          : normalizedTitle.length > 0
            ? normalizedTitle
            : "New chat",
      createdAt: sessionInfo.created.toISOString(),
      updatedAt: sessionInfo.modified.toISOString(),
      messageCount: sessionInfo.messageCount,
      status: live?.status ?? "idle",
      activeRunId: activeRun?.id ?? null,
      activeRunLastSeq: activeRun?.lastSeq ?? null,
      modelProvider: modelSelection.provider,
      modelId: modelSelection.modelId,
    };
  }

  private getChatMetadataPath(sessionPath: string): string {
    return `${sessionPath}${CHAT_METADATA_SUFFIX}`;
  }

  private async readChatMetadata(sessionPath: string): Promise<ChatMetadata> {
    try {
      const raw = await readFile(this.getChatMetadataPath(sessionPath), "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (isSupportedChatModelSelection(parsed)) {
        return { modelSelection: parsed };
      }

      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      const record = parsed as Record<string, unknown>;
      const metadata: ChatMetadata = {};
      const candidateTitle = record.title;
      if (typeof candidateTitle === "string") {
        const normalizedTitle = normalizeGeneratedTitle(candidateTitle);
        if (normalizedTitle) {
          metadata.title = normalizedTitle;
        }
      }

      const candidateModelSelection = record.modelSelection;
      if (isSupportedChatModelSelection(candidateModelSelection)) {
        metadata.modelSelection = candidateModelSelection;
      }

      return metadata;
    } catch {
      return {};
    }
  }

  private async writeChatMetadata(
    sessionPath: string | null | undefined,
    patch: ChatMetadata,
  ): Promise<void> {
    if (!sessionPath) {
      return;
    }

    const existing = await this.readChatMetadata(sessionPath);
    const next: ChatMetadata = {
      ...existing,
      ...patch,
    };

    if (!next.modelSelection && !next.title) {
      return;
    }

    await writeFile(
      this.getChatMetadataPath(sessionPath),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
  }

  private async readChatModelSelection(sessionPath: string): Promise<ChatModelSelection> {
    const metadata = await this.readChatMetadata(sessionPath);
    return metadata.modelSelection ?? (await this.getWorkspaceDefaultChatModelSelection());
  }

  private async writeChatModelSelection(
    sessionPath: string | null | undefined,
    modelSelection: ChatModelSelection,
  ): Promise<void> {
    await this.writeChatMetadata(sessionPath, { modelSelection });
  }

  private async updateChatTitle(
    chatId: string,
    sessionMessages: SessionAgentMessage[],
  ): Promise<void> {
    const sessionInfo = await this.findSessionInfo(chatId);
    if (!sessionInfo) {
      return;
    }

    const serializedMessages = serializeAgentMessages(sessionMessages);
    const transcript = buildTitleTranscript(serializedMessages);
    if (!transcript) {
      return;
    }

    try {
      const metadata = await this.readChatMetadata(sessionInfo.path);
      const currentTitle =
        metadata.title ??
        (
          normalizeText(
            sessionInfo.firstMessage
              .replace(/\s*<additional_context>[\s\S]*?<\/additional_context>/g, "")
              .replace(/\s*\[Currently viewing in viewer:[^\]]*\]/g, ""),
          ) || "New chat"
        );
      const titleModel = resolveChatTitleModel();
      const systemPrompt = [
        "You write very short, specific titles for chats.",
        "Use the entire chat history, not just the latest turn.",
        "Write a title that is 3 to 10 words.",
        "You will be given the current title.",
        "Keep the current title if it still fits the conversation.",
        "Only change the title if the topic or task has meaningfully changed.",
        "Return only the title text.",
        "Do not use quotes.",
        "Do not include prefixes like Title:.",
        "Keep it concise and concrete.",
        "Keep it under 80 characters.",
        "Prefer concrete task wording over vague summaries.",
      ].join(" ");
      const userPrompt = [
        `Current title: ${currentTitle}`,
        "",
        "If the current title still matches the conversation, return it unchanged.",
        "Only return a different title if the conversation has clearly shifted.",
        "",
        "Chat transcript:",
        transcript,
      ].join("\n");
      const response = await complete(titleModel, {
        systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
            timestamp: Date.now(),
          },
        ],
      });

      const title = normalizeGeneratedTitle(contentToText(response.content));
      if (!title) {
        return;
      }
      if (title === currentTitle) {
        return;
      }
      await this.writeChatMetadata(sessionInfo.path, { title });
      await this.emitChatUpdated(chatId, { chatId, title });
    } catch (error) {
      console.warn(
        `[chat-service] failed to generate title chat=${chatId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
