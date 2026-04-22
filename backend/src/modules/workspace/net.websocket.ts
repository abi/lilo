import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  isAuthorizedUpgrade as isAuthorizedCookieSessionUpgrade,
  isCookieSessionAuthEnabled,
} from "../../shared/auth/sessionAuth.js";
import { isWorkspaceAppNameSync } from "../../shared/workspace/apps.js";

type BrowserToBackendMessage =
  | {
      type: "connect";
      appName?: string;
      url?: string;
      protocols?: unknown;
    }
  | {
      type: "send";
      data?:
        | { kind: "text"; text: string }
        | { kind: "base64"; base64: string };
    }
  | {
      type: "close";
      code?: number;
      reason?: string;
    }
  | {
      type: "ping";
    };

type BackendToBrowserMessage =
  | { type: "open"; protocol: string }
  | {
      type: "message";
      data:
        | { kind: "text"; text: string }
        | { kind: "base64"; base64: string };
    }
  | { type: "error"; message: string }
  | { type: "close"; code: number; reason: string; wasClean: boolean };

const NET_SOCKET_PATH = /^\/ws\/net$/;

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

const safeParseCommand = (value: string): BrowserToBackendMessage | null => {
  try {
    const parsed = JSON.parse(value) as BrowserToBackendMessage;
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
  message: BackendToBrowserMessage,
): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
};

const isSupportedWebSocketUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "ws:" || url.protocol === "wss:";
  } catch {
    return false;
  }
};

const normalizeProtocols = (value: unknown): string[] | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }
  if (Array.isArray(value)) {
    const protocols = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    return protocols.length > 0 ? protocols : undefined;
  }
  return undefined;
};

const toBuffer = (value: Buffer | ArrayBuffer): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from(new Uint8Array(value));

export const createNetProxyWebSocketServer = () => {
  const server = new WebSocketServer({ noServer: true });

  server.on("connection", (socket, request) => {
    const remoteAddress = request.socket.remoteAddress ?? "unknown";
    console.log(`[net-ws] connection open remote=${remoteAddress}`);

    let upstream: WebSocket | null = null;
    let connected = false;
    let connectTimer: NodeJS.Timeout | null = setTimeout(() => {
      connectTimer = null;
      sendMessage(socket, {
        type: "error",
        message: "Timed out waiting for websocket connect request",
      });
      socket.close(1008, "Timed out waiting for connect");
    }, 5000);
    connectTimer.unref();

    const cleanup = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.close(1000, "Client closed");
      }
      upstream = null;
    };

    socket.on("message", (payload, isBinary) => {
      if (isBinary) {
        sendMessage(socket, { type: "error", message: "Binary websocket control frames are not supported" });
        return;
      }

      const command = safeParseCommand(payload.toString());
      if (!command) {
        sendMessage(socket, { type: "error", message: "Invalid websocket proxy payload" });
        return;
      }

      if (command.type === "ping") {
        return;
      }

      if (command.type === "connect") {
        if (connected || upstream) {
          sendMessage(socket, { type: "error", message: "Socket is already connected" });
          return;
        }

        const appName = typeof command.appName === "string" ? command.appName : "";
        const url = typeof command.url === "string" ? command.url.trim() : "";
        if (!isWorkspaceAppNameSync(appName)) {
          sendMessage(socket, { type: "error", message: "Workspace app not found" });
          socket.close(1008, "Workspace app not found");
          return;
        }

        if (!isSupportedWebSocketUrl(url)) {
          sendMessage(socket, { type: "error", message: "Only ws and wss URLs are supported" });
          socket.close(1008, "Unsupported websocket URL");
          return;
        }

        const protocols = normalizeProtocols(command.protocols);
        console.log(
          `[net-ws] connect requested app=${appName} remote=${remoteAddress} url=${url} protocols=${protocols?.join(",") ?? "none"}`,
        );

        try {
          upstream = new WebSocket(url, protocols);
        } catch (error) {
          sendMessage(socket, {
            type: "error",
            message: error instanceof Error ? error.message : "Failed to create upstream websocket",
          });
          socket.close(1011, "Failed to create upstream websocket");
          return;
        }

        upstream.on("open", () => {
          connected = true;
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          console.log(`[net-ws] upstream open remote=${remoteAddress} url=${url}`);
          sendMessage(socket, {
            type: "open",
            protocol: upstream?.protocol ?? "",
          });
        });

        upstream.on("message", (data, isUpstreamBinary) => {
          if (isUpstreamBinary) {
            const binary = Array.isArray(data)
              ? Buffer.concat(data.map((chunk) => toBuffer(chunk)))
              : toBuffer(data as Buffer | ArrayBuffer);
            sendMessage(socket, {
              type: "message",
              data: { kind: "base64", base64: binary.toString("base64") },
            });
            return;
          }

          const text = Array.isArray(data)
            ? Buffer.concat(data.map((chunk) => toBuffer(chunk))).toString("utf8")
            : toBuffer(data as Buffer | ArrayBuffer).toString("utf8");
          sendMessage(socket, {
            type: "message",
            data: { kind: "text", text },
          });
        });

        upstream.on("error", (error) => {
          console.log(`[net-ws] upstream error remote=${remoteAddress} message=${error.message}`);
          sendMessage(socket, { type: "error", message: error.message });
        });

        upstream.on("close", (code, reason) => {
          const reasonText = Buffer.from(reason).toString("utf8");
          console.log(`[net-ws] upstream close remote=${remoteAddress} code=${code} reason=${reasonText}`);
          sendMessage(socket, {
            type: "close",
            code,
            reason: reasonText,
            wasClean: true,
          });
          socket.close(1000, "Upstream closed");
        });
        return;
      }

      if (!upstream) {
        sendMessage(socket, { type: "error", message: "Socket is not connected yet" });
        return;
      }

      if (command.type === "send") {
        if (upstream.readyState !== WebSocket.OPEN) {
          sendMessage(socket, { type: "error", message: "Upstream websocket is not open" });
          return;
        }

        if (command.data?.kind === "text") {
          upstream.send(command.data.text);
          return;
        }

        if (command.data?.kind === "base64") {
          upstream.send(Buffer.from(command.data.base64, "base64"));
          return;
        }

        sendMessage(socket, { type: "error", message: "Unsupported websocket payload" });
        return;
      }

      if (command.type === "close") {
        const code = typeof command.code === "number" ? command.code : 1000;
        const reason = typeof command.reason === "string" ? command.reason : "";
        upstream.close(code, reason);
      }
    });

    socket.on("close", () => {
      console.log(`[net-ws] connection close remote=${remoteAddress}`);
      cleanup();
    });

    socket.on("error", (error) => {
      console.log(`[net-ws] connection error remote=${remoteAddress} message=${error.message}`);
      cleanup();
    });
  });

  return {
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (!NET_SOCKET_PATH.test(url.pathname)) {
        return false;
      }

      if (!isAuthorizedUpgrade(request)) {
        writeUpgradeError(socket, 401, "Unauthorized");
        return true;
      }

      server.handleUpgrade(request, socket, head, (upgradedSocket) => {
        server.emit("connection", upgradedSocket, request);
      });
      return true;
    },
  };
};
