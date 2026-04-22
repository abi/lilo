import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { isAuthorizedUpgrade as isAuthorizedCookieSessionUpgrade, isCookieSessionAuthEnabled } from "../../shared/auth/sessionAuth.js";
import type {
  ChatContext,
  ChatUpdatedEvent,
  ChatRunEventEnvelope,
  ChatRunSnapshot,
  PiSdkChatService,
} from "./chat.service.js";

interface SubscribeChatWebSocketCommand {
  type: "subscribe";
  runId?: string | null;
  afterSeq?: number;
}

interface PromptChatWebSocketCommand {
  type: "prompt";
  message?: string;
  context?: ChatContext;
  uploadIds?: string[];
}

interface StopChatWebSocketCommand {
  type: "stop";
  runId?: string | null;
}

interface PingChatWebSocketCommand {
  type: "ping";
}

type ChatWebSocketCommand =
  | SubscribeChatWebSocketCommand
  | PromptChatWebSocketCommand
  | StopChatWebSocketCommand
  | PingChatWebSocketCommand;

interface SubscribedChatWebSocketMessage {
  type: "subscribed";
  snapshot: ChatRunSnapshot;
}

interface RunStartedChatWebSocketMessage {
  type: "run_started";
  chatId: string;
  runId: string;
}

interface ChatEventWebSocketMessage {
  type: "chat_event";
  payload: ChatRunEventEnvelope;
}

interface ChatUpdatedWebSocketMessage {
  type: "chat_updated";
  payload: ChatUpdatedEvent;
}

interface ChatSocketErrorWebSocketMessage {
  type: "socket_error";
  message: string;
}

type ChatWebSocketMessage =
  | SubscribedChatWebSocketMessage
  | RunStartedChatWebSocketMessage
  | ChatEventWebSocketMessage
  | ChatUpdatedWebSocketMessage
  | ChatSocketErrorWebSocketMessage;

const CHAT_SOCKET_PATH = /^\/ws\/chats\/([^/]+)$/;

const isAuthorizedUpgrade = (request: IncomingMessage): boolean =>
  !isCookieSessionAuthEnabled() || isAuthorizedCookieSessionUpgrade(request);

const writeUpgradeError = (
  socket: Duplex,
  statusCode: 400 | 401 | 404,
  message: string,
): void => {
  const statusText =
    statusCode === 401 ? "Unauthorized" : statusCode === 404 ? "Not Found" : "Bad Request";
  const headers = [
    `HTTP/1.1 ${statusCode} ${statusText}`,
    "Connection: close",
    "Content-Type: text/plain; charset=utf-8",
    `Content-Length: ${Buffer.byteLength(message)}`,
  ];

  socket.write(`${headers.join("\r\n")}\r\n\r\n${message}`);
  socket.destroy();
};

