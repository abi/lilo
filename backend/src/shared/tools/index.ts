import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { askUserQuestionTool } from "./askUserQuestionTool.js";
import { browserAutomateTool } from "./browserbaseTools.js";
import { channelResponseTool } from "./channelResponseTool.js";
import { webScrapeTool, webSearchTool } from "./firecrawlTools.js";
import { generateImagesTool, removeBackgroundTool } from "./imageTools.js";
import { openAppTool } from "./openAppTool.js";
import { templateAppListTool, templateAppReadTool } from "./templateAppTools.js";
import { AUTOMATION_TOOLS } from "../../modules/automations/automation.tools.js";

export const CUSTOM_TOOLS: ToolDefinition[] = [
  askUserQuestionTool,
  channelResponseTool,
  openAppTool,
  browserAutomateTool,
  webSearchTool,
  webScrapeTool,
  generateImagesTool,
  removeBackgroundTool,
  templateAppListTool,
  templateAppReadTool,
  ...AUTOMATION_TOOLS,
];
