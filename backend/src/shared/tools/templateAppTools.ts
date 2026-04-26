import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { WORKSPACE_TEMPLATE_DIR } from "../config/paths.js";

const MAX_TEMPLATE_FILE_CHARS = 80_000;

const normalizeAppName = (value: unknown): string => String(value ?? "").trim();

const normalizeRelativePath = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().replace(/\\/g, "/");
  if (!raw || raw.startsWith("/")) return null;
  const segments = raw.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return segments.join("/");
};

const resolveTemplateAppRoot = (appName: string): string | null => {
  if (!appName || appName.includes("/") || appName.includes("\\") || appName.includes("..")) {
    return null;
  }

  const appRoot = resolve(WORKSPACE_TEMPLATE_DIR, appName);
  if (!appRoot.startsWith(WORKSPACE_TEMPLATE_DIR) || !existsSync(resolve(appRoot, "manifest.json"))) {
    return null;
  }

  return appRoot;
};

const walkTemplateApp = async (appRoot: string, relativeDir = ""): Promise<string[]> => {
  const absoluteDir = relativeDir ? resolve(appRoot, relativeDir) : appRoot;
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(`${relativePath}/`);
      paths.push(...(await walkTemplateApp(appRoot, relativePath)));
      continue;
    }
    if (entry.isFile()) {
      paths.push(relativePath);
    }
  }

  return paths;
};

export const templateAppListTool: ToolDefinition = {
  name: "template_app_list",
  label: "List Template App Files",
  description:
    "List files in a read-only bundled workspace-template app. Use this when porting template updates into a user's workspace app.",
  parameters: Type.Object({
    app_name: Type.String({
      description: "The workspace-template app folder name, such as todo or calories.",
      minLength: 1,
    }),
  }),
  async execute(_toolCallId, params) {
    const appName = normalizeAppName((params as { app_name?: unknown }).app_name);
    const appRoot = resolveTemplateAppRoot(appName);
    if (!appRoot) {
      throw new Error(`Template app "${appName}" was not found`);
    }

    const paths = await walkTemplateApp(appRoot);
    return {
      content: [
        {
          type: "text" as const,
          text: paths.join("\n") || "No files found.",
        },
      ],
      details: {
        appName,
        paths,
      },
    };
  },
};

export const templateAppReadTool: ToolDefinition = {
  name: "template_app_read",
  label: "Read Template App File",
  description:
    "Read one file from a read-only bundled workspace-template app. Use this to compare the latest template source with the workspace app before editing.",
  parameters: Type.Object({
    app_name: Type.String({
      description: "The workspace-template app folder name, such as todo or calories.",
      minLength: 1,
    }),
    path: Type.String({
      description: "Relative path inside the template app, such as manifest.json or index.html.",
      minLength: 1,
    }),
  }),
  async execute(_toolCallId, params) {
    const appName = normalizeAppName((params as { app_name?: unknown }).app_name);
    const relativePath = normalizeRelativePath((params as { path?: unknown }).path);
    const appRoot = resolveTemplateAppRoot(appName);
    if (!appRoot || !relativePath) {
      throw new Error("Invalid template app path");
    }

    const absolutePath = resolve(appRoot, relativePath);
    if (!absolutePath.startsWith(appRoot)) {
      throw new Error("Invalid template app path");
    }

    const info = await stat(absolutePath);
    if (!info.isFile()) {
      throw new Error("Template path is not a file");
    }

    const raw = await readFile(absolutePath, "utf8");
    const truncated = raw.length > MAX_TEMPLATE_FILE_CHARS;
    const text = truncated
      ? `${raw.slice(0, MAX_TEMPLATE_FILE_CHARS)}\n\n[truncated]`
      : raw;

    return {
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
      details: {
        appName,
        path: relative(appRoot, absolutePath).split("\\").join("/"),
        truncated,
      },
    };
  },
};
