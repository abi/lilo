import { Type } from "@mariozechner/pi-ai";
import { chromium } from "playwright-core";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { backendConfig, requireConfigValue } from "../config/config.js";

const BROWSERBASE_API_BASE_URL = "https://api.browserbase.com/v1";
const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
const MAX_EXTRACT_CHARS = 8_000;
const MAX_STEPS = 16;

type BrowserbaseSession = {
  id: string;
  connectUrl: string;
};

type BrowserAutomationStep =
  | {
      type: "goto";
      url: string;
      wait_until?: "load" | "domcontentloaded" | "networkidle" | "commit";
    }
  | {
      type: "click";
      selector: string;
    }
  | {
      type: "type";
      selector: string;
      text: string;
      clear_first?: boolean;
    }
  | {
      type: "press";
      selector: string;
      key: string;
    }
  | {
      type: "wait_for_selector";
      selector: string;
      state?: "attached" | "detached" | "visible" | "hidden";
      timeout_ms?: number;
    }
  | {
      type: "wait_for_timeout";
      timeout_ms: number;
    }
  | {
      type: "extract_text";
      selector: string;
      name?: string;
    }
  | {
      type: "screenshot";
      full_page?: boolean;
      name?: string;
    };

type BrowserAutomationDetails = {
  sessionId: string | null;
  replayUrl: string | null;
  finalUrl: string | null;
  title: string | null;
  extracted: Array<{
    name: string;
    selector: string;
    text: string;
  }>;
  screenshots: Array<{
    name: string;
    data_url: string;
  }>;
  steps: Array<{
    index: number;
    type: string;
    status: "ok" | "error";
    note: string;
  }>;
};

const createTextResult = <TDetails>(
  text: string,
  details: TDetails,
): AgentToolResult<TDetails> => ({
  content: [{ type: "text", text }],
  details,
});

const getRequiredBrowserbaseApiKey = (): string => {
  return requireConfigValue(
    backendConfig.tools.browserbase.apiKey,
    "BROWSERBASE_API_KEY",
  );
};

const getOptionalBrowserbaseProjectId = (): string | null => {
  return backendConfig.tools.browserbase.projectId;
};

const jsonText = async (response: Response): Promise<string> => {
  try {
    return JSON.stringify((await response.json()) as unknown);
  } catch {
    return await response.text();
  }
};

const createBrowserbaseSession = async (
  signal?: AbortSignal,
): Promise<BrowserbaseSession> => {
  const apiKey = getRequiredBrowserbaseApiKey();
  const projectId = getOptionalBrowserbaseProjectId();
  const response = await fetch(`${BROWSERBASE_API_BASE_URL}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify({
      ...(projectId ? { projectId } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Browserbase session creation failed: ${response.status} ${await jsonText(response)}`);
  }

  const session = (await response.json()) as Partial<BrowserbaseSession>;
  if (!session.id || !session.connectUrl) {
    throw new Error("Browserbase session response was missing id or connectUrl");
  }

  return {
    id: session.id,
    connectUrl: session.connectUrl,
  };
};