const safeParseCommand = (value: string): ChatWebSocketCommand | null => {
  try {
    const parsed = JSON.parse(value) as ChatWebSocketCommand;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const sendMessage = (
  socket: { readyState: number; send: (payload: string) => void },
  message: ChatWebSocketMessage,
): void => {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify(message));
};

export const createChatWebSocketServer = (chatService: PiSdkChatService) => {
  const server = new WebSocketServer({ noServer: true });

  server.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(CHAT_SOCKET_PATH);
    const chatId = match?.[1];
    const remoteAddress = request.socket.remoteAddress ?? "unknown";

    if (!chatId) {
      console.log(`[chat-ws] connection rejected remote=${remoteAddress} reason=invalid_path`);
      socket.close(1008, "Invalid chat socket path");
      return;
    }

    console.log(`[chat-ws] connection open chat=${chatId} remote=${remoteAddress}`);

    const chatExistsPromise = chatService.hasChat(chatId);

    let unsubscribe: (() => void) | null = null;
    const chatUpdatedSubscription = chatService.subscribeToChatUpdates(chatId, (event) => {
      console.log(
        `[chat-ws] outbound chat_update chat=${chatId} title=${JSON.stringify(event.title)}`,
      );
      sendMessage(socket, {
        type: "chat_updated",
        payload: event,
      });
    });

    const resubscribe = (runId: string | null, afterSeq: number) => {
      console.log(
        `[chat-ws] subscribe chat=${chatId} run=${runId ?? "none"} afterSeq=${afterSeq}`,
      );
      unsubscribe?.();

      const subscription = chatService.subscribeToRunStream(
        chatId,
        runId,
        afterSeq,
        (event) => {
          if (
            event.event.event === "status" ||
            event.event.event === "error" ||
            event.event.event === "done"
          ) {
            console.log(
              `[chat-ws] outbound chat=${chatId} run=${event.runId} seq=${event.seq} replay=${event.replay ? "yes" : "no"} event=${event.event.event} data=${JSON.stringify(event.event.data)}`,
            );
          }
          sendMessage(socket, {
            type: "chat_event",
            payload: event,
          });
        },
      );

      unsubscribe = subscription.unsubscribe;
      console.log(
        `[chat-ws] subscribed chat=${chatId} activeRun=${subscription.snapshot.activeRunId ?? "none"} run=${subscription.snapshot.runId ?? "none"} status=${subscription.snapshot.status} replayCount=${subscription.snapshot.events.length}`,
      );
      sendMessage(socket, {
        type: "subscribed",
        snapshot: subscription.snapshot,
      });

      for (const event of subscription.snapshot.events) {
        sendMessage(socket, {
          type: "chat_event",
          payload: event,
        });
      }
    };

    socket.on("message", async (payload, isBinary) => {
      console.log(
        `[chat-ws] inbound chat=${chatId} binary=${isBinary ? "yes" : "no"} size=${Array.isArray(payload) ? payload.reduce((total, chunk) => total + chunk.byteLength, 0) : payload.byteLength}`,
      );

      if (!(await chatExistsPromise)) {
        console.log(`[chat-ws] inbound rejected missing_chat chat=${chatId}`);
        sendMessage(socket, {
          type: "socket_error",
          message: "Chat not found",
        });
        socket.close(1008, "Chat not found");
        return;
      }

      if (isBinary) {
        sendMessage(socket, {
          type: "socket_error",
          message: "Binary WebSocket messages are not supported",
        });
        return;
      }

      const command = safeParseCommand(payload.toString());
      if (!command) {
        console.log(`[chat-ws] inbound parse_failed chat=${chatId}`);
        sendMessage(socket, {
          type: "socket_error",
          message: "Invalid WebSocket payload",
        });
        return;
      }

      if (command.type === "ping") {
        console.log(`[chat-ws] ping chat=${chatId}`);
        return;
      }

      if (command.type === "subscribe") {
        console.log(
          `[chat-ws] subscribe command chat=${chatId} run=${command.runId ?? "none"} afterSeq=${command.afterSeq ?? 0}`,
        );
        resubscribe(command.runId ?? null, Math.max(0, command.afterSeq ?? 0));
        return;
      }

      if (command.type === "stop") {
        console.log(`[chat-ws] stop requested chat=${chatId} run=${command.runId ?? "none"}`);
        await chatService.stopChat(chatId);
        return;
      }

      if (command.type === "prompt") {
        console.log(
          `[chat-ws] prompt requested chat=${chatId} messageLength=${typeof command.message === "string" ? command.message.length : 0}`,
        );
        try {
          const resolvedUploads = await chatService.resolveUploads(
            chatId,
            Array.isArray(command.uploadIds) ? command.uploadIds : [],
          );
          await chatService.promptChat(
            chatId,
            {
              message: typeof command.message === "string" ? command.message : "",
              images: resolvedUploads.images,
              attachments: resolvedUploads.attachments,
              context: command.context ?? {},
            },
            undefined,
            (runId) => {
              console.log(`[chat-ws] run started chat=${chatId} run=${runId}`);
              sendMessage(socket, {
                type: "run_started",
                chatId,
                runId,
              });
            },
          );
        } catch (error) {
          console.log(
            `[chat-ws] prompt failed chat=${chatId} error=${error instanceof Error ? error.message : String(error)}`,
          );
          sendMessage(socket, {
            type: "socket_error",
            message:
              error instanceof Error
                ? error.message
                : "Unknown Pi SDK streaming failure",
          });
        }
      }
    });

    socket.on("close", () => {
      console.log(`[chat-ws] connection close chat=${chatId}`);
      unsubscribe?.();
      unsubscribe = null;
      chatUpdatedSubscription.unsubscribe();
    });

    socket.on("error", () => {
      console.log(`[chat-ws] connection error chat=${chatId}`);
      unsubscribe?.();
      unsubscribe = null;
      chatUpdatedSubscription.unsubscribe();
    });

    if (!(await chatExistsPromise)) {
      console.log(`[chat-ws] chat missing chat=${chatId}`);
      sendMessage(socket, {
        type: "socket_error",
        message: "Chat not found",
      });
      socket.close(1008, "Chat not found");
      return;
    }
  });

  return {
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ): boolean {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!CHAT_SOCKET_PATH.test(url.pathname)) {
        return false;
      }

      console.log(
        `[chat-ws] upgrade requested path=${url.pathname} remote=${request.socket.remoteAddress ?? "unknown"}`,
      );

      if (!isAuthorizedUpgrade(request)) {
        console.log(`[chat-ws] upgrade unauthorized path=${url.pathname}`);
        writeUpgradeError(socket, 401, "Unauthorized");
        return true;
      }

      server.handleUpgrade(request, socket, head, (ws) => {
        console.log(`[chat-ws] upgrade accepted path=${url.pathname}`);
        server.emit("connection", ws, request);
      });

      return true;
    },
  };
};
