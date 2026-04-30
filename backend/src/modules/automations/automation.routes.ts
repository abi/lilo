import type { Hono } from "hono";
import type { AutomationService } from "./automation.service.js";

export const registerAutomationRoutes = (
  app: Hono,
  automationService: AutomationService,
): void => {
  app.get("/api/automations", async (c) =>
    c.json({
      jobs: await automationService.listJobs(),
      runs: await automationService.listRuns(),
    }),
  );

  app.post("/api/automations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    try {
      const job = await automationService.createJob({
        name: body?.name as string | undefined,
        prompt: body?.prompt as string | undefined,
        schedule: body?.schedule as never,
        enabled: body?.enabled as boolean | undefined,
      });
      return c.json({ job }, 201);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to create automation" },
        400,
      );
    }
  });

  app.patch("/api/automations/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    try {
      const job = await automationService.updateJob(c.req.param("id"), {
        name: body?.name as string | undefined,
        prompt: body?.prompt as string | undefined,
        schedule: body?.schedule as never,
        enabled: body?.enabled as boolean | undefined,
      });
      return c.json({ job });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to update automation" },
        400,
      );
    }
  });

  app.post("/api/automations/:id/run", async (c) => {
    try {
      const run = await automationService.runJobNow(c.req.param("id"));
      return c.json({ run });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to run automation" },
        400,
      );
    }
  });

  app.delete("/api/automations/:id", async (c) => {
    try {
      await automationService.deleteJob(c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to delete automation" },
        400,
      );
    }
  });
};