const truncateText = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}\n\n[truncated]`;
};

const normalizeSteps = (value: unknown): BrowserAutomationStep[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is BrowserAutomationStep => Boolean(entry) && typeof entry === "object")
    .slice(0, MAX_STEPS);
};

export const browserAutomateTool: ToolDefinition = {
  name: "browser_automate",
  label: "Browser Automate",
  description:
    "Run real browser automation in Browserbase using Playwright-compatible actions like navigate, click, type, wait, extract text, and take screenshots.",
  promptSnippet:
    "browser_automate: automate a live browser session with structured steps such as goto, click, type, press, wait, extract_text, and screenshot.",
  parameters: Type.Object({
    start_url: Type.Optional(
      Type.String({
        description: "Optional URL to open before running any steps.",
        minLength: 1,
      }),
    ),
    steps: Type.Array(
      Type.Object({
        type: Type.String({
          description:
            "Step type. Supported values: goto, click, type, press, wait_for_selector, wait_for_timeout, extract_text, screenshot.",
          minLength: 1,
        }),
        url: Type.Optional(
          Type.String({
            description: "URL used by goto steps.",
            minLength: 1,
          }),
        ),
        selector: Type.Optional(
          Type.String({
            description: "CSS selector used by click, type, press, wait_for_selector, and extract_text steps.",
            minLength: 1,
          }),
        ),
        text: Type.Optional(
          Type.String({
            description: "Text used by type steps.",
            minLength: 1,
          }),
        ),
        key: Type.Optional(
          Type.String({
            description: "Keyboard key used by press steps, for example Enter.",
            minLength: 1,
          }),
        ),
        state: Type.Optional(
          Type.String({
            description: "Selector wait state for wait_for_selector: attached, detached, visible, or hidden.",
            minLength: 1,
          }),
        ),
        timeout_ms: Type.Optional(
          Type.Number({
            description: "Timeout in milliseconds for wait steps.",
          }),
        ),
        wait_until: Type.Optional(
          Type.String({
            description: "Navigation wait mode for goto steps: load, domcontentloaded, networkidle, or commit.",
            minLength: 1,
          }),
        ),
        clear_first: Type.Optional(
          Type.Boolean({
            description: "Whether type steps should clear the field before entering text.",
          }),
        ),
        full_page: Type.Optional(
          Type.Boolean({
            description: "Whether screenshot steps should capture the full page.",
          }),
        ),
        name: Type.Optional(
          Type.String({
            description: "Optional label for extract_text or screenshot results.",
            minLength: 1,
          }),
        ),
      }),
      {
        minItems: 1,
        maxItems: MAX_STEPS,
        description: "Ordered browser automation steps.",
      },
    ),
  }),
  async execute(_toolCallId, params, signal) {
    const startUrl = String((params as { start_url?: string }).start_url ?? "").trim();
    const steps = normalizeSteps((params as { steps?: unknown }).steps);

    if (!startUrl && steps.length === 0) {
      return createTextResult<BrowserAutomationDetails>(
        "No browser automation steps were provided.",
        {
          sessionId: null,
          replayUrl: null,
          finalUrl: null,
          title: null,
          extracted: [],
          screenshots: [],
          steps: [],
        },
      );
    }

    const session = await createBrowserbaseSession(signal);
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(DEFAULT_ACTION_TIMEOUT_MS);

    const stepResults: BrowserAutomationDetails["steps"] = [];
    const extracted: BrowserAutomationDetails["extracted"] = [];
    const screenshots: BrowserAutomationDetails["screenshots"] = [];

    try {
      if (startUrl) {
        await page.goto(startUrl, { waitUntil: "domcontentloaded" });
      }

      for (const [index, step] of steps.entries()) {
        try {
          if (step.type === "goto") {
            await page.goto(step.url, {
              waitUntil: step.wait_until ?? "domcontentloaded",
            });
            stepResults.push({ index, type: step.type, status: "ok", note: `Navigated to ${step.url}` });
            continue;
          }

          if (step.type === "click") {
            await page.locator(step.selector).click();
            stepResults.push({ index, type: step.type, status: "ok", note: `Clicked ${step.selector}` });
            continue;
          }

          if (step.type === "type") {
            const locator = page.locator(step.selector);
            if (step.clear_first ?? true) {
              await locator.fill("");
            }
            await locator.fill(step.text);
            stepResults.push({ index, type: step.type, status: "ok", note: `Typed into ${step.selector}` });
            continue;
          }

          if (step.type === "press") {
            await page.locator(step.selector).press(step.key);
            stepResults.push({ index, type: step.type, status: "ok", note: `Pressed ${step.key} on ${step.selector}` });
            continue;
          }

          if (step.type === "wait_for_selector") {
            await page.waitForSelector(step.selector, {
              state: step.state ?? "visible",
              timeout: step.timeout_ms ?? DEFAULT_ACTION_TIMEOUT_MS,
            });
            stepResults.push({ index, type: step.type, status: "ok", note: `Waited for ${step.selector}` });
            continue;
          }

          if (step.type === "wait_for_timeout") {
            await page.waitForTimeout(step.timeout_ms);
            stepResults.push({ index, type: step.type, status: "ok", note: `Waited ${step.timeout_ms}ms` });
            continue;
          }

          if (step.type === "extract_text") {
            const text = truncateText(
              (await page.locator(step.selector).innerText()).trim(),
              MAX_EXTRACT_CHARS,
            );
            extracted.push({
              name: step.name?.trim() || `extract_${extracted.length + 1}`,
              selector: step.selector,
              text,
            });
            stepResults.push({ index, type: step.type, status: "ok", note: `Extracted text from ${step.selector}` });
            continue;
          }

          if (step.type === "screenshot") {
            const screenshot = await page.screenshot({
              fullPage: step.full_page ?? false,
              type: "png",
            });
            screenshots.push({
              name: step.name?.trim() || `screenshot_${screenshots.length + 1}`,
              data_url: `data:image/png;base64,${screenshot.toString("base64")}`,
            });
            stepResults.push({ index, type: step.type, status: "ok", note: "Captured screenshot" });
            continue;
          }

          throw new Error(`Unsupported step type: ${(step as { type?: unknown }).type ?? "unknown"}`);
        } catch (error) {
          stepResults.push({
            index,
            type: (step as { type?: string }).type ?? "unknown",
            status: "error",
            note: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      const finalUrl = page.url();
      const title = await page.title().catch(() => "");
      const summary = [
        `Browser automation completed in Browserbase session ${session.id}.`,
        `Replay: https://browserbase.com/sessions/${session.id}`,
        `Final URL: ${finalUrl}`,
        title ? `Page title: ${title}` : null,
        extracted.length > 0 ? `Extracted items: ${extracted.length}` : null,
        screenshots.length > 0 ? `Screenshots: ${screenshots.length}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");

      return createTextResult<BrowserAutomationDetails>(summary, {
        sessionId: session.id,
        replayUrl: `https://browserbase.com/sessions/${session.id}`,
        finalUrl,
        title: title || null,
        extracted,
        screenshots,
        steps: stepResults,
      });
    } finally {
      await page.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  },
};
