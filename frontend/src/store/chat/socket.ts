import { config } from "../../config/config";
import type { ChatContextInput, ParsedSseEvent } from "./types";

type ConnectionPhase = "connecting" | "open" | "closed";

interface SubscribeChatSocketCommand {
  type: "subscribe";
  runId?: string | null;
  afterSeq?: number;
}

interface PromptChatSocketCommand {
  type: "prompt";
  message: string;
  context?: ChatContextInput;
  uploadIds?: string[];
}

interface StopChatSocketCommand {
  type: "stop";
  runId?: string | null;
}

type ChatSocketCommand =
  | SubscribeChatSocketCommand
  | PromptChatSocketCommand
  | StopChatSocketCommand;

interface ChatSocketMessageSubscribed {
  type: "subscribed";
  snapshot: {
    chatId: string;
    activeRunId: string | null;
    runId: string | null;
    status: "streaming" | "completed" | "aborted" | "error" | "idle";
    lastSeq: number;
  };
}

interface ChatSocketMessageRunStarted {
  type: "run_started";
  chatId: string;
  runId: string;
}

interface ChatSocketMessageEvent {
  type: "chat_event";
  payload: {
    chatId: string;
    runId: string;
    seq: number;
    status: "streaming" | "completed" | "aborted" | "error";
    replay?: boolean;
    event: {
      event: string;
      data: unknown;
    };
  };
}

interface ChatSocketMessageUpdated {
  type: "chat_updated";
  payload: {
    chatId: string;
    title: string;
  };
}

interface ChatSocketMessageError {
  type: "socket_error";
  message: string;
}

type ChatSocketMessage =
  | ChatSocketMessageSubscribed
  | ChatSocketMessageRunStarted
  | ChatSocketMessageEvent
  | ChatSocketMessageUpdated
  | ChatSocketMessageError;

interface PendingRunStart {
  resolve: (runId: string) => void;
  reject: (error: Error) => void;
}

interface ChatSocketListener {
  onEvent?: (event: ParsedSseEvent) => void;
  onChatUpdated?: (update: ChatSocketMessageUpdated["payload"]) => void;
  onReconnect?: () => void;
  onConnectionChange?: (state: ConnectionPhase) => void;
}

const controllers = new Map<string, ChatSocketController>();

