import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { streamSseEvents } from "../../shared/http/sse.js";
import {
  isWorkspaceAppNameSync,
  listWorkspaceApps,
} from "../../shared/workspace/apps.js";
import {
  PiAppAgentService,
  type AppAgentCreateSessionInput,
  type AppAgentPromptInput,
} from "./appAgent.service.js";

const isValidApp = (appName: string): boolean => isWorkspaceAppNameSync(appName);

export const registerAppAgentRoutes = (
  app: Hono,
  appAgentService: PiAppAgentService,
): void => {
  app.get("/api/app-chats", async (c) => {
    const appNames = (await listWorkspaceApps()).map((app) => app.name);
    const sessionGroups = await Promise.all(
      appNames.map(async (appName) => appAgentService.listSessions(appName)),
    );

    const sessions = sessionGroups
      .flat()
      .map((session) => ({
        id: `${session.appName}:${session.id}`,
        sessionId: session.id,
        appName: session.appName,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        status: session.status,
      }))
      .sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );

    return c.json({ sessions });
  });

  app.get("/api/app-chats/:appName/:sessionId", async (c) => {
    const appName = c.req.param("appName");
    const sessionId = c.req.param("sessionId");
    if (!isValidApp(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    const session = await appAgentService.getSession(appName, sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({
      session: {
        id: `${session.appName}:${session.id}`,
        sessionId: session.id,
        appName: session.appName,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        status: session.status,
        messages: session.messages,
      },
    });
  });

  app.post("/api/apps/:appName/agent/sessions", async (c) => {
    const appName = c.req.param("appName");
    if (!isValidApp(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    let payload: AppAgentCreateSessionInput = {};
    try {
      payload = (await c.req.json()) as AppAgentCreateSessionInput;
    } catch {
      payload = {};
    }

    try {
      const session = await appAgentService.createSession(appName, payload);
      return c.json(session, 201);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to create app session" },
        400,
      );
    }
  });

  app.get("/api/apps/:appName/agent/sessions", async (c) => {
    const appName = c.req.param("appName");
    if (!isValidApp(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    return c.json({ sessions: await appAgentService.listSessions(appName) });
  });

  app.get("/api/apps/:appName/agent/sessions/:sessionId", async (c) => {
    const appName = c.req.param("appName");
    if (!isValidApp(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    const session = await appAgentService.getSession(appName, c.req.param("sessionId"));
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ session });
  });

  app.post("/api/apps/:appName/agent/sessions/:sessionId/stop", async (c) => {
    const appName = c.req.param("appName");
    if (!isValidApp(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    try {
      await appAgentService.stopSession(appName, c.req.param("sessionId"));
      return c.json({ status: "ok" });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to stop session" },
        400,
      );
    }
  });

  app.post("/api/apps/:appName/agent/sessions/:sessionId/messages", async (c) => {
    const appName = c.req.param("appName");
    const sessionId = c.req.param("sessionId");
    if (!isValidApp(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    let payload: AppAgentPromptInput;
    try {
      payload = (await c.req.json()) as AppAgentPromptInput;
    } catch {
      return c.json({ error: "Invalid request body" }, 400);
    }

    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    return streamSSE(c, async (stream) => {
      await streamSseEvents(stream.writeSSE.bind(stream), async (enqueueEvent) => {
        try {
          await appAgentService.promptSession(appName, sessionId, payload, enqueueEvent);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown app-agent streaming failure";
          await enqueueEvent({ event: "error", data: { message } });
          await enqueueEvent({
            event: "done",
            data: { reason: "error", finalText: "", appName, sessionId },
          });
        }
      });
    });
  });
};
