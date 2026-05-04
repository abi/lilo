import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { Stats } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  WORKSPACE_ROOT,
  WORKSPACE_TEMPLATE_DIR,
  getSafeWorkspaceGitUrl,
  getWorkspaceGitBrowserUrl,
} from "../../shared/config/paths.js";
import { streamSseEvents } from "../../shared/http/sse.js";
import {
  getWorkspaceAppDefinition,
  getWorkspaceAppDefinitionSync,
  listWorkspaceApps,
} from "../../shared/workspace/apps.js";
import {
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
  readWorkspaceAppPrefs,
  isAutomationOutputChannel,
} from "../../shared/workspace/appPrefs.js";
import {
  dismissWorkspaceTemplateUpdate,
  getWorkspaceTemplateUpdates,
} from "../../shared/workspace/templateUpdates.js";
import { isSupportedChatModelSelection } from "../../shared/pi/runtime.js";
import {
  getShellRunSnapshot,
  startShellRun,
  stopShellRun,
  subscribeToShellRun,
  type ShellRunEvent,
} from "./shellRuns.js";

const toShellRunEvent = (
  event: { event: ShellRunEvent["event"]; data: ShellRunEvent["data"] },
): ShellRunEvent => {
  switch (event.event) {
    case "stdout":
      return { event: "stdout", data: event.data as { text: string } };
    case "stderr":
      return { event: "stderr", data: event.data as { text: string } };
    case "error":
      return { event: "error", data: event.data as { message: string } };
    case "exit":
      return {
        event: "exit",
        data: event.data as {
          exitCode: number | null;
          signal: string | null;
          stdout: string;
          stderr: string;
        },
      };
  }
};

const execFileAsync = promisify(execFile);
const WORKSPACE_CONFIG_DIR = getWorkspaceConfigDir(WORKSPACE_ROOT);
const WORKSPACE_CONFIG_PATH = getWorkspaceConfigPath(WORKSPACE_ROOT);

/**
 * The built-in `desktop` app is always pinned to the first slot of the UI and
 * never participates in user-driven app ordering or archiving, so we strip it
 * from persisted config.
 */
const PINNED_APP_NAME = "desktop";

const writeWorkspaceConfig = async (config: {
  appNames: string[];
  archivedAppNames: string[];
  timeZone: string | null;
  defaultChatModelSelection: unknown;
  automationOutputChannel: unknown;
}): Promise<void> => {
  await mkdir(WORKSPACE_CONFIG_DIR, { recursive: true });
  const sanitized = {
    appNames: config.appNames.filter((name) => name !== PINNED_APP_NAME),
    archivedAppNames: config.archivedAppNames.filter(
      (name) => name !== PINNED_APP_NAME,
    ),
    timeZone: config.timeZone,
    defaultChatModelSelection: isSupportedChatModelSelection(
      config.defaultChatModelSelection,
    )
      ? config.defaultChatModelSelection
      : null,
    automationOutputChannel: isAutomationOutputChannel(config.automationOutputChannel)
      ? config.automationOutputChannel
      : "whatsapp",
  };
  await writeFile(WORKSPACE_CONFIG_PATH, JSON.stringify(sanitized, null, 2), "utf8");
};
const DEFAULT_WORKSPACE_TIME_ZONE = "America/New_York";

type WorkspaceAppRecord = {
  name: string;
  displayName?: string;
  description?: string;
  href: string;
  viewerPath: string;
  iconHref?: string;
  archived?: boolean;
};

type WorkspaceLegacyFile = {
  name: string;
  path: string;
  type: "html" | "md";
  dir: string;
};

type WorkspaceEntryKind =
  | "app"
  | "directory"
  | "markdown"
  | "json"
  | "image"
  | "text"
  | "code"
  | "binary";

type WorkspaceEntry = {
  name: string;
  relativePath: string;
  parentRelativePath: string | null;
  kind: WorkspaceEntryKind;
  viewerPath: string | null;
  appName?: string;
  iconHref?: string;
  archived?: boolean;
};

type WorkspaceFsListEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
};

type WorkspaceFsStat = {
  path: string;
  name: string;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
  ctimeMs: number;
};

type NetworkBodyPayload =
  | { kind: "text"; text: string }
  | { kind: "base64"; base64: string }
  | { kind: "searchParams"; entries: Array<[string, string]> }
  | {
      kind: "formData";
      entries: Array<
        | { name: string; kind: "text"; value: string }
        | { name: string; kind: "file"; filename: string; mediaType: string; base64: string }
      >;
    };

const INTERNAL_DIR_NAMES = new Set([".git", "node_modules"]);
const INTERNAL_FILE_NAMES = new Set([".DS_Store"]);
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "content-encoding",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".avif",
  ".svg",
  ".ico",
]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".log",
  ".csv",
  ".tsv",
  ".ini",
  ".cfg",
  ".conf",
]);
const CODE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".php",
  ".java",
  ".kt",
  ".swift",
  ".go",
  ".rs",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hpp",
  ".cs",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".xml",
  ".yml",
  ".yaml",
  ".toml",
  ".vue",
  ".svelte",
]);

const isExtensionlessDotfile = (path: string): boolean => {
  const fileName = basename(path);
  return fileName.startsWith(".") && extname(fileName).length === 0;
};

const encodeWorkspaceRoutePath = (relativePath: string): string =>
  relativePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");

const buildRawWorkspaceFilePath = (relativePath: string): string =>
  `/workspace-file/${encodeWorkspaceRoutePath(relativePath)}`;

const buildViewerDeepLinkPath = (viewerPath: string): string =>
  `/?viewer=${encodeURIComponent(viewerPath)}`;

const isTopLevelDocumentNavigation = (request: Request): boolean => {
  const fetchDest = request.headers.get("sec-fetch-dest");
  if (fetchDest) {
    return fetchDest === "document";
  }

  const fetchMode = request.headers.get("sec-fetch-mode");
  if (fetchMode && fetchMode !== "navigate") {
    return false;
  }

  return request.headers.get("accept")?.includes("text/html") ?? false;
};

const mimeTypeForPath = (path: string): string => {
  const extension = extname(path).toLowerCase();

  if (extension === ".pdf") return "application/pdf";
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".ts" || extension === ".tsx" || extension === ".jsx") {
    return "text/plain; charset=utf-8";
  }
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".bmp") return "image/bmp";
  if (extension === ".avif") return "image/avif";
  if (extension === ".ico") return "image/x-icon";
  if (TEXT_EXTENSIONS.has(extension) || CODE_EXTENSIONS.has(extension)) {
    return "text/plain; charset=utf-8";
  }
  if (extension === ".md") return "text/markdown; charset=utf-8";
  if (isExtensionlessDotfile(path)) return "text/plain; charset=utf-8";

  return "application/octet-stream";
};

const workspaceFileHeaders = (
  absolutePath: string,
  info?: Pick<Stats, "mtime" | "size">,
): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": mimeTypeForPath(absolutePath),
    "Cache-Control": "no-cache",
  };

  if (info) {
    headers.ETag = workspaceFileEtag(info);
    headers["Last-Modified"] = info.mtime.toUTCString();
  }

  if (extname(absolutePath).toLowerCase() === ".pdf") {
    headers["Content-Disposition"] = "inline";
  }

  return headers;
};

const workspaceFileEtag = (info: Pick<Stats, "mtime" | "size">): string =>
  `"${Math.floor(info.mtime.getTime())}-${info.size}"`;

const isWorkspaceFileNotModified = (
  request: Request,
  info: Pick<Stats, "mtime" | "size">,
): boolean => {
  const etag = workspaceFileEtag(info);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch?.split(",").map((value) => value.trim()).includes(etag)) {
    return true;
  }

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) {
    return false;
  }

  const modifiedSinceMs = Date.parse(ifModifiedSince);
  const modifiedMs = Math.floor(info.mtime.getTime() / 1000) * 1000;
  return Number.isFinite(modifiedSinceMs) && modifiedMs <= modifiedSinceMs;
};

const shouldSkipWorkspaceEntry = (name: string, isDirectory: boolean): boolean =>
  isDirectory ? INTERNAL_DIR_NAMES.has(name) : INTERNAL_FILE_NAMES.has(name);

const sortDirEntries = <T extends { name: string; isDirectory: () => boolean }>(entries: T[]): T[] =>
  [...entries].sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

const classifyWorkspaceFile = (relativePath: string): Exclude<WorkspaceEntryKind, "app" | "directory"> => {
  const extension = extname(relativePath).toLowerCase();

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "markdown";
  }

  if (extension === ".json") {
    return "json";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }

  if (isExtensionlessDotfile(relativePath)) {
    return "text";
  }

  return "binary";
};