const buildChatSocketUrl = (chatId: string): string => {
  const apiBaseUrl = config.apiBaseUrl.trim();

  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    const url = new URL(apiBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `/ws/chats/${chatId}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/chats/${chatId}`;
};

const normalizeEvent = (message: ChatSocketMessageEvent["payload"]["event"]): ParsedSseEvent => ({
  event: message.event,
  data: typeof message.data === "string" ? message.data : JSON.stringify(message.data ?? {}),
});

class ChatSocketController {
  private socket: WebSocket | null = null;

  private connectPromise: Promise<void> | null = null;

  private reconnectTimer: number | null = null;

  private listeners = new Set<ChatSocketListener>();

  private runKeepAlive = false;

  private watchKeepAlive = false;

  private hasConnected = false;

  private currentRunId: string | null = null;

  private lastSeqByRun = new Map<string, number>();

  private pendingRunStart: PendingRunStart | null = null;

  constructor(private readonly chatId: string) {}

  addListener(listener: ChatSocketListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && !this.shouldKeepAlive()) {
        this.dispose();
      }
    };
  }

  async startRun(
    message: string,
    context?: ChatContextInput,
    uploadIds?: string[],
  ): Promise<string> {
    this.runKeepAlive = true;
    await this.ensureConnected();

    if (this.pendingRunStart) {
      throw new Error("A chat run is already waiting to start");
    }

    const runIdPromise = new Promise<string>((resolve, reject) => {
      this.pendingRunStart = { resolve, reject };
    });

    try {
      this.send({
        type: "prompt",
        message,
        context,
        uploadIds,
      });
    } catch (error) {
      this.pendingRunStart = null;
      throw error;
    }

    return runIdPromise;
  }

  async stopRun(): Promise<void> {
    await this.ensureConnected();
    this.send({
      type: "stop",
      runId: this.currentRunId,
    });
  }

  async resumeRun(runId: string, afterSeq: number): Promise<void> {
    this.runKeepAlive = true;
    this.currentRunId = runId;
    this.lastSeqByRun.set(runId, afterSeq);
    await this.ensureConnected();
    this.send({
      type: "subscribe",
      runId,
      afterSeq,
    });
  }

  async watchChat(): Promise<void> {
    this.watchKeepAlive = true;
    await this.ensureConnected();
  }

  unwatchChat(): void {
    this.watchKeepAlive = false;
    if (this.listeners.size === 0 && !this.shouldKeepAlive()) {
      this.dispose();
    }
  }

  async ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.emitConnectionChange("connecting");

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(buildChatSocketUrl(this.chatId));
      let settled = false;

      socket.addEventListener("open", () => {
        this.socket = socket;
        this.connectPromise = null;
        this.clearReconnectTimer();
        this.emitConnectionChange("open");

        const shouldNotifyReconnect = this.hasConnected;
        this.hasConnected = true;
        if (shouldNotifyReconnect) {
          for (const listener of this.listeners) {
            listener.onReconnect?.();
          }
        }

        this.send({
          type: "subscribe",
          runId: this.currentRunId,
          afterSeq:
            this.currentRunId !== null ? this.lastSeqByRun.get(this.currentRunId) ?? 0 : 0,
        });

        settled = true;
        resolve();
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        try {
          const message = JSON.parse(event.data) as ChatSocketMessage;
          this.handleMessage(message);
        } catch {
          // Ignore malformed socket frames.
        }
      });

      socket.addEventListener("close", () => {
        if (this.socket === socket) {
          this.socket = null;
        }

        this.connectPromise = null;
        this.emitConnectionChange("closed");

        if (!settled) {
          settled = true;
          reject(new Error("Chat socket closed before it connected"));
        }

        if (this.shouldKeepAlive()) {
          this.scheduleReconnect();
        }
      });

      socket.addEventListener("error", () => {
        if (!settled) {
          settled = true;
          reject(new Error("Chat socket failed to connect"));
        }
      });
    });

    return this.connectPromise;
  }

  close(): void {
    this.runKeepAlive = false;
    this.watchKeepAlive = false;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
    this.connectPromise = null;
    this.emitConnectionChange("closed");
  }

  private handleMessage(message: ChatSocketMessage): void {
    if (message.type === "socket_error") {
      if (this.pendingRunStart) {
        this.pendingRunStart.reject(new Error(message.message));
        this.pendingRunStart = null;
      }
      return;
    }

    if (message.type === "subscribed") {
      const snapshotRunId = message.snapshot.activeRunId ?? message.snapshot.runId;
      if (snapshotRunId) {
        this.currentRunId = snapshotRunId;

        if (this.pendingRunStart) {
          this.pendingRunStart.resolve(snapshotRunId);
          this.pendingRunStart = null;
        }
      }
      return;
    }

    if (message.type === "run_started") {
      this.currentRunId = message.runId;
      this.lastSeqByRun.set(message.runId, this.lastSeqByRun.get(message.runId) ?? 0);
      if (this.pendingRunStart) {
        this.pendingRunStart.resolve(message.runId);
        this.pendingRunStart = null;
      }
      return;
    }

    if (message.type === "chat_updated") {
      for (const listener of this.listeners) {
        listener.onChatUpdated?.(message.payload);
      }
      return;
    }

    const lastSeq = this.lastSeqByRun.get(message.payload.runId) ?? 0;
    if (message.payload.seq <= lastSeq) {
      return;
    }

    this.currentRunId = message.payload.runId;
    this.lastSeqByRun.set(message.payload.runId, message.payload.seq);

    const normalized = normalizeEvent(message.payload.event);
    for (const listener of this.listeners) {
      listener.onEvent?.(normalized);
    }

    if (normalized.event === "done") {
      this.runKeepAlive = false;
    }
  }

  private send(command: ChatSocketCommand): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Chat socket is not connected");
    }

    this.socket.send(JSON.stringify(command));
  }

  private scheduleReconnect(): void {
    if (!this.shouldKeepAlive() || this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected().catch(() => {
        this.scheduleReconnect();
      });
    }, 1000);
  }

  private shouldKeepAlive(): boolean {
    return this.runKeepAlive || this.watchKeepAlive;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private emitConnectionChange(state: ConnectionPhase): void {
    for (const listener of this.listeners) {
      listener.onConnectionChange?.(state);
    }
  }

  private dispose(): void {
    this.close();
    controllers.delete(this.chatId);
  }
}

const getChatSocketController = (chatId: string): ChatSocketController => {
  const existing = controllers.get(chatId);
  if (existing) {
    return existing;
  }

  const controller = new ChatSocketController(chatId);
  controllers.set(chatId, controller);
  return controller;
};

export { getChatSocketController };
