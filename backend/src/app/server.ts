import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { loadBackendEnv } from "../shared/config/env.js";
import { WORKSPACE_ROOT } from "../shared/config/paths.js";
import { captureBackendException, initializeBackendSentry } from "../shared/observability/sentry.js";
import { migrateLegacyWorkspaceAppPrefs } from "../shared/workspace/appPrefs.js";
import { PiAppAgentService } from "../modules/app-agent/appAgent.service.js";
import { PiSdkChatService } from "../modules/chat/chat.service.js";
import { createChatWebSocketServer } from "../modules/chat/chat.websocket.js";
import { createNetProxyWebSocketServer } from "../modules/workspace/net.websocket.js";
import { createApp } from "./createApp.js";

export const startServer = (): void => {
  loadBackendEnv();
  initializeBackendSentry();

  // Fire-and-forget: migrate pre-.lilo/config.json state. Errors are logged
  // inside the function and must not block startup.
  void migrateLegacyWorkspaceAppPrefs(WORKSPACE_ROOT);

  process.on("unhandledRejection", (reason) => {
    captureBackendException(reason, {
      tags: {
        area: "process",
        type: "unhandledRejection",
      },
    });
  });

  process.on("uncaughtException", (error) => {
    captureBackendException(error, {
      tags: {
        area: "process",
        type: "uncaughtException",
      },
      level: "fatal",
    });
  });

  const chatService = new PiSdkChatService();
  const appAgentService = new PiAppAgentService();
  const app = createApp({ chatService, appAgentService });
  const port = Number(process.env.PORT ?? 8787);
  const server = createServer(getRequestListener(app.fetch));
  const chatWebSocketServer = createChatWebSocketServer(chatService);
  const netProxyWebSocketServer = createNetProxyWebSocketServer();
  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);

    server.close((error) => {
      if (error) {
        captureBackendException(error, {
          tags: {
            area: "process",
            type: "shutdown",
            signal,
          },
          level: "error",
        });
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
    });

    setTimeout(() => {
      if (process.exitCode === undefined) {
        process.exitCode = 1;
      }
      process.exit();
    }, 10_000).unref();
  };

  server.on("upgrade", (request, socket, head) => {
    if (
      !chatWebSocketServer.handleUpgrade(request, socket, head) &&
      !netProxyWebSocketServer.handleUpgrade(request, socket, head)
    ) {
      socket.destroy();
    }
  });

  server.on("close", () => {
    console.log("HTTP server closed");
  });

  server.listen(port, "0.0.0.0");
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log(`Lilo backend listening on http://0.0.0.0:${port}`);
};
