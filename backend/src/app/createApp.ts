import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerAppAgentRoutes } from "../modules/app-agent/appAgent.routes.js";
import { PiAppAgentService } from "../modules/app-agent/appAgent.service.js";
import { registerAutomationRoutes } from "../modules/automations/automation.routes.js";
import { registerAutomationService } from "../modules/automations/automation.registry.js";
import { AutomationService } from "../modules/automations/automation.service.js";
import { registerChannelStatusRoutes } from "../modules/channels/channelStatus.routes.js";
import { registerOutboundMediaRoutes } from "../modules/channels/outboundMedia.routes.js";
import { registerChatRoutes } from "../modules/chat/chat.routes.js";
import { PiSdkChatService } from "../modules/chat/chat.service.js";
import { registerEmailRoutes } from "../modules/email/email.routes.js";
import { registerTelegramRoutes } from "../modules/telegram/telegram.routes.js";
import { registerWhatsAppRoutes } from "../modules/whatsapp/whatsapp.routes.js";
import { registerWorkspaceRoutes } from "../modules/workspace/workspace.routes.js";
import {
  clearSessionCookie,
  createSessionToken,
  isAuthorizedRequest,
  isCookieSessionAuthEnabled,
  isSessionCookiePresent,
  setSessionCookie,
  verifyLoginPassword,
} from "../shared/auth/sessionAuth.js";
import { backendConfig } from "../shared/config/config.js";
import { captureBackendException } from "../shared/observability/sentry.js";

interface CreateAppOptions {
  chatService?: PiSdkChatService;
  appAgentService?: PiAppAgentService;
  automationService?: AutomationService;
}

const shouldLogBackendRequest = (path: string): boolean =>
  path === "/health" ||
  path.startsWith("/api/") ||
  path.startsWith("/auth/") ||
  path.startsWith("/workspace") ||
  path.startsWith("/workspace-file/") ||
  path.startsWith("/channel-media/") ||
  path.startsWith("/chats") ||
  path.startsWith("/api/inbound-");

const appleAppSiteAssociationResponse = (): Response =>
  new Response(
    JSON.stringify({
      applinks: {
        apps: [],
        details: backendConfig.deepLinks.iosUniversalLinkAppIds.map((appID) => ({
          appID,
          paths: ["/workspace/*", "/workspace-file/*"],
        })),
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );

export const createApp = ({
  chatService = new PiSdkChatService(),
  appAgentService = new PiAppAgentService(),
  automationService = new AutomationService(chatService),
}: CreateAppOptions = {}): Hono => {
  const app = new Hono();
  registerAutomationService(automationService);
  automationService.start();

  app.use("*", async (c, next) => {
    const path = c.req.path;
    if (!shouldLogBackendRequest(path)) {
      await next();
      return;
    }

    const startedAt = Date.now();
    try {
      await next();
      const durationMs = Date.now() - startedAt;
      console.log(
        `[backend] ${c.req.method} ${path} -> ${c.res.status} (${durationMs}ms)`,
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.error(
        `[backend] ${c.req.method} ${path} -> 500 (${durationMs}ms)`,
        error,
      );
      throw error;
    }
  });

  app.onError((error, c) => {
    captureBackendException(error, {
      tags: {
        area: "http",
        method: c.req.method,
        path: c.req.path,
      },
      extras: {
        url: c.req.url,
      },
    });

    return c.json({ error: "Internal server error" }, 500);
  });

  // Health and webhook endpoints stay ahead of auth for external callers.
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/.well-known/apple-app-site-association", () => appleAppSiteAssociationResponse());
  app.get("/apple-app-site-association", () => appleAppSiteAssociationResponse());
  registerOutboundMediaRoutes(app);
  registerEmailRoutes(app, chatService);
  registerTelegramRoutes(app, chatService);
  registerWhatsAppRoutes(app, chatService);

  app.use(
    "*",
    cors({
      origin: ["http://localhost:5800", "http://127.0.0.1:5800"],
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.get("/auth/session", (c) =>
    c.json({
      enabled: isCookieSessionAuthEnabled(),
      authenticated: isAuthorizedRequest(c),
      hasSessionCookie: isSessionCookiePresent(c),
    }),
  );

  app.post("/auth/login", async (c) => {
    if (!isCookieSessionAuthEnabled()) {
      return c.json({ error: "Password auth is not enabled" }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as { password?: unknown } | null;
    const password = typeof body?.password === "string" ? body.password : "";

    if (!verifyLoginPassword(password)) {
      return c.json({ error: "Invalid password" }, 401);
    }

    setSessionCookie(c, createSessionToken());
    return c.json({ ok: true });
  });

  app.post("/auth/logout", (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  if (isCookieSessionAuthEnabled()) {
    const requireAuthorizedRequest = async (
      c: Parameters<typeof isAuthorizedRequest>[0],
      next: () => Promise<void>,
    ) => {
      if (!isAuthorizedRequest(c)) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      await next();
    };

    app.use("/workspace", requireAuthorizedRequest);
    app.use("/workspace/*", requireAuthorizedRequest);
    app.use("/workspace-file/*", requireAuthorizedRequest);
    app.use("/workspace-runtime/*", requireAuthorizedRequest);
    app.use("/api/*", requireAuthorizedRequest);
    app.use("/chats", requireAuthorizedRequest);
    app.use("/chats/*", requireAuthorizedRequest);
  }

  registerChannelStatusRoutes(app);
  registerAutomationRoutes(app, automationService);
  registerWorkspaceRoutes(app);
  registerAppAgentRoutes(app, appAgentService);
  registerChatRoutes(app, chatService);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const frontendDir = resolve(__dirname, "../../../frontend/dist");

  app.use("/assets/*", async (c, next) => {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    await next();
  });

  app.use("/favicon.svg", async (c, next) => {
    c.header("Cache-Control", "public, max-age=86400");
    await next();
  });

  app.use("*", serveStatic({ root: frontendDir, rewriteRequestPath: (path) => path }));
  app.use("*", serveStatic({ root: frontendDir, rewriteRequestPath: () => "/index.html" }));

  return app;
};
