import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { getWorkspaceAppDefinition } from "../workspace/apps.js";

export const OPEN_APP_TOOL_NAME = "open_app";

export interface OpenAppToolDetails {
  appName: string;
  viewerPath: string;
}

export const isOpenAppDetails = (value: unknown): value is OpenAppToolDetails =>
  Boolean(
    value &&
      typeof value === "object" &&
      "appName" in value &&
      typeof (value as { appName?: unknown }).appName === "string" &&
      "viewerPath" in value &&
      typeof (value as { viewerPath?: unknown }).viewerPath === "string",
  );

export const openAppTool: ToolDefinition = {
  name: OPEN_APP_TOOL_NAME,
  label: "Open App",
  description:
    "Open an edited workspace app in the viewer. Use this after editing an app by passing its workspace folder name.",
  parameters: Type.Object({
    app_name: Type.String({
      description: "The workspace folder name of the app to open in viewer.",
      minLength: 1,
    }),
  }),
  async execute(_toolCallId, params) {
    const appName = String((params as { app_name: string }).app_name).trim();
    const app = await getWorkspaceAppDefinition(appName);
    if (!app) {
      throw new Error(`Workspace app "${appName}" was not found`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Viewer ready for ${appName}.`,
        },
      ],
      details: {
        appName,
        viewerPath: app.viewerPath,
      } satisfies OpenAppToolDetails,
    };
  },
};
