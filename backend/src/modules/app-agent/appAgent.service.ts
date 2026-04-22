import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentSessionEvent, SessionContext } from "@mariozechner/pi-coding-agent";
import {
  SessionManager,
  createAgentSession,
  createCodingTools,
} from "@mariozechner/pi-coding-agent";
import {
  WORKSPACE_ROOT,
} from "../../shared/config/paths.js";
import { resolveSessionSubdir } from "../../shared/config/sessions.js";
import { buildPiAppAgentPrompt } from "../../shared/prompts/piAppAgentPrompt.js";
import {
  getPromptFirstEventTimeoutMs,
  getPromptTimeoutMs,
  resolvePiModel,
} from "../../shared/pi/runtime.js";
import { createSystemPromptResourceLoader } from "../../shared/pi/resourceLoader.js";
import {
  getLatestAssistantMessage,
  reportPiUpstreamError,
} from "../../shared/pi/errorReporting.js";
import { ensureDir, persistSessionManager } from "../../shared/session/sessionStore.js";
import { createStreamingTimeouts } from "../../shared/session/timeouts.js";
import { CUSTOM_TOOLS } from "../../shared/tools/index.js";
import {
  OPEN_APP_TOOL_NAME,
  isOpenAppDetails,
} from "../../shared/tools/openAppTool.js";
import { isWorkspaceAppNameSync } from "../../shared/workspace/apps.js";

type SessionAgentMessage = SessionContext["messages"][number];

export interface AppAgentMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result" | "system";
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: string;
  toolDetails?: unknown;
  isError?: boolean;
  viewerPath?: string;
  appName?: string;
}

export interface AppAgentSessionSummary {
  id: string;
  appName: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: "idle" | "streaming" | "error";
}

export interface AppAgentSessionDetail extends AppAgentSessionSummary {
  messages: AppAgentMessage[];
}

export interface AppAgentCreateSessionInput {
  title?: string;
  systemPrompt?: string;
}

export interface AppAgentPromptInput {
  message?: string;
  systemPrompt?: string;
}

export interface AppAgentSseEvent {
  event: "status" | "text_delta" | "tool_call" | "tool_result" | "error" | "done";
  data: Record<string, unknown>;
}

interface AppAgentSessionMetadata {
  appName: string;
  title: string;
  defaultSystemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

interface LiveAppSessionHandle {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"];
  sessionManager: SessionManager;
  status: "idle" | "streaming" | "error";
  stopRequested: boolean;
  lastError: string | null;
}

const MAX_MESSAGE_LENGTH = 32 * 1024;

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const contentToText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        if (!entry || typeof entry !== "object" || !("type" in entry)) {
          return JSON.stringify(entry, null, 2);
        }

        if (entry.type === "text") {
          return String((entry as { text?: string }).text ?? "");
        }

        if (entry.type === "thinking") {
          return String((entry as { thinking?: string }).thinking ?? "");
        }

        if (entry.type === "toolCall") {
          return JSON.stringify((entry as { arguments?: unknown }).arguments ?? {}, null, 2);
        }

        if (entry.type === "image") {
          return "[Image attachment]";
        }

        return JSON.stringify(entry, null, 2);
      })
      .filter((part) => part.length > 0)
      .join("\n");
  }

  if (
    value &&
    typeof value === "object" &&
    "content" in value &&
    Array.isArray((value as { content?: unknown[] }).content)
  ) {
    return contentToText((value as { content: unknown[] }).content);
  }

  if (
    value &&
    typeof value === "object" &&
    "details" in value &&
    (value as { details?: unknown }).details !== undefined
  ) {
    return JSON.stringify((value as { details: unknown }).details, null, 2);
  }

  return value == null ? "" : JSON.stringify(value, null, 2);
};

const serializeAgentMessages = (messages: SessionAgentMessage[]): AppAgentMessage[] => {
  const serialized: AppAgentMessage[] = [];

  const pushMessage = (
    role: AppAgentMessage["role"],
    content: string,
    timestamp: number,
    extra: Partial<AppAgentMessage> = {},
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
      pushMessage("user", contentToText(message.content), message.timestamp);
      continue;
    }

    if (message.role === "assistant") {
      let assistantBuffer = "";

      const flushAssistant = () => {
        if (assistantBuffer.trim().length > 0) {
          pushMessage("assistant", assistantBuffer, message.timestamp);
        }
        assistantBuffer = "";
      };

      for (const block of message.content) {
        if (block.type === "text") {
          assistantBuffer += block.text;
          continue;
        }

        if (block.type === "toolCall") {
          flushAssistant();
          pushMessage("tool_call", block.name, message.timestamp, {
            toolName: block.name,
            toolInput: JSON.stringify(block.arguments ?? {}, null, 2),
          });
        }
      }

      flushAssistant();
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
      if (message.display === false) {
        continue;
      }
      pushMessage("system", contentToText(message.content), message.timestamp);
    }
  }

  return serialized;
};

