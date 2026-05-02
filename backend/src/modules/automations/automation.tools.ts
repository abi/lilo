import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { getAutomationNotificationContext } from "./automation.notification.js";
import { describeSchedule } from "./automation.schedule.js";
import { getAutomationService } from "./automation.registry.js";

const scheduleParameter = Type.Object({
  type: Type.String({
    description: 'Schedule type. Use "cron" for recurring jobs or "at" for a one-shot ISO timestamp.',
  }),
  expression: Type.Optional(
    Type.String({
      description: 'Five-field cron expression, such as "0 8 * * *". Required when type is "cron".',
    }),
  ),
  timezone: Type.Optional(
    Type.String({
      description: 'IANA timezone for cron schedules, such as "America/New_York".',
    }),
  ),
  at: Type.Optional(
    Type.String({
      description: 'ISO timestamp for one-shot jobs, such as "2026-05-01T13:00:00Z".',
    }),
  ),
});

export const automationListTool: ToolDefinition = {
  name: "automation_list",
  label: "List Automations",
  description: "List scheduled Lilo automations stored in the workspace.",
  parameters: Type.Object({}),
  async execute() {
    const jobs = await getAutomationService().listJobs();
    return {
      content: [
        {
          type: "text" as const,
          text:
            jobs.length === 0
              ? "No automations are configured."
              : jobs
                  .map(
                    (job) =>
                      `- ${job.name} (${job.id}) ${job.enabled ? "enabled" : "disabled"}: ${describeSchedule(job.schedule)}${job.nextRunAt ? ` next ${job.nextRunAt}` : ""}`,
                  )
                  .join("\n"),
        },
      ],
      details: { jobs },
    };
  },
};

export const automationCreateTool: ToolDefinition = {
  name: "automation_create",
  label: "Create Automation",
  description:
    "Create a scheduled automation. Automations run the prompt in a new chat. The run only sends an external message if it calls send_automation_message.",
  parameters: Type.Object({
    name: Type.String({ description: "Short automation name.", minLength: 1 }),
    prompt: Type.String({
      description: "Prompt to run when the automation fires.",
      minLength: 1,
    }),
    schedule: scheduleParameter,
    enabled: Type.Optional(
      Type.Boolean({ description: "Whether the automation should start enabled." }),
    ),
  }),
  async execute(_toolCallId, params) {
    const job = await getAutomationService().createJob({
      name: (params as { name?: unknown }).name as string,
      prompt: (params as { prompt?: unknown }).prompt as string,
      schedule: (params as { schedule?: unknown }).schedule as never,
      enabled: (params as { enabled?: boolean }).enabled,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: `Created automation "${job.name}" (${job.id}).`,
        },
      ],
      details: { job },
    };
  },
};

export const automationUpdateTool: ToolDefinition = {
  name: "automation_update",
  label: "Update Automation",
  description: "Update an existing scheduled automation by id.",
  parameters: Type.Object({
    id: Type.String({ description: "Automation id.", minLength: 1 }),
    name: Type.Optional(Type.String({ description: "New automation name." })),
    prompt: Type.Optional(Type.String({ description: "New automation prompt." })),
    schedule: Type.Optional(scheduleParameter),
    enabled: Type.Optional(Type.Boolean({ description: "Whether the automation is enabled." })),
  }),
  async execute(_toolCallId, params) {
    const job = await getAutomationService().updateJob(
      String((params as { id?: unknown }).id ?? ""),
      {
        name: (params as { name?: string }).name,
        prompt: (params as { prompt?: string }).prompt,
        schedule: (params as { schedule?: unknown }).schedule as never,
        enabled: (params as { enabled?: boolean }).enabled,
      },
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `Updated automation "${job.name}" (${job.id}).`,
        },
      ],
      details: { job },
    };
  },
};

export const automationDeleteTool: ToolDefinition = {
  name: "automation_delete",
  label: "Delete Automation",
  description: "Delete an existing scheduled automation by id.",
  parameters: Type.Object({
    id: Type.String({ description: "Automation id.", minLength: 1 }),
  }),
  async execute(_toolCallId, params) {
    const id = String((params as { id?: unknown }).id ?? "");
    await getAutomationService().deleteJob(id);
    return {
      content: [{ type: "text" as const, text: `Deleted automation ${id}.` }],
      details: { id },
    };
  },
};

export const automationSendMessageTool: ToolDefinition = {
  name: "send_automation_message",
  label: "Send Automation Message",
  description:
    "During an automation run only, send an external notification to the configured automation channel. Use this only when the automation has a message the user should actually receive. If there is nothing useful to notify the user about, do not call this tool.",
  promptSnippet:
    "send_automation_message: during automation runs only, call this with the exact user-facing message to send to the configured automation channel. Do not call it for status/progress/completion noise; if no notification is needed, finish normally without calling it.",
  promptGuidelines: [
    "For automation runs, your normal assistant text is internal run history only and is not sent externally.",
    "Only call send_automation_message when the user should receive a notification.",
    "Never call send_automation_message for generic progress, acknowledgement, or completion messages.",
  ],
  parameters: Type.Object({
    message: Type.String({
      description: "The exact user-facing message to send.",
      minLength: 1,
    }),
  }),
  async execute(_toolCallId, params) {
    const context = getAutomationNotificationContext();
    if (!context) {
      throw new Error("send_automation_message is only available while an automation is running");
    }

    const message = String((params as { message?: unknown }).message ?? "").trim();
    if (!message) {
      throw new Error("Automation message cannot be empty");
    }

    await context.sendMessage(message);

    return {
      content: [
        {
          type: "text" as const,
          text: `Sent automation message via ${context.outputChannel}.`,
        },
      ],
      details: {
        automationId: context.automationId,
        automationName: context.automationName,
        runId: context.runId,
        outputChannel: context.outputChannel,
        message,
      },
    };
  },
};

export const automationRunTool: ToolDefinition = {
  name: "automation_run",
  label: "Run Automation",
  description: "Run an automation immediately by id.",
  parameters: Type.Object({
    id: Type.String({ description: "Automation id.", minLength: 1 }),
  }),
  async execute(_toolCallId, params) {
    const run = await getAutomationService().runJobNow(
      String((params as { id?: unknown }).id ?? ""),
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `Ran automation "${run.automationName}" with status ${run.status}.`,
        },
      ],
      details: { run },
    };
  },
};

export const AUTOMATION_TOOLS: ToolDefinition[] = [
  automationListTool,
  automationCreateTool,
  automationUpdateTool,
  automationDeleteTool,
  automationRunTool,
  automationSendMessageTool,
];
