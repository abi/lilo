import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { backendConfig } from "../../shared/config/config.js";
import { WORKSPACE_ROOT } from "../../shared/config/paths.js";
import { generateSpeechWithOpenAi } from "../../shared/audio/speech.js";
import type { SendChannelResponseDetails } from "../../shared/tools/channelResponseTool.js";
import { registerTemporaryOutboundMedia } from "./outboundMedia.routes.js";

export interface PreparedChannelMedia {
  responseType: SendChannelResponseDetails["responseType"];
  caption?: string;
  filename: string;
  mimeType: string;
  bytes?: Uint8Array;
  url?: string;
}

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".aac": "audio/aac",
  ".amr": "audio/amr",
  ".css": "text/css",
  ".csv": "text/csv",
  ".flac": "audio/flac",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".m4a": "audio/mp4",
  ".md": "text/markdown",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

const sanitizeFilename = (value: string | undefined, fallback: string): string => {
  const normalized = basename(value?.trim() || fallback).replace(/["/\\]/g, "_");
  return normalized || fallback;
};

const normalizeWorkspaceFilePath = (value: string): string => {
  const trimmed = value.trim();
  const withoutWorkspaceFilePrefix = trimmed.replace(/^\/workspace-file\//, "");
  const withoutWorkspacePrefix = withoutWorkspaceFilePrefix.replace(/^\/workspace\//, "");
  return decodeURIComponent(withoutWorkspacePrefix).replace(/^\/+/, "");
};

const resolveWorkspaceFilePath = (value: string): string => {
  const relativePath = normalizeWorkspaceFilePath(value);
  const absolutePath = resolve(WORKSPACE_ROOT, relativePath);
  const workspaceRootWithSeparator = `${WORKSPACE_ROOT.replace(/\/+$/, "")}/`;

  if (absolutePath !== WORKSPACE_ROOT && !absolutePath.startsWith(workspaceRootWithSeparator)) {
    throw new Error(`Channel response file path is outside the workspace: ${value}`);
  }

  return absolutePath;
};

const inferMimeType = (filename: string): string =>
  MIME_TYPE_BY_EXTENSION[extname(filename).toLowerCase()] ?? "application/octet-stream";

const publicUrlForTemporaryMedia = (media: PreparedChannelMedia): string => {
  if (media.url) {
    return media.url;
  }

  if (!media.bytes) {
    throw new Error("Channel media has no bytes or URL");
  }

  const publicAppUrl = backendConfig.server.publicAppUrl;
  if (!publicAppUrl) {
    throw new Error(
      "LILO_PUBLIC_APP_URL or RENDER_EXTERNAL_URL is required to send local media over WhatsApp",
    );
  }

  const path = registerTemporaryOutboundMedia({
    bytes: media.bytes,
    mimeType: media.mimeType,
    filename: media.filename,
  });
  const url = new URL(publicAppUrl);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
};

export const getPublicUrlForChannelMedia = publicUrlForTemporaryMedia;

export const prepareChannelResponseMedia = async (
  details: SendChannelResponseDetails,
): Promise<PreparedChannelMedia> => {
  if (details.responseType === "voice") {
    const speech = await generateSpeechWithOpenAi({
      text: details.text ?? "",
      instructions: details.voiceInstructions,
    });
    return {
      responseType: "voice",
      caption: details.caption,
      filename: sanitizeFilename(details.filename, `lilo-voice${speech.extension}`),
      mimeType: speech.mimeType,
      bytes: speech.bytes,
    };
  }

  if (details.url) {
    const filename = sanitizeFilename(
      details.filename,
      details.url.split("/").pop()?.split("?")[0] || `lilo-${details.responseType}`,
    );
    return {
      responseType: details.responseType,
      caption: details.caption,
      filename,
      mimeType: details.mimeType ?? inferMimeType(filename),
      url: details.url,
    };
  }

  if (!details.filePath) {
    throw new Error("Channel response media requires filePath or url");
  }

  const absolutePath = resolveWorkspaceFilePath(details.filePath);
  const info = await stat(absolutePath);
  if (!info.isFile()) {
    throw new Error(`Channel response path is not a file: ${details.filePath}`);
  }

  const filename = sanitizeFilename(details.filename, basename(absolutePath));
  return {
    responseType: details.responseType,
    caption: details.caption,
    filename,
    mimeType: details.mimeType ?? inferMimeType(filename),
    bytes: new Uint8Array(await readFile(absolutePath)),
  };
};