const mapSessionEventToSse = (
  event: AgentSessionEvent,
  appendFinalText: (delta: string) => void,
): AppAgentSseEvent[] => {
  const mapped: AppAgentSseEvent[] = [];

  if (event.type === "agent_start") {
    mapped.push({
      event: "status",
      data: { state: "working", phase: "agent_start" },
    });
  }

  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    appendFinalText(event.assistantMessageEvent.delta);
    mapped.push({
      event: "text_delta",
      data: { delta: event.assistantMessageEvent.delta },
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

  return mapped;
};

export class PiAppAgentService {
  private readonly workspaceDir = WORKSPACE_ROOT;

  private readonly sessionRootDir = ensureDir(resolveSessionSubdir("apps"));

  private readonly liveSessions = new Map<string, LiveAppSessionHandle>();

  private readonly model = resolvePiModel();

  async createSession(
    appName: string,
    input: AppAgentCreateSessionInput = {},
  ): Promise<{ sessionId: string; appName: string; createdAt: string }> {
    this.assertValidAppName(appName);
    this.validateInput("", true);

    const sessionDir = this.resolveAppSessionDir(appName);
    const sessionManager = SessionManager.create(this.workspaceDir, sessionDir);
    await persistSessionManager(sessionManager);

    const createdAt = new Date().toISOString();
    await this.writeMetadata(appName, sessionManager.getSessionId(), {
      appName,
      title: normalizeText(input.title ?? "") || "New session",
      defaultSystemPrompt: (input.systemPrompt ?? "").trim(),
      createdAt,
      updatedAt: createdAt,
    });

    return { sessionId: sessionManager.getSessionId(), appName, createdAt };
  }

  async listSessions(appName: string): Promise<AppAgentSessionSummary[]> {
    this.assertValidAppName(appName);
    const sessions = await SessionManager.list(this.workspaceDir, this.resolveAppSessionDir(appName));
    const summaries = await Promise.all(sessions.map((session) => this.toSummary(appName, session)));
    return summaries.sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }

  async getSession(appName: string, sessionId: string): Promise<AppAgentSessionDetail | null> {
    this.assertValidAppName(appName);
    const sessionInfo = await this.findSessionInfo(appName, sessionId);
    if (!sessionInfo) {
      return null;
    }

    const live = this.liveSessions.get(this.liveKey(appName, sessionId));
    const messages = live
      ? serializeAgentMessages(live.session.messages)
      : await this.loadSerializedMessages(appName, sessionId);

    return {
      ...(await this.toSummary(appName, sessionInfo)),
      messages,
    };
  }

  async stopSession(appName: string, sessionId: string): Promise<void> {
    this.assertValidAppName(appName);
    const live = this.liveSessions.get(this.liveKey(appName, sessionId));
    if (!live || !live.session.isStreaming) {
      return;
    }

    live.stopRequested = true;
    await live.session.abort();
  }

  async promptSession(
    appName: string,
    sessionId: string,
    input: AppAgentPromptInput,
    onEvent: (event: AppAgentSseEvent) => void | Promise<void>,
  ): Promise<void> {
    this.assertValidAppName(appName);

    const live = await this.getOrCreateLiveSession(appName, sessionId);
    if (live.session.isStreaming || live.status === "streaming") {
      throw new Error(`Session "${sessionId}" is already processing a prompt`);
    }

    const message = (input.message ?? "").trim();
    const systemPrompt = (input.systemPrompt ?? "").trim();
    this.validateInput(message, false);

    live.status = "streaming";
    live.stopRequested = false;
    live.lastError = null;

    const runId = randomUUID();
    const startedAt = Date.now();
    const promptTimeoutMs = getPromptTimeoutMs();
    const promptFirstEventTimeoutMs = getPromptFirstEventTimeoutMs();
    let finalText = "";

    console.log(
      `[app-agent] start app=${appName} session=${sessionId} run=${runId} messageLength=${message.length} systemPromptLength=${systemPrompt.length}`,
    );

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
      const mapped = mapSessionEventToSse(event, (delta) => {
        finalText += delta;
      });

      if (event.type === "tool_execution_start") {
        console.log(
          `[app-agent] tool_start app=${appName} session=${sessionId} run=${runId} tool=${event.toolName}`,
        );
      }

      if (event.type === "tool_execution_end") {
        console.log(
          `[app-agent] tool_end app=${appName} session=${sessionId} run=${runId} tool=${event.toolName} error=${event.isError ? "yes" : "no"}`,
        );
      }

      for (const item of mapped) {
        void onEvent(item);
      }
    });

    try {
      await onEvent({
        event: "status",
        data: {
          state: "working",
          phase: "request_accepted",
          appName,
          sessionId,
          runId,
        },
      });

      await live.session.prompt(
        this.composePromptText(
          systemPrompt,
          message,
        ),
      );
      const latestAssistantMessage = getLatestAssistantMessage(live.session.messages);
      if (
        latestAssistantMessage?.stopReason === "error" ||
        (typeof latestAssistantMessage?.errorMessage === "string" &&
          latestAssistantMessage.errorMessage.trim().length > 0)
      ) {
        reportPiUpstreamError({
          area: "app_agent_run",
          error:
            latestAssistantMessage?.errorMessage ??
            "Pi app-agent prompt resolved with an upstream provider error",
          latestAssistantMessage,
          tags: {
            appName,
            sessionId,
            runId,
            timeout: "none",
            runStatus: "resolved_with_error",
          },
          extras: {
            finalTextLength: finalText.length,
            liveLastError: live.lastError,
            messageLength: message.length,
            systemPromptLength: systemPrompt.length,
            allowEmptyMessage: false,
            promptResolved: true,
          },
          fingerprint: ["app-agent-run", appName, sessionId, latestAssistantMessage?.stopReason ?? "unknown"],
        });
      }

      live.status = "idle";
      await onEvent({
        event: "done",
        data: {
          reason: "completed",
          finalText,
          appName,
          sessionId,
          runId,
        },
      });
      console.log(
        `[app-agent] done app=${appName} session=${sessionId} run=${runId} reason=completed durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      if (live.stopRequested) {
        live.status = "idle";
        await onEvent({
          event: "done",
          data: {
            reason: "aborted",
            finalText,
            appName,
            sessionId,
            runId,
          },
        });
        console.log(
          `[app-agent] done app=${appName} session=${sessionId} run=${runId} reason=aborted durationMs=${Date.now() - startedAt}`,
        );
        return;
      }

      const messageText = timeouts.getState().firstEventTimedOut
        ? `Pi SDK did not emit any events within ${promptFirstEventTimeoutMs}ms`
        : timeouts.getState().promptTimedOut
          ? `Timed out waiting for Pi SDK to finish the prompt after ${promptTimeoutMs}ms`
          : error instanceof Error
            ? error.message
            : "Unknown Pi SDK prompt failure";
      const latestAssistantMessage = getLatestAssistantMessage(live.session.messages);

      live.status = "error";
      live.lastError = messageText;
      console.log(
        `[app-agent] done app=${appName} session=${sessionId} run=${runId} reason=error durationMs=${Date.now() - startedAt} error=${JSON.stringify(messageText)}`,
      );
      reportPiUpstreamError({
        area: "app_agent_run",
        error,
        latestAssistantMessage,
        tags: {
          appName,
          sessionId,
          runId,
          timeout: timeouts.getState().firstEventTimedOut
            ? "first_event"
            : timeouts.getState().promptTimedOut
              ? "prompt"
              : "none",
          runStatus: "error",
        },
        extras: {
          finalTextLength: finalText.length,
          liveLastError: live.lastError,
          messageLength: message.length,
          systemPromptLength: systemPrompt.length,
          allowEmptyMessage: false,
        },
        fingerprint: ["app-agent-run", appName, sessionId],
      });
      throw new Error(messageText);
    } finally {
      timeouts.clear();
      live.stopRequested = false;
      unsubscribe();

      await this.touchMetadata(appName, sessionId);
      await persistSessionManager(live.sessionManager);
    }
  }

  private composePromptText(
    requestSystemPrompt: string,
    message: string,
  ): string {
    const parts: string[] = [];

    if (requestSystemPrompt.length > 0) {
      parts.push(`[App request instructions]\n${requestSystemPrompt}`);
    }

    parts.push(message);
    return parts.join("\n\n");
  }

  private buildSystemPrompt(appName: string, defaultSystemPrompt: string): string {
    const parts = [
      buildPiAppAgentPrompt(appName),
      `[App context]\n- appName: ${appName}\n- workspaceRoot: ${this.workspaceDir}\n- scope: shared workspace`,
    ];

    if (defaultSystemPrompt.length > 0) {
      parts.push(`[App session instructions]\n${defaultSystemPrompt}`);
    }

    return parts.join("\n\n");
  }

  private validateInput(message: string, allowEmptyMessage: boolean): void {
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`message exceeds ${MAX_MESSAGE_LENGTH} characters`);
    }

    if (!allowEmptyMessage && message.length === 0) {
      throw new Error("message is required");
    }
  }

  private async getOrCreateLiveSession(
    appName: string,
    sessionId: string,
  ): Promise<LiveAppSessionHandle> {
    const key = this.liveKey(appName, sessionId);
    const existing = this.liveSessions.get(key);
    if (existing) {
      return existing;
    }

    const sessionInfo = await this.findSessionInfo(appName, sessionId);
    if (!sessionInfo) {
      throw new Error(`Session "${sessionId}" was not found`);
    }

    const metadata = await this.readMetadata(appName, sessionId);
    const sessionManager = SessionManager.open(sessionInfo.path, this.resolveAppSessionDir(appName));
    const resourceLoader = await createSystemPromptResourceLoader(
      this.workspaceDir,
      this.buildSystemPrompt(appName, metadata?.defaultSystemPrompt ?? ""),
    );
    const { session } = await createAgentSession({
      cwd: this.workspaceDir,
      model: this.model,
      thinkingLevel: "high",
      sessionManager,
      tools: createCodingTools(this.workspaceDir),
      customTools: CUSTOM_TOOLS,
      resourceLoader,
    });

    const live: LiveAppSessionHandle = {
      session,
      sessionManager,
      status: "idle",
      stopRequested: false,
      lastError: null,
    };

    this.liveSessions.set(key, live);
    return live;
  }

  private async loadSerializedMessages(
    appName: string,
    sessionId: string,
  ): Promise<AppAgentMessage[]> {
    const sessionInfo = await this.findSessionInfo(appName, sessionId);
    if (!sessionInfo) {
      throw new Error(`Session "${sessionId}" was not found`);
    }

    const sessionManager = SessionManager.open(sessionInfo.path, this.resolveAppSessionDir(appName));
    return serializeAgentMessages(sessionManager.buildSessionContext().messages);
  }

  private async findSessionInfo(
    appName: string,
    sessionId: string,
  ): Promise<Awaited<ReturnType<typeof SessionManager.list>>[number] | null> {
    const sessions = await SessionManager.list(this.workspaceDir, this.resolveAppSessionDir(appName));
    return sessions.find((session) => session.id === sessionId) ?? null;
  }

  private async toSummary(
    appName: string,
    sessionInfo: Awaited<ReturnType<typeof SessionManager.list>>[number],
  ): Promise<AppAgentSessionSummary> {
    const live = this.liveSessions.get(this.liveKey(appName, sessionInfo.id));
    const metadata = await this.readMetadata(appName, sessionInfo.id);
    const normalizedTitle = normalizeText(sessionInfo.firstMessage);

    return {
      id: sessionInfo.id,
      appName,
      title: normalizedTitle || metadata?.title || "New session",
      createdAt: metadata?.createdAt ?? sessionInfo.created.toISOString(),
      updatedAt: metadata?.updatedAt ?? sessionInfo.modified.toISOString(),
      status: live?.status ?? "idle",
    };
  }

  private resolveAppSessionDir(appName: string): string {
    return ensureDir(resolve(this.sessionRootDir, appName));
  }

  private metadataPath(appName: string, sessionId: string): string {
    return resolve(this.resolveAppSessionDir(appName), `${sessionId}.meta.json`);
  }

  private liveKey(appName: string, sessionId: string): string {
    return `${appName}:${sessionId}`;
  }

  private assertValidAppName(appName: string): void {
    if (!isWorkspaceAppNameSync(appName)) {
      throw new Error(`Workspace app "${appName}" was not found`);
    }
  }

  private async writeMetadata(
    appName: string,
    sessionId: string,
    metadata: AppAgentSessionMetadata,
  ): Promise<void> {
    await writeFile(this.metadataPath(appName, sessionId), JSON.stringify(metadata, null, 2), "utf8");
  }

  private async readMetadata(
    appName: string,
    sessionId: string,
  ): Promise<AppAgentSessionMetadata | null> {
    try {
      const content = await readFile(this.metadataPath(appName, sessionId), "utf8");
      return JSON.parse(content) as AppAgentSessionMetadata;
    } catch {
      return null;
    }
  }

  private async touchMetadata(appName: string, sessionId: string): Promise<void> {
    const metadata = await this.readMetadata(appName, sessionId);
    if (!metadata) {
      return;
    }

    metadata.updatedAt = new Date().toISOString();
    await this.writeMetadata(appName, sessionId, metadata);
  }
}