const collectWorkspaceEntries = async (
  apps: WorkspaceAppRecord[],
): Promise<WorkspaceEntry[]> => {
  const appByName = new Map(apps.map((app) => [app.name, app]));

  const walkDirectory = async (
    relativeDir: string,
    currentAppName?: string,
  ): Promise<WorkspaceEntry[]> => {
    const absoluteDir = relativeDir.length > 0
      ? resolve(WORKSPACE_ROOT, relativeDir)
      : WORKSPACE_ROOT;
    const dirEntries = sortDirEntries(
      (await readdir(absoluteDir, { withFileTypes: true })).filter(
        (entry) => !shouldSkipWorkspaceEntry(entry.name, entry.isDirectory()),
      ),
    );

    const collected: WorkspaceEntry[] = [];

    for (const entry of dirEntries) {
      const relativePath = relativeDir.length > 0
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      const parentRelativePath = relativeDir.length > 0 ? relativeDir : null;

      if (entry.isDirectory()) {
        const topLevelApp = relativeDir.length === 0 ? appByName.get(entry.name) : undefined;
        collected.push({
          name: entry.name,
          relativePath,
          parentRelativePath,
          kind: topLevelApp ? "app" : "directory",
          viewerPath: topLevelApp ? topLevelApp.viewerPath : null,
          appName: currentAppName ?? topLevelApp?.name,
          iconHref: topLevelApp?.iconHref,
          archived: topLevelApp?.archived,
        });
        collected.push(
          ...(await walkDirectory(relativePath, currentAppName ?? topLevelApp?.name)),
        );
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      collected.push({
        name: entry.name,
        relativePath,
        parentRelativePath,
        kind: classifyWorkspaceFile(relativePath),
        viewerPath: buildRawWorkspaceFilePath(relativePath),
        appName: currentAppName,
      });
    }

    return collected;
  };

  return walkDirectory("");
};

const sortAppsBySavedOrder = <T extends { name: string }>(apps: T[], appOrder: string[]): T[] => {
  if (appOrder.length === 0) {
    return apps;
  }

  const rank = new Map(appOrder.map((name, index) => [name, index]));
  return [...apps].sort((a, b) => {
    const aRank = rank.get(a.name);
    const bRank = rank.get(b.name);

    if (aRank == null && bRank == null) {
      return a.name.localeCompare(b.name);
    }
    if (aRank == null) {
      return 1;
    }
    if (bRank == null) {
      return -1;
    }
    return aRank - bRank;
  });
};

const LILO_AGENT_RUNTIME = String.raw`(() => {
  const parseSseBlock = (block) => {
    const lines = block.split("\n").map((line) => line.trimEnd()).filter(Boolean);
    if (lines.length === 0) return null;
    let event = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    return { event, data: dataLines.join("\n") };
  };

  const safeParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  const getAppName = () => {
    const match = window.location.pathname.match(/^\/workspace\/([^/]+)/);
    if (!match) throw new Error("Unable to determine workspace app name from URL");
    return decodeURIComponent(match[1]);
  };

  const jsonFetch = async (url, init) => {
    const response = await fetch(url, init);
    if (!response.ok) {
      let message = "Request failed";
      try {
        const payload = await response.json();
        message = payload.error || payload.details || message;
      } catch {}
      throw new Error(message);
    }
    return response.json();
  };

  const createEmitter = () => {
    const handlers = new Map();
    return {
      on(eventName, handler) {
        const current = handlers.get(eventName) || new Set();
        current.add(handler);
        handlers.set(eventName, current);
        return () => current.delete(handler);
      },
      emit(eventName, payload) {
        const current = handlers.get(eventName);
        if (!current) return;
        for (const handler of current) handler(payload);
      },
    };
  };

  const appName = getAppName();
  const agentBase = () => "/api/apps/" + encodeURIComponent(appName) + "/agent";

  window.lilo = window.lilo || {};

  let osReqId = 0;
  const osPending = new Map();
  const requestOsAction = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++osReqId;
      osPending.set(requestId, { resolve, reject });
      window.parent.postMessage({
        type,
        requestId,
        ...payload,
      }, "*");
    });
  const settleOsAction = (data) => {
    const pending = osPending.get(data.requestId);
    if (!pending) return;
    osPending.delete(data.requestId);
    if (typeof data.error === "string" && data.error.length > 0) {
      pending.reject(new Error(data.error));
      return;
    }
    pending.resolve(data);
  };
  const truncateText = (value, maxLength) =>
    value.length > maxLength ? value.slice(0, maxLength - 1) + "…" : value;
  const normalizeSelectionText = (value) =>
    truncateText(String(value || "").replace(/\s+/g, " ").trim(), 80);
  const getSelectableElement = (target) => {
    const node = target instanceof Node
      ? target.nodeType === Node.TEXT_NODE
        ? target.parentElement
        : target
      : null;
    if (!(node instanceof HTMLElement)) return null;
    if (["HTML", "BODY", "HEAD", "SCRIPT", "STYLE"].includes(node.tagName)) return null;
    return node;
  };
  const formatElementLabel = (element) => {
    const openingTag = element.outerHTML.match(/^<[^>]+>/);
    return truncateText(openingTag ? openingTag[0] : "<" + element.tagName.toLowerCase() + ">", 64);
  };
  const escapeSvgText = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const createSelectionThumbnail = (label, textPreview) => {
    const safeLabel = escapeSvgText(truncateText(label, 38));
    const safeText = escapeSvgText(truncateText(textPreview || "Selected element", 54));
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">',
      '<rect width="320" height="180" rx="18" fill="#f5f5f5"/>',
      '<rect x="14" y="14" width="292" height="152" rx="14" fill="#ffffff" stroke="#d4d4d4"/>',
      '<rect x="28" y="30" width="182" height="18" rx="9" fill="#dbeafe"/>',
      '<text x="28" y="78" font-size="20" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="#404040">' + safeLabel + '</text>',
      '<text x="28" y="114" font-size="16" font-family="system-ui, sans-serif" fill="#737373">' + safeText + '</text>',
      '</svg>',
    ].join("");
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  };
  const isExternalLikeHref = (href) =>
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) ||
    href.startsWith("//") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:");
  const normalizeWorkspaceViewerPath = (href) => {
    const raw = String(href || "").trim();
    if (!raw || raw.startsWith("#") || isExternalLikeHref(raw)) {
      return null;
    }

    const withoutHash = raw.split("#", 1)[0];
    const withoutQuery = withoutHash.split("?", 1)[0];
    if (!withoutQuery) {
      return null;
    }

    if (withoutQuery.startsWith("/workspace-file/")) {
      return withoutQuery;
    }

    if (withoutQuery.startsWith("/workspace/")) {
      return withoutQuery;
    }

    if (withoutQuery.startsWith("./") || withoutQuery.startsWith("../")) {
      return null;
    }

    const normalizedRelativePath = withoutQuery.replace(/^\/+/, "");
    if (!normalizedRelativePath.includes("/")) {
      return null;
    }

    return "/workspace-file/" + normalizedRelativePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  };
  const handleWorkspaceViewerLink = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    const viewerPath = normalizeWorkspaceViewerPath(anchor.getAttribute("href"));
    if (!viewerPath) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    window.parent.postMessage({
      type: "lilo:open-viewer",
      viewerPath,
    }, "*");
  };
  const normalizeOsOpenTarget = (target) => {
    const raw = String(target || "").trim();
    if (!raw) {
      return null;
    }

    const viewerPath = normalizeWorkspaceViewerPath(raw);
    if (viewerPath) {
      return viewerPath;
    }

    return null;
  };

  const viewerPicker = (() => {
    let enabled = false;
    let hoveredElement = null;
    let highlight = null;
    let labelBubble = null;
    const persistentHighlights = [];

    const ensureOverlay = () => {
      if (highlight && labelBubble) {
        return;
      }

      highlight = document.createElement("div");
      highlight.style.position = "fixed";
      highlight.style.pointerEvents = "none";
      highlight.style.border = "2px solid rgba(96, 165, 250, 0.98)";
      highlight.style.background = "rgba(96, 165, 250, 0.18)";
      highlight.style.borderRadius = "10px";
      highlight.style.boxShadow = "0 0 0 1px rgba(15, 23, 42, 0.15)";
      highlight.style.zIndex = "2147483646";
      highlight.style.display = "none";

      labelBubble = document.createElement("div");
      labelBubble.style.position = "fixed";
      labelBubble.style.pointerEvents = "none";
      labelBubble.style.maxWidth = "min(28rem, calc(100vw - 1rem))";
      labelBubble.style.padding = "6px 12px";
      labelBubble.style.borderRadius = "9999px";
      labelBubble.style.border = "1px solid rgba(212, 212, 212, 0.95)";
      labelBubble.style.background = "rgba(255, 255, 255, 0.96)";
      labelBubble.style.color = "#404040";
      labelBubble.style.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
      labelBubble.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.12)";
      labelBubble.style.backdropFilter = "blur(8px)";
      labelBubble.style.zIndex = "2147483647";
      labelBubble.style.display = "none";

      document.body.appendChild(highlight);
      document.body.appendChild(labelBubble);
    };

    const hideOverlay = () => {
      hoveredElement = null;
      if (highlight) highlight.style.display = "none";
      if (labelBubble) labelBubble.style.display = "none";
    };

    const addPersistentHighlight = (element) => {
      const marker = document.createElement("div");
      marker.style.position = "fixed";
      marker.style.pointerEvents = "none";
      marker.style.border = "2px solid rgba(34, 197, 94, 0.85)";
      marker.style.background = "rgba(34, 197, 94, 0.08)";
      marker.style.borderRadius = "6px";
      marker.style.zIndex = "2147483645";
      marker.style.transition = "all 0.15s ease";
      document.body.appendChild(marker);
      persistentHighlights.push({ element, marker });
      repositionPersistentHighlights();
    };

    const repositionPersistentHighlights = () => {
      for (const entry of persistentHighlights) {
        if (!entry.element.isConnected) {
          entry.marker.style.display = "none";
          continue;
        }
        const rect = entry.element.getBoundingClientRect();
        entry.marker.style.display = "block";
        entry.marker.style.top = rect.top + "px";
        entry.marker.style.left = rect.left + "px";
        entry.marker.style.width = rect.width + "px";
        entry.marker.style.height = rect.height + "px";
      }
    };

    const clearPersistentHighlights = () => {
      for (const entry of persistentHighlights) {
        entry.marker.remove();
      }
      persistentHighlights.length = 0;
    };

    const updateOverlay = (element) => {
      if (!enabled || !element || !element.isConnected) {
        hideOverlay();
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        hideOverlay();
        return;
      }

      ensureOverlay();
      hoveredElement = element;

      highlight.style.display = "block";
      highlight.style.top = rect.top + "px";
      highlight.style.left = rect.left + "px";
      highlight.style.width = rect.width + "px";
      highlight.style.height = rect.height + "px";

      labelBubble.textContent = formatElementLabel(element);
      labelBubble.style.display = "block";
      labelBubble.style.top = Math.max(8, rect.top - 36) + "px";
      labelBubble.style.left = Math.max(8, rect.left) + "px";
    };

    const handleMouseMove = (event) => {
      updateOverlay(getSelectableElement(event.target));
    };

    const handleMouseOut = (event) => {
      if (!(event.relatedTarget instanceof Node)) {
        hideOverlay();
      }
    };

    const handleViewportChange = () => {
      updateOverlay(hoveredElement);
      repositionPersistentHighlights();
    };

    const handleClick = (event) => {
      if (!enabled) return;
      const element = getSelectableElement(event.target);
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      addPersistentHighlight(element);

      const label = formatElementLabel(element);
      const textPreview = normalizeSelectionText(element.textContent);

      window.parent.postMessage({
        type: "lilo:viewer-picker:selected",
        selection: {
          html: element.outerHTML,
          tagName: element.tagName.toLowerCase(),
          label,
          textPreview,
          previewUrl: createSelectionThumbnail(label, textPreview),
        },
      }, "*");

      setEnabled(false);
    };

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      clearPersistentHighlights();
      window.parent.postMessage({ type: "lilo:viewer-picker:cancelled" }, "*");
      setEnabled(false);
    };

    const setEnabled = (next) => {
      if (enabled === next) return;
      enabled = next;

      if (enabled) {
        document.addEventListener("mousemove", handleMouseMove, true);
        document.addEventListener("mouseout", handleMouseOut, true);
        document.addEventListener("click", handleClick, true);
        document.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("scroll", handleViewportChange, true);
        window.addEventListener("resize", handleViewportChange);
        document.documentElement.style.cursor = "crosshair";
        if (document.body) document.body.style.cursor = "crosshair";
        return;
      }

      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
      document.documentElement.style.removeProperty("cursor");
      if (document.body) document.body.style.removeProperty("cursor");
      hideOverlay();
    };

    return { setEnabled, clearPersistentHighlights };
  })();

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data) return;
    if (data.type === "lilo:viewer-picker:set-enabled") {
      viewerPicker.setEnabled(Boolean(data.enabled));
      return;
    }
    if (data.type === "lilo:viewer-picker:clear-highlights") {
      viewerPicker.clearPersistentHighlights();
      return;
    }
    if (
      data.type === "lilo:create-chat:response" ||
      data.type === "lilo:open-chat:response" ||
      data.type === "lilo:list-apps:response" ||
      data.type === "lilo:set-app-order:response" ||
      data.type === "lilo:set-app-archived:response"
    ) {
      settleOsAction(data);
    }
  });

  document.addEventListener("click", handleWorkspaceViewerLink, true);

  window.lilo.os = {
    async open(target) {
      const rawTarget = String(target || "").trim();
      let viewerPath = normalizeOsOpenTarget(rawTarget);
      if (!viewerPath && rawTarget && !rawTarget.includes("/") && !rawTarget.startsWith(".")) {
        const apps = await requestOsAction("lilo:list-apps").then((data) => data.apps || []);
        const matchingApp = apps.find((app) =>
          app &&
          typeof app === "object" &&
          app.name === rawTarget &&
          typeof app.viewerPath === "string",
        );
        viewerPath = matchingApp ? matchingApp.viewerPath : null;
      }
      if (!viewerPath) {
        throw new Error(
          "window.lilo.os.open currently supports only workspace apps and workspace file paths",
        );
      }

      window.parent.postMessage({
        type: "lilo:open-viewer",
        viewerPath,
      }, "*");
    },
    chat: {
      create(message, options = {}) {
        return requestOsAction("lilo:create-chat", {
          message: typeof message === "string" && message.trim() ? message : undefined,
          send: options.send === true,
          focus: options.focus !== false,
        });
      },
      open(chatId) {
        return requestOsAction("lilo:open-chat", { chatId });
      },
    },
    apps: {
      list() {
        return requestOsAction("lilo:list-apps").then((data) => data.apps || []);
      },
      setOrder(appNames) {
        if (!Array.isArray(appNames) || appNames.some((name) => typeof name !== "string")) {
          throw new Error("window.lilo.os.apps.setOrder expects an array of app names");
        }
        return requestOsAction("lilo:set-app-order", { appNames })
          .then((data) => data.apps || []);
      },
      setArchived(appName, archived) {
        if (typeof appName !== "string" || appName.trim().length === 0) {
          throw new Error("window.lilo.os.apps.setArchived expects a non-empty app name");
        }
        if (typeof archived !== "boolean") {
          throw new Error("window.lilo.os.apps.setArchived expects a boolean archived flag");
        }
        return requestOsAction("lilo:set-app-archived", {
          appName,
          archived,
        }).then((data) => data.app || null);
      },
    },
  };

  const fsBase = () => "/api/fs";
  const bytesToBase64 = (value) => {
    let binary = "";
    for (let index = 0; index < value.length; index += 1) {
      binary += String.fromCharCode(value[index]);
    }
    return btoa(binary);
  };
  const base64ToBytes = (value) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  };
  const toFsPayloadData = (value) => {
    if (typeof value === "string") {
      return { kind: "text", text: value };
    }
    if (value instanceof Uint8Array) {
      return { kind: "base64", base64: bytesToBase64(value) };
    }
    if (value instanceof ArrayBuffer) {
      return { kind: "base64", base64: bytesToBase64(new Uint8Array(value)) };
    }
    if (ArrayBuffer.isView(value)) {
      return {
        kind: "base64",
        base64: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    }
    throw new Error(
      "window.lilo.fs only accepts strings, Uint8Array, ArrayBuffer, or ArrayBufferView for file contents",
    );
  };

  window.lilo.fs = {
    async read(path, options = {}) {
      const payload = await jsonFetch(fsBase() + "/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          path,
          encoding: options.as === "bytes" || options.encoding === null
            ? null
            : options.encoding || "utf8",
        }),
      });
      if (payload.kind === "base64") {
        return base64ToBytes(payload.base64 || "");
      }
      return payload.text || "";
    },
    async write(path, value) {
      await jsonFetch(fsBase() + "/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, path, data: toFsPayloadData(value) }),
      });
    },
    async append(path, value) {
      await jsonFetch(fsBase() + "/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, path, data: toFsPayloadData(value) }),
      });
    },
    async delete(path, options = {}) {
      await jsonFetch(fsBase() + "/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, path, recursive: options.recursive === true }),
      });
    },
    async rename(fromPath, toPath) {
      await jsonFetch(fsBase() + "/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, fromPath, toPath }),
      });
    },
    async list(dir = ".", options = {}) {
      const payload = await jsonFetch(fsBase() + "/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, path: dir, recursive: options.recursive === true }),
      });
      return payload.entries || [];
    },
    async stat(path) {
      const payload = await jsonFetch(fsBase() + "/stat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, path }),
      });
      return payload.stat;
    },
    async mkdir(path, options = {}) {
      const payload = await jsonFetch(fsBase() + "/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName, path, recursive: options.recursive !== false }),
      });
      return payload.path;
    },
  };

  const netBase = () => "/api/net";
  const netSocketUrl = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + window.location.host + "/ws/net";
  };
  const serializeHeaders = (headers) => {
    if (!headers) return {};
    return Object.fromEntries(new Headers(headers).entries());
  };
  const serializeNetBody = async (value) => {
    if (value == null) {
      return null;
    }
    if (typeof value === "string") {
      return { kind: "text", text: value };
    }
    if (value instanceof URLSearchParams) {
      return { kind: "searchParams", entries: Array.from(value.entries()) };
    }
    if (value instanceof FormData) {
      const entries = [];
      for (const [name, entryValue] of value.entries()) {
        if (typeof entryValue === "string") {
          entries.push({ name, kind: "text", value: entryValue });
          continue;
        }
        const fileBytes = new Uint8Array(await entryValue.arrayBuffer());
        entries.push({
          name,
          kind: "file",
          filename: entryValue.name || "blob",
          mediaType: entryValue.type || "application/octet-stream",
          base64: bytesToBase64(fileBytes),
        });
      }
      return { kind: "formData", entries };
    }
    if (value instanceof Blob) {
      return {
        kind: "base64",
        base64: bytesToBase64(new Uint8Array(await value.arrayBuffer())),
      };
    }
    if (value instanceof Uint8Array) {
      return { kind: "base64", base64: bytesToBase64(value) };
    }
    if (value instanceof ArrayBuffer) {
      return { kind: "base64", base64: bytesToBase64(new Uint8Array(value)) };
    }
    if (ArrayBuffer.isView(value)) {
      return {
        kind: "base64",
        base64: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    }
    throw new Error(
      "window.lilo.net.fetch only supports string, URLSearchParams, FormData, Blob, Uint8Array, ArrayBuffer, or ArrayBufferView request bodies",
    );
  };

  window.lilo.net = {
    async fetch(url, init = {}) {
      const serializedBody = await serializeNetBody(init.body);
      const serializedHeaders = serializeHeaders(init.headers);
      if (serializedBody && serializedBody.kind === "formData") {
        delete serializedHeaders["content-type"];
        delete serializedHeaders["Content-Type"];
      }
      return fetch(netBase() + "/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          url,
          init: {
            method: init.method,
            headers: serializedHeaders,
            body: serializedBody,
            redirect: init.redirect,
          },
        }),
        signal: init.signal,
      });
    },
    async websocket(url, protocols) {
      const browserSocket = new WebSocket(netSocketUrl());

      return await new Promise((resolve, reject) => {
        const listeners = new Map();
        const addListener = (type, handler) => {
          const current = listeners.get(type) || new Set();
          current.add(handler);
          listeners.set(type, current);
        };
        const removeListener = (type, handler) => {
          const current = listeners.get(type);
          if (!current) return;
          current.delete(handler);
        };
        const dispatch = (type, event) => {
          const current = listeners.get(type);
          if (current) {
            for (const handler of current) handler(event);
          }
          const propertyHandler = socketLike["on" + type];
          if (typeof propertyHandler === "function") {
            propertyHandler(event);
          }
        };
        const normalizeCloseEvent = (payload) => ({
          type: "close",
          code: typeof payload.code === "number" ? payload.code : 1006,
          reason: typeof payload.reason === "string" ? payload.reason : "",
          wasClean: Boolean(payload.wasClean),
        });
        const normalizeMessageEvent = (payload) => ({
          type: "message",
          data: payload.data?.kind === "base64"
            ? base64ToBytes(payload.data.base64 || "")
            : payload.data?.text || "",
        });
        const socketLike = {
          url,
          protocol: "",
          readyState: WebSocket.CONNECTING,
          CONNECTING: WebSocket.CONNECTING,
          OPEN: WebSocket.OPEN,
          CLOSING: WebSocket.CLOSING,
          CLOSED: WebSocket.CLOSED,
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
          addEventListener(type, handler) {
            addListener(type, handler);
          },
          removeEventListener(type, handler) {
            removeListener(type, handler);
          },
          send(data) {
            if (browserSocket.readyState !== WebSocket.OPEN || socketLike.readyState !== WebSocket.OPEN) {
              throw new Error("WebSocket is not open");
            }
            if (typeof data === "string") {
              browserSocket.send(JSON.stringify({ type: "send", data: { kind: "text", text: data } }));
              return;
            }
            if (data instanceof Uint8Array) {
              browserSocket.send(JSON.stringify({ type: "send", data: { kind: "base64", base64: bytesToBase64(data) } }));
              return;
            }
            if (data instanceof ArrayBuffer) {
              browserSocket.send(JSON.stringify({
                type: "send",
                data: { kind: "base64", base64: bytesToBase64(new Uint8Array(data)) },
              }));
              return;
            }
            if (ArrayBuffer.isView(data)) {
              browserSocket.send(JSON.stringify({
                type: "send",
                data: {
                  kind: "base64",
                  base64: bytesToBase64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
                },
              }));
              return;
            }
            throw new Error("window.lilo.net.websocket.send only supports string, Uint8Array, ArrayBuffer, or ArrayBufferView");
          },
          close(code, reason) {
            if (socketLike.readyState === WebSocket.CLOSING || socketLike.readyState === WebSocket.CLOSED) {
              return;
            }
            socketLike.readyState = WebSocket.CLOSING;
            if (browserSocket.readyState === WebSocket.OPEN) {
              browserSocket.send(JSON.stringify({ type: "close", code, reason }));
            } else {
              browserSocket.close();
            }
          },
        };

        let settled = false;
        const fail = (message) => {
          if (!settled) {
            settled = true;
            reject(new Error(message));
          } else {
            dispatch("error", { type: "error", message });
          }
        };

        browserSocket.addEventListener("open", () => {
          browserSocket.send(JSON.stringify({
            type: "connect",
            appName,
            url,
            protocols: Array.isArray(protocols) ? protocols : protocols ? [protocols] : undefined,
          }));
        });

        browserSocket.addEventListener("message", (event) => {
          let payload = null;
          try {
            payload = JSON.parse(String(event.data || ""));
          } catch {
            fail("Invalid websocket proxy payload");
            return;
          }

          if (payload.type === "open") {
            socketLike.readyState = WebSocket.OPEN;
            socketLike.protocol = typeof payload.protocol === "string" ? payload.protocol : "";
            if (!settled) {
              settled = true;
              resolve(socketLike);
            }
            dispatch("open", { type: "open" });
            return;
          }

          if (payload.type === "message") {
            dispatch("message", normalizeMessageEvent(payload));
            return;
          }

          if (payload.type === "error") {
            fail(typeof payload.message === "string" ? payload.message : "WebSocket proxy error");
            return;
          }

          if (payload.type === "close") {
            socketLike.readyState = WebSocket.CLOSED;
            dispatch("close", normalizeCloseEvent(payload));
            browserSocket.close();
          }
        });

        browserSocket.addEventListener("error", () => {
          fail("Failed to connect websocket proxy");
        });

        browserSocket.addEventListener("close", () => {
          if (socketLike.readyState !== WebSocket.CLOSED) {
            socketLike.readyState = WebSocket.CLOSED;
            dispatch("close", {
              type: "close",
              code: 1006,
              reason: "",
              wasClean: false,
            });
          }
          if (!settled) {
            settled = true;
            reject(new Error("WebSocket proxy closed before the upstream connection opened"));
          }
        });
      });
    },
  };

  const shellBase = () => "/api/shell";
  window.lilo.shell = {
    async exec(command, options = {}) {
      const payload = await jsonFetch(shellBase() + "/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          command,
          cwd: options.cwd,
          env: options.env,
          timeoutMs: options.timeoutMs,
        }),
      });

      const runId = payload.runId;
      const emitter = createEmitter();
      let finishedResolved = false;
      let resolveFinished;
      let rejectFinished;
      const finished = new Promise((resolve, reject) => {
        resolveFinished = resolve;
        rejectFinished = reject;
      });

      const streamPromise = (async () => {
        const response = await fetch(
          shellBase() + "/runs/" + encodeURIComponent(runId) + "/events",
          {
            method: "GET",
            headers: { Accept: "text/event-stream" },
          },
        );

        if (!response.ok) {
          let message = "Shell stream request failed";
          try {
            const streamPayload = await response.json();
            message = streamPayload.error || streamPayload.details || message;
          } catch {}
          throw new Error(message);
        }

        if (!response.body) {
          throw new Error("Shell stream response did not include a stream body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundaryIndex = buffer.indexOf("\n\n");
          while (boundaryIndex >= 0) {
            const block = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);
            const parsed = parseSseBlock(block);
            if (parsed) {
              const eventPayload = safeParse(parsed.data);
              if (parsed.event === "stdout" || parsed.event === "stderr") {
                emitter.emit(parsed.event, eventPayload.text || "");
              } else if (parsed.event === "error") {
                const error = new Error(eventPayload.message || "Shell command failed");
                emitter.emit("error", error);
                if (!finishedResolved) {
                  finishedResolved = true;
                  rejectFinished(error);
                }
              } else if (parsed.event === "exit") {
                emitter.emit("exit", eventPayload);
                if (!finishedResolved) {
                  finishedResolved = true;
                  resolveFinished(eventPayload);
                }
              }
            }
            boundaryIndex = buffer.indexOf("\n\n");
          }
        }

        const trailing = parseSseBlock(buffer);
        if (trailing) {
          const eventPayload = safeParse(trailing.data);
          if (trailing.event === "stdout" || trailing.event === "stderr") {
            emitter.emit(trailing.event, eventPayload.text || "");
          } else if (trailing.event === "error") {
            const error = new Error(eventPayload.message || "Shell command failed");
            emitter.emit("error", error);
            if (!finishedResolved) {
              finishedResolved = true;
              rejectFinished(error);
            }
          } else if (trailing.event === "exit") {
            emitter.emit("exit", eventPayload);
            if (!finishedResolved) {
              finishedResolved = true;
              resolveFinished(eventPayload);
            }
          }
        }
      })().catch((error) => {
        emitter.emit("error", error);
        if (!finishedResolved) {
          finishedResolved = true;
          rejectFinished(error);
        }
      });

      return {
        runId,
        on: emitter.on,
        finished,
        async kill() {
          await jsonFetch(shellBase() + "/runs/" + encodeURIComponent(runId) + "/kill", {
            method: "POST",
          });
        },
      };
    },
  };

  window.lilo.agent = {
    async createSession(options = {}) {
      return jsonFetch(agentBase() + "/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
    },
    async listSessions() {
      const payload = await jsonFetch(agentBase() + "/sessions");
      return payload.sessions || [];
    },
    async getSession(sessionId) {
      const payload = await jsonFetch(
        agentBase() + "/sessions/" + encodeURIComponent(sessionId),
      );
      return payload.session;
    },
    async stop(sessionId) {
      await jsonFetch(
        agentBase() + "/sessions/" + encodeURIComponent(sessionId) + "/stop",
        {
        method: "POST",
        },
      );
    },
    async prompt(sessionId, input) {
      const emitter = createEmitter();
      const finished = (async () => {
        const response = await fetch(
          agentBase() + "/sessions/" + encodeURIComponent(sessionId) + "/messages",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );

        if (!response.ok) {
          let message = "Prompt request failed";
          try {
            const payload = await response.json();
            message = payload.error || payload.details || message;
          } catch {}
          throw new Error(message);
        }

        if (!response.body) {
          throw new Error("Prompt response did not include a stream body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalText = "";
        let completion = { reason: "completed", finalText: "" };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundaryIndex = buffer.indexOf("\n\n");
          while (boundaryIndex >= 0) {
            const block = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);
            const parsed = parseSseBlock(block);
            if (parsed) {
              const payload = safeParse(parsed.data);
              if (parsed.event === "text_delta" && typeof payload.delta === "string") {
                finalText += payload.delta;
              }
              if (parsed.event === "done") {
                completion = {
                  reason: payload.reason || "completed",
                  finalText: typeof payload.finalText === "string" ? payload.finalText : finalText,
                };
              }
              emitter.emit(parsed.event, payload);
            }
            boundaryIndex = buffer.indexOf("\n\n");
          }
        }

        const trailing = parseSseBlock(buffer);
        if (trailing) {
          const payload = safeParse(trailing.data);
          emitter.emit(trailing.event, payload);
          if (trailing.event === "done") {
            completion = {
              reason: payload.reason || "completed",
              finalText: typeof payload.finalText === "string" ? payload.finalText : finalText,
            };
          }
        }

        return completion;
      })();

      return {
        on: emitter.on,
        finished,
      };
    },
  };
})();`;

const injectRuntimeIntoHtml = (html: string, appName: string): string => {
  const bootstrap = [
    `<script>window.__LILO_APP__=${JSON.stringify({ appName })};</script>`,
    `<script src="/workspace-runtime/lilo-agent.js"></script>`,
  ].join("");

  if (html.includes("</head>")) {
    return html.replace("</head>", `${bootstrap}</head>`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${bootstrap}`);
  }

  return `${bootstrap}${html}`;
};

const resolveWorkspacePath = (appName: string, filePath: string): string | null => {
  if (appName.includes("..") || filePath.includes("..")) {
    return null;
  }

  const normalizedFilePath = filePath.trim().length > 0 ? filePath : "index.html";
  const appRoot = getWorkspaceAppDefinitionSync(appName)?.rootPath;
  if (!appRoot) {
    return null;
  }

  const absolutePath = resolve(appRoot, normalizedFilePath);
  if (!absolutePath.startsWith(appRoot)) {
    return null;
  }

  return absolutePath;
};

const resolveWorkspaceFilePath = (filePath: string): string | null => {
  if (filePath.includes("..")) {
    return null;
  }

  const trimmedFilePath = filePath.trim();
  if (trimmedFilePath.length === 0) {
    return null;
  }

  const segments = trimmedFilePath.split("/").filter(Boolean);
  if (
    segments.some((segment, index) =>
      shouldSkipWorkspaceEntry(segment, index < segments.length - 1),
    )
  ) {
    return null;
  }

  const absolutePath = resolve(WORKSPACE_ROOT, trimmedFilePath);
  if (!absolutePath.startsWith(WORKSPACE_ROOT)) {
    return null;
  }

  return absolutePath;
};

const isProtectedWorkspaceRelativePath = (relativePath: string): boolean => {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.some((segment, index) =>
    shouldSkipWorkspaceEntry(segment, index < segments.length - 1),
  );
};

const toWorkspaceRelativePath = (absolutePath: string): string =>
  relative(WORKSPACE_ROOT, absolutePath).split("\\").join("/");

const resolveWorkspaceFsPath = (appName: string, inputPath: string): string | null => {
  const appRoot = getWorkspaceAppDefinitionSync(appName)?.rootPath;
  if (!appRoot) {
    return null;
  }

  const rawPath = String(inputPath || "").trim();
  const absolutePath = rawPath.startsWith("/")
    ? resolve(WORKSPACE_ROOT, `.${rawPath}`)
    : resolve(appRoot, rawPath || ".");

  if (!absolutePath.startsWith(WORKSPACE_ROOT)) {
    return null;
  }

  if (isProtectedWorkspaceRelativePath(toWorkspaceRelativePath(absolutePath))) {
    return null;
  }

  return absolutePath;
};

const resolveWorkspaceShellCwd = (appName: string, inputPath?: string): string | null => {
  const appRoot = getWorkspaceAppDefinitionSync(appName)?.rootPath;
  if (!appRoot) {
    return null;
  }

  const rawPath = String(inputPath || "").trim();
  const absolutePath = rawPath.startsWith("/")
    ? resolve(WORKSPACE_ROOT, `.${rawPath}`)
    : resolve(appRoot, rawPath || ".");

  if (!absolutePath.startsWith(WORKSPACE_ROOT)) {
    return null;
  }

  if (isProtectedWorkspaceRelativePath(toWorkspaceRelativePath(absolutePath))) {
    return null;
  }

  return absolutePath;
};

const isProtectedWorkspaceRootTarget = (appName: string, absolutePath: string): boolean => {
  const appRoot = getWorkspaceAppDefinitionSync(appName)?.rootPath ?? null;
  return absolutePath === WORKSPACE_ROOT || absolutePath === appRoot;
};

const isSupportedNetworkUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const buildProxiedRequestBody = (payload: NetworkBodyPayload | null | undefined): BodyInit | undefined => {
  if (!payload) {
    return undefined;
  }

  if (payload.kind === "text") {
    return payload.text;
  }

  if (payload.kind === "base64") {
    return Buffer.from(payload.base64, "base64");
  }

  if (payload.kind === "searchParams") {
    return new URLSearchParams(payload.entries);
  }

  if (payload.kind === "formData") {
    const formData = new FormData();
    for (const entry of payload.entries) {
      if (entry.kind === "text") {
        formData.append(entry.name, entry.value);
        continue;
      }

      formData.append(
        entry.name,
        new Blob([Buffer.from(entry.base64, "base64")], { type: entry.mediaType || "application/octet-stream" }),
        entry.filename,
      );
    }
    return formData;
  }

  return undefined;
};

const toWorkspaceFsStat = async (absolutePath: string): Promise<WorkspaceFsStat> => {
  const info = await stat(absolutePath);
  return {
    path: toWorkspaceRelativePath(absolutePath),
    name: basename(absolutePath),
    type: info.isDirectory() ? "directory" : "file",
    size: info.size,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
  };
};

const listWorkspaceFsEntries = async (
  absoluteDirPath: string,
  recursive: boolean,
): Promise<WorkspaceFsListEntry[]> => {
  const dirEntries = sortDirEntries(
    (await readdir(absoluteDirPath, { withFileTypes: true })).filter(
      (entry) => !shouldSkipWorkspaceEntry(entry.name, entry.isDirectory()),
    ),
  );

  const results: WorkspaceFsListEntry[] = [];
  for (const entry of dirEntries) {
    const childAbsolutePath = resolve(absoluteDirPath, entry.name);
    const info = await stat(childAbsolutePath);
    results.push({
      name: entry.name,
      path: toWorkspaceRelativePath(childAbsolutePath),
      type: entry.isDirectory() ? "directory" : "file",
      size: info.size,
      mtimeMs: info.mtimeMs,
    });

    if (recursive && entry.isDirectory()) {
      results.push(...(await listWorkspaceFsEntries(childAbsolutePath, true)));
    }
  }

  return results;
};

export const registerWorkspaceRoutes = (app: Hono): void => {
  app.get("/workspace-runtime/lilo-agent.js", () =>
    new Response(LILO_AGENT_RUNTIME, {
      status: 200,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    }),
  );

  app.get("/workspace/apps", async (c) => {
    if (!existsSync(WORKSPACE_ROOT)) {
      return c.json({
        apps: [],
        files: [],
        entries: [],
        preferences: { timeZone: DEFAULT_WORKSPACE_TIME_ZONE },
      });
    }

    const prefs = await readWorkspaceAppPrefs(WORKSPACE_ROOT);
    const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
    const apps: WorkspaceAppRecord[] = (await listWorkspaceApps())
      .filter((app) => app.name !== PINNED_APP_NAME)
      .map((app) => ({
        name: app.name,
        displayName: app.displayName,
        description: app.description,
        href: app.rootHref,
        viewerPath: app.viewerPath,
        iconHref: app.iconHref,
        archived: prefs.archivedAppNames.includes(app.name) || undefined,
      }));
    const files: WorkspaceLegacyFile[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const appRoot = resolve(WORKSPACE_ROOT, entry.name);
      const dirFiles = await readdir(appRoot, { withFileTypes: true });

      for (const file of dirFiles) {
        if (!file.isFile()) continue;
        const ext = extname(file.name).toLowerCase();
        if (ext === ".html" || ext === ".md") {
          files.push({
            name: file.name,
            path: `/workspace/${entry.name}/${file.name}`,
            type: ext === ".html" ? "html" : "md",
            dir: entry.name,
          });
        }
      }
    }

    const sortedApps = sortAppsBySavedOrder(apps, prefs.appNames);
    const workspaceGitUrl = getSafeWorkspaceGitUrl();
    const workspaceGitBrowserUrl = getWorkspaceGitBrowserUrl();
    const templateUpdates = getWorkspaceTemplateUpdates(
      WORKSPACE_ROOT,
      WORKSPACE_TEMPLATE_DIR,
      sortedApps,
    );
    return c.json({
      apps: sortedApps,
      files,
      entries: await collectWorkspaceEntries(sortedApps),
      templateUpdates,
      preferences: {
        timeZone: prefs.timeZone ?? DEFAULT_WORKSPACE_TIME_ZONE,
        ...(prefs.defaultChatModelSelection
          ? { defaultChatModelSelection: prefs.defaultChatModelSelection }
          : {}),
        automationOutputChannel: prefs.automationOutputChannel,
        ...(workspaceGitUrl ? { gitRemoteUrl: workspaceGitUrl } : {}),
        ...(workspaceGitBrowserUrl ? { gitBrowserUrl: workspaceGitBrowserUrl } : {}),
      },
    });
  });

  app.post("/workspace/template-updates/:appName/dismiss", async (c) => {
    const appName = c.req.param("appName");
    const result = dismissWorkspaceTemplateUpdate(
      WORKSPACE_ROOT,
      WORKSPACE_TEMPLATE_DIR,
      appName,
    );

    if (!result) {
      return c.json({ error: "Template app not found" }, 404);
    }

    return c.json(result);
  });

  app.get("/workspace-file/:filePath{.+}", async (c) => {
    const filePath = c.req.param("filePath");
    const absolutePath = resolveWorkspaceFilePath(filePath);
    const viewerPath = buildRawWorkspaceFilePath(filePath);

    if (!absolutePath) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    if (isTopLevelDocumentNavigation(c.req.raw)) {
      return c.redirect(buildViewerDeepLinkPath(viewerPath), 302);
    }

    try {
      const info = await stat(absolutePath);
      if (!info.isFile()) {
        return c.json({ error: "Not a file" }, 404);
      }

      const headers = workspaceFileHeaders(absolutePath, info);
      if (isWorkspaceFileNotModified(c.req.raw, info)) {
        return new Response(null, {
          status: 304,
          headers,
        });
      }

      const content = await readFile(absolutePath);
      return new Response(content, {
        status: 200,
        headers,
      });
    } catch {
      return c.json({ error: "File not found" }, 404);
    }
  });

  app.put("/workspace-file/:filePath{.+}", async (c) => {
    const filePath = c.req.param("filePath");
    const absolutePath = resolveWorkspaceFilePath(filePath);

    if (!absolutePath) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    let body: { text?: unknown } | null;
    try {
      body = (await c.req.json()) as { text?: unknown };
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body?.text !== "string") {
      return c.json({ error: "Missing text content" }, 400);
    }

    try {
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, body.text, "utf8");
      return c.json({ ok: true });
    } catch (error) {
      return c.json(
        {
          error: "Failed to write file",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.put("/workspace/app-order", async (c) => {
    try {
      const body = (await c.req.json()) as { appNames?: unknown };
      if (!Array.isArray(body.appNames)) {
        return c.json({ error: "appNames must be an array" }, 400);
      }

      const validApps = (await listWorkspaceApps()).map((app) => app.name);

      const requested = body.appNames.filter((value): value is string => typeof value === "string");
      const requestedUnique = [...new Set(requested)].filter((name) => validApps.includes(name));
      const remaining = validApps.filter((name) => !requestedUnique.includes(name)).sort();
      const appNames = [...requestedUnique, ...remaining];

      const prefs = await readWorkspaceAppPrefs(WORKSPACE_ROOT);
      await writeWorkspaceConfig({
        appNames,
        archivedAppNames: prefs.archivedAppNames.filter((name) => validApps.includes(name)),
        timeZone: prefs.timeZone,
        defaultChatModelSelection: prefs.defaultChatModelSelection,
        automationOutputChannel: prefs.automationOutputChannel,
      });
      return c.json({ ok: true, appNames });
    } catch (error) {
      return c.json(
        {
          error: "Failed to save app order",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.put("/workspace/app-archive", async (c) => {
    try {
      const body = (await c.req.json()) as { archivedAppNames?: unknown };
      if (!Array.isArray(body.archivedAppNames)) {
        return c.json({ error: "archivedAppNames must be an array" }, 400);
      }

      const validApps = (await listWorkspaceApps()).map((app) => app.name);

      const archivedAppNames = [...new Set(
        body.archivedAppNames.filter((value): value is string => typeof value === "string"),
      )].filter((name) => validApps.includes(name));
      const prefs = await readWorkspaceAppPrefs(WORKSPACE_ROOT);

      await writeWorkspaceConfig({
        appNames: prefs.appNames.filter((name) => validApps.includes(name)),
        archivedAppNames,
        timeZone: prefs.timeZone,
        defaultChatModelSelection: prefs.defaultChatModelSelection,
        automationOutputChannel: prefs.automationOutputChannel,
      });

      return c.json({ ok: true, archivedAppNames });
    } catch (error) {
      return c.json(
        {
          error: "Failed to save app archive state",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.put("/workspace/preferences", async (c) => {
    try {
      const body = (await c.req.json()) as {
        timeZone?: unknown;
        defaultChatModelSelection?: unknown;
        automationOutputChannel?: unknown;
      };
      const prefs = await readWorkspaceAppPrefs(WORKSPACE_ROOT);

      let timeZone = prefs.timeZone;
      if (body.timeZone !== undefined) {
        if (typeof body.timeZone !== "string" || body.timeZone.trim().length === 0) {
          return c.json({ error: "timeZone must be a non-empty string" }, 400);
        }

        try {
          new Intl.DateTimeFormat("en-US", { timeZone: body.timeZone });
        } catch {
          return c.json({ error: "Invalid timeZone" }, 400);
        }

        timeZone = body.timeZone;
      }

      let defaultChatModelSelection = prefs.defaultChatModelSelection;
      if (body.defaultChatModelSelection !== undefined) {
        if (!isSupportedChatModelSelection(body.defaultChatModelSelection)) {
          return c.json({ error: "Invalid default chat model selection" }, 400);
        }

        defaultChatModelSelection = body.defaultChatModelSelection;
      }

      let automationOutputChannel = prefs.automationOutputChannel;
      if (body.automationOutputChannel !== undefined) {
        if (!isAutomationOutputChannel(body.automationOutputChannel)) {
          return c.json({ error: "Invalid automation output channel" }, 400);
        }

        automationOutputChannel = body.automationOutputChannel;
      }

      await writeWorkspaceConfig({
        appNames: prefs.appNames,
        archivedAppNames: prefs.archivedAppNames,
        timeZone,
        defaultChatModelSelection,
        automationOutputChannel,
      });

      return c.json({
        ok: true,
        timeZone,
        defaultChatModelSelection,
        automationOutputChannel,
      });
    } catch (error) {
      return c.json(
        {
          error: "Failed to save workspace preferences",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/fs/read", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      path?: unknown;
      encoding?: unknown;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const path = typeof body?.path === "string" ? body.path : ".";
    const encoding =
      typeof body?.encoding === "string" && body.encoding.trim().length > 0
        ? body.encoding
        : body?.encoding === null
          ? null
          : "utf8";
    const absolutePath = resolveWorkspaceFsPath(appName, path);

    if (!absolutePath) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    try {
      const info = await stat(absolutePath);
      if (!info.isFile()) {
        return c.json({ error: "Not a file" }, 404);
      }

      if (encoding === null) {
        const content = await readFile(absolutePath);
        return c.json({
          kind: "base64",
          base64: content.toString("base64"),
          path: toWorkspaceRelativePath(absolutePath),
        });
      }

      const content = await readFile(absolutePath, "utf8");
      return c.json({
        kind: "text",
        text: content,
        path: toWorkspaceRelativePath(absolutePath),
      });
    } catch {
      return c.json({ error: "File not found" }, 404);
    }
  });

  app.post("/api/fs/write", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      path?: unknown;
      data?: { kind?: unknown; text?: unknown; base64?: unknown } | null;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const path = typeof body?.path === "string" ? body.path : "";
    const absolutePath = resolveWorkspaceFsPath(appName, path);

    if (!absolutePath || path.trim().length === 0) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    const payload = body?.data;
    if (!payload || typeof payload.kind !== "string") {
      return c.json({ error: "Missing file contents" }, 400);
    }

    try {
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      if (payload.kind === "text" && typeof payload.text === "string") {
        await writeFile(absolutePath, payload.text, "utf8");
      } else if (payload.kind === "base64" && typeof payload.base64 === "string") {
        await writeFile(absolutePath, Buffer.from(payload.base64, "base64"));
      } else {
        return c.json({ error: "Invalid file contents" }, 400);
      }

      return c.json({ ok: true, path: toWorkspaceRelativePath(absolutePath) });
    } catch (error) {
      return c.json(
        {
          error: "Failed to write file",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/fs/append", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      path?: unknown;
      data?: { kind?: unknown; text?: unknown; base64?: unknown } | null;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const path = typeof body?.path === "string" ? body.path : "";
    const absolutePath = resolveWorkspaceFsPath(appName, path);

    if (!absolutePath || path.trim().length === 0) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    const payload = body?.data;
    if (!payload || typeof payload.kind !== "string") {
      return c.json({ error: "Missing file contents" }, 400);
    }

    try {
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      if (payload.kind === "text" && typeof payload.text === "string") {
        await appendFile(absolutePath, payload.text, "utf8");
      } else if (payload.kind === "base64" && typeof payload.base64 === "string") {
        await appendFile(absolutePath, Buffer.from(payload.base64, "base64"));
      } else {
        return c.json({ error: "Invalid file contents" }, 400);
      }

      return c.json({ ok: true, path: toWorkspaceRelativePath(absolutePath) });
    } catch (error) {
      return c.json(
        {
          error: "Failed to append file",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/fs/delete", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      path?: unknown;
      recursive?: unknown;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const path = typeof body?.path === "string" ? body.path : "";
    const recursive = body?.recursive === true;
    const absolutePath = resolveWorkspaceFsPath(appName, path);

    if (!absolutePath || path.trim().length === 0) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }
    if (isProtectedWorkspaceRootTarget(appName, absolutePath)) {
      return c.json({ error: "Refusing to delete a protected workspace root" }, 400);
    }

    try {
      const info = await stat(absolutePath);
      if (info.isDirectory()) {
        await rm(absolutePath, { recursive, force: false });
      } else {
        await unlink(absolutePath);
      }
      return c.json({ ok: true });
    } catch (error) {
      return c.json(
        {
          error: "Failed to delete path",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/fs/rename", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      fromPath?: unknown;
      toPath?: unknown;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const fromPath = typeof body?.fromPath === "string" ? body.fromPath : "";
    const toPath = typeof body?.toPath === "string" ? body.toPath : "";
    const fromAbsolutePath = resolveWorkspaceFsPath(appName, fromPath);
    const toAbsolutePath = resolveWorkspaceFsPath(appName, toPath);

    if (!fromAbsolutePath || !toAbsolutePath || fromPath.trim().length === 0 || toPath.trim().length === 0) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }
    if (
      isProtectedWorkspaceRootTarget(appName, fromAbsolutePath) ||
      isProtectedWorkspaceRootTarget(appName, toAbsolutePath)
    ) {
      return c.json({ error: "Refusing to rename a protected workspace root" }, 400);
    }

    try {
      await mkdir(resolve(toAbsolutePath, ".."), { recursive: true });
      await rename(fromAbsolutePath, toAbsolutePath);
      return c.json({
        ok: true,
        fromPath: toWorkspaceRelativePath(fromAbsolutePath),
        toPath: toWorkspaceRelativePath(toAbsolutePath),
      });
    } catch (error) {
      return c.json(
        {
          error: "Failed to rename path",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/fs/list", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      path?: unknown;
      recursive?: unknown;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const path = typeof body?.path === "string" ? body.path : ".";
    const recursive = body?.recursive === true;
    const absolutePath = resolveWorkspaceFsPath(appName, path);

    if (!absolutePath) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    try {
      const info = await stat(absolutePath);
      if (!info.isDirectory()) {
        return c.json({ error: "Not a directory" }, 404);
      }

      return c.json({
        path: toWorkspaceRelativePath(absolutePath),
        entries: await listWorkspaceFsEntries(absolutePath, recursive),
      });
    } catch {
      return c.json({ error: "Directory not found" }, 404);
    }
  });

  app.post("/api/fs/stat", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      path?: unknown;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const path = typeof body?.path === "string" ? body.path : ".";
    const absolutePath = resolveWorkspaceFsPath(appName, path);

    if (!absolutePath) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    try {
      return c.json({ stat: await toWorkspaceFsStat(absolutePath) });
    } catch {
      return c.json({ error: "Path not found" }, 404);
    }
  });

  app.post("/api/fs/mkdir", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      path?: unknown;
      recursive?: unknown;
    } | null;
    const appName = typeof body?.appName === "string" ? body.appName : "";
    const path = typeof body?.path === "string" ? body.path : "";
    const recursive = body?.recursive !== false;
    const absolutePath = resolveWorkspaceFsPath(appName, path);

    if (!absolutePath || path.trim().length === 0) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    try {
      await mkdir(absolutePath, { recursive });
      return c.json({ ok: true, path: toWorkspaceRelativePath(absolutePath) });
    } catch (error) {
      return c.json(
        {
          error: "Failed to create directory",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/net/fetch", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      url?: unknown;
      init?: {
        method?: unknown;
        headers?: unknown;
        body?: NetworkBodyPayload | null;
        redirect?: unknown;
      } | null;
    } | null;

    const appName = typeof body?.appName === "string" ? body.appName : "";
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!getWorkspaceAppDefinitionSync(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    if (!isSupportedNetworkUrl(url)) {
      return c.json({ error: "Only http and https URLs are supported" }, 400);
    }

    const method =
      typeof body?.init?.method === "string" && body.init.method.trim().length > 0
        ? body.init.method.toUpperCase()
        : "GET";

    const headers = new Headers();
    if (body?.init?.headers && typeof body.init.headers === "object" && !Array.isArray(body.init.headers)) {
      for (const [key, value] of Object.entries(body.init.headers as Record<string, unknown>)) {
        if (typeof value === "string") {
          headers.set(key, value);
        }
      }
    }

    const requestInit: RequestInit = {
      method,
      headers,
      redirect:
        body?.init?.redirect === "error" || body?.init?.redirect === "manual"
          ? body.init.redirect
          : "follow",
      body: method === "GET" || method === "HEAD"
        ? undefined
        : buildProxiedRequestBody(body?.init?.body),
    };

    try {
      const upstream = await fetch(url, requestInit);
      const responseHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      });
      responseHeaders.set("x-lilo-net-target-url", upstream.url || url);
      responseHeaders.set("x-lilo-net-target-status", String(upstream.status));

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return c.json(
        {
          error: "Network proxy request failed",
          details: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }
  });

  app.post("/api/shell/exec", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      appName?: unknown;
      command?: unknown;
      cwd?: unknown;
      env?: unknown;
      timeoutMs?: unknown;
    } | null;

    const appName = typeof body?.appName === "string" ? body.appName : "";
    const command = typeof body?.command === "string" ? body.command : "";
    const cwd = resolveWorkspaceShellCwd(
      appName,
      typeof body?.cwd === "string" ? body.cwd : undefined,
    );

    if (!getWorkspaceAppDefinitionSync(appName)) {
      return c.json({ error: "Workspace app not found" }, 404);
    }

    if (!cwd) {
      return c.json({ error: "Invalid shell cwd" }, 400);
    }

    if (command.trim().length === 0) {
      return c.json({ error: "Command must be a non-empty string" }, 400);
    }

    const env =
      body?.env && typeof body.env === "object" && !Array.isArray(body.env)
        ? Object.fromEntries(
            Object.entries(body.env as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : undefined;

    const timeoutMs =
      typeof body?.timeoutMs === "number" && Number.isFinite(body.timeoutMs) && body.timeoutMs > 0
        ? body.timeoutMs
        : undefined;

    try {
      const runId = startShellRun({
        command,
        cwd,
        env,
        timeoutMs,
      });
      return c.json({ runId }, 201);
    } catch (error) {
      return c.json(
        {
          error: "Failed to start shell command",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.get("/api/shell/runs/:runId/events", async (c) => {
    const runId = c.req.param("runId");
    const afterSeqRaw = c.req.query("afterSeq");
    const afterSeq = afterSeqRaw ? Math.max(0, Number(afterSeqRaw) || 0) : 0;

    const snapshot = getShellRunSnapshot(runId);
    if (!snapshot) {
      return c.json({ error: "Shell run not found" }, 404);
    }

    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    return streamSSE(c, async (stream) => {
      await streamSseEvents(stream.writeSSE.bind(stream), async (enqueueEvent) => {
        let resolveExit: (() => void) | null = null;
        const exitPromise = new Promise<void>((resolve) => {
          resolveExit = resolve;
        });
        const subscription = subscribeToShellRun(runId, afterSeq, (event) => {
          void enqueueEvent(toShellRunEvent(event));
          if (event.event === "exit") {
            resolveExit?.();
          }
        });

        if (!subscription) {
          await enqueueEvent({
            event: "error",
            data: { message: "Shell run not found" },
          });
          return;
        }

        for (const event of subscription.events) {
          await enqueueEvent(toShellRunEvent(event));
        }

        if (snapshot.finished) {
          subscription.unsubscribe();
          return;
        }
        await exitPromise;
        subscription.unsubscribe();
      });
    });
  });

  app.post("/api/shell/runs/:runId/kill", async (c) => {
    const runId = c.req.param("runId");
    const killed = stopShellRun(runId);
    if (!killed) {
      return c.json({ ok: false, message: "Shell run not found or already finished" });
    }
    return c.json({ ok: true });
  });

  app.get("/workspace/:appName/:filePath{.+}", async (c) => {
    const appName = c.req.param("appName");
    const filePath = c.req.param("filePath");
    const absolutePath = resolveWorkspacePath(appName, filePath);
    const viewerPath = `/workspace/${encodeWorkspaceRoutePath(appName)}/${encodeWorkspaceRoutePath(filePath)}`;

    if (!absolutePath) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    if (
      isTopLevelDocumentNavigation(c.req.raw) &&
      extname(absolutePath).toLowerCase() === ".html"
    ) {
      return c.redirect(buildViewerDeepLinkPath(viewerPath), 302);
    }

    try {
      const info = await stat(absolutePath);
      if (!info.isFile()) {
        return c.json({ error: "Not a file" }, 404);
      }

      const headers = workspaceFileHeaders(absolutePath, info);
      if (isWorkspaceFileNotModified(c.req.raw, info)) {
        return new Response(null, {
          status: 304,
          headers,
        });
      }

      if (extname(absolutePath).toLowerCase() === ".html") {
        const content = await readFile(absolutePath, "utf8");
        return new Response(injectRuntimeIntoHtml(content, appName), {
          status: 200,
          headers,
        });
      }

      const content = await readFile(absolutePath);
      return new Response(content, {
        status: 200,
        headers,
      });
    } catch {
      return c.json({ error: "File not found" }, 404);
    }
  });

  app.get("/workspace/:appName", async (c) => {
    const appName = c.req.param("appName");
    const appDefinition = await getWorkspaceAppDefinition(appName);
    if (!appDefinition) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    if (isTopLevelDocumentNavigation(c.req.raw)) {
      return c.redirect(buildViewerDeepLinkPath(appDefinition.viewerPath), 302);
    }

    return c.redirect(appDefinition.viewerPath, 302);
  });

  app.post("/workspace/sync", async (c) => {
    try {
      const status = await execFileAsync("git", ["status", "--porcelain"], {
        cwd: WORKSPACE_ROOT,
        timeout: 10000,
      });
      if (status.stdout.trim().length > 0) {
        return c.json({ error: "Workspace has uncommitted changes" }, 409);
      }
      const pull = await execFileAsync("git", ["pull", "--rebase"], {
        cwd: WORKSPACE_ROOT,
        timeout: 30000,
      });
      const push = await execFileAsync("git", ["push"], {
        cwd: WORKSPACE_ROOT,
        timeout: 30000,
      });
      const log = await execFileAsync("git", ["log", "-1", "--format=%s"], {
        cwd: WORKSPACE_ROOT,
        timeout: 5000,
      });
      return c.json({
        ok: true,
        pull: pull.stdout.trim(),
        push: push.stdout.trim(),
        lastCommit: log.stdout.trim(),
      });
    } catch (error) {
      return c.json(
        {
          error: "Sync failed",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/workspace/commit", async (c) => {
    try {
      let message = "Update workspace data";
      try {
        const body = await c.req.json() as { message?: string };
        if (body.message) message = body.message;
      } catch {}

      const status = await execFileAsync("git", ["status", "--porcelain"], {
        cwd: WORKSPACE_ROOT,
        timeout: 10000,
      });
      if (status.stdout.trim().length === 0) {
        return c.json({ ok: true, committed: false, message: "Nothing to commit" });
      }

      await execFileAsync("git", ["add", "-A"], {
        cwd: WORKSPACE_ROOT,
        timeout: 10000,
      });
      await execFileAsync("git", ["commit", "-m", message], {
        cwd: WORKSPACE_ROOT,
        timeout: 10000,
      });
      return c.json({ ok: true, committed: true, message });
    } catch (error) {
      return c.json(
        {
          error: "Commit failed",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.put("/workspace/:appName/:filePath{.+}", async (c) => {
    const appName = c.req.param("appName");
    const filePath = c.req.param("filePath");
    const absolutePath = resolveWorkspacePath(appName, filePath);

    if (!absolutePath) {
      return c.json({ error: "Invalid workspace path" }, 400);
    }

    if (extname(absolutePath).toLowerCase() !== ".json") {
      return c.json({ error: "Only .json files are writable" }, 400);
    }

    try {
      const payload = await c.req.text();
      JSON.parse(payload);

      if (!existsSync(WORKSPACE_ROOT)) {
        await mkdir(WORKSPACE_ROOT, { recursive: true });
      }

      await writeFile(absolutePath, payload, "utf8");
      return c.json({ ok: true });
    } catch (error) {
      return c.json(
        {
          error: "Failed to write JSON file",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });
};
