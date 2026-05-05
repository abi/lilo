import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

export const CHANNEL_RESPONSE_TOOL_NAME = "send_channel_response";

export type ChannelResponseType = "voice" | "image" | "file";

export interface SendChannelResponseDetails {
  responseType: ChannelResponseType;
  text?: string;
  filePath?: string;
  url?: string;
  caption?: string;
  filename?: string;
  mimeType?: string;
  voiceInstructions?: string;
}

const normalizeResponseType = (value: unknown): ChannelResponseType => {
  if (value === "voice" || value === "image" || value === "file") {
    return value;
  }

  throw new Error("response_type must be one of: voice, image, file");
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : undefined;
};

export const isSendChannelResponseDetails = (
  value: unknown,
): value is SendChannelResponseDetails =>
  Boolean(
    value &&
      typeof value === "object" &&
      "responseType" in value &&
      ((value as { responseType?: unknown }).responseType === "voice" ||
        (value as { responseType?: unknown }).responseType === "image" ||
        (value as { responseType?: unknown }).responseType === "file"),
  );

export const channelResponseTool: ToolDefinition = {
  name: CHANNEL_RESPONSE_TOOL_NAME,
  label: "Send Channel Response",
  description:
    "Send a non-text response back to the current Telegram or WhatsApp conversation. Use voice when the user asks you to read/say/speak something aloud. Use image or file for image, PDF, or other file responses. This tool is only delivered by external messaging channels.",
  promptSnippet:
    "send_channel_response: for Telegram/WhatsApp, call this to send voice notes or media/files. Use response_type='voice' with text to read aloud; use response_type='image' or 'file' with file_path or url to send media. Do not also paste a full transcript when sending voice unless the user asks for text too.",
  promptGuidelines: [
    "When a Telegram or WhatsApp user asks you to read something out loud, call send_channel_response with response_type='voice' and the exact text to speak.",
    "When a Telegram or WhatsApp user asks for an image, PDF, or other file response, call send_channel_response with response_type='image' or response_type='file' and either file_path or url.",
    "Use file_path for files in the workspace, such as memory/INDEX.md or /workspace-file/docs/report.pdf. Use url only for already-public media URLs.",
    "Do not call send_channel_response for ordinary text replies.",
  ],
  parameters: Type.Object({
    response_type: Type.String({
      description: "One of: voice, image, file.",
      minLength: 1,
    }),
    text: Type.Optional(
      Type.String({
        description: "For voice responses, the exact text to read aloud.",
      }),
    ),
    file_path: Type.Optional(
      Type.String({
        description: "Workspace-relative path or /workspace-file/... path for an image, PDF, or file.",
      }),
    ),
    url: Type.Optional(
      Type.String({
        description: "Public URL for an image, PDF, or file.",
      }),
    ),
    caption: Type.Optional(
      Type.String({
        description: "Optional short caption to send with the media.",
      }),
    ),
    filename: Type.Optional(
      Type.String({
        description: "Optional filename override for sent media.",
      }),
    ),
    mime_type: Type.Optional(
      Type.String({
        description: "Optional MIME type override for sent media.",
      }),
    ),
    voice_instructions: Type.Optional(
      Type.String({
        description: "Optional voice style instructions for text-to-speech.",
      }),
    ),
  }),
  async execute(_toolCallId, params) {
    const raw = params as Record<string, unknown>;
    const responseType = normalizeResponseType(raw.response_type);
    const details: SendChannelResponseDetails = {
      responseType,
      text: normalizeOptionalString(raw.text),
      filePath: normalizeOptionalString(raw.file_path),
      url: normalizeOptionalString(raw.url),
      caption: normalizeOptionalString(raw.caption),
      filename: normalizeOptionalString(raw.filename),
      mimeType: normalizeOptionalString(raw.mime_type),
      voiceInstructions: normalizeOptionalString(raw.voice_instructions),
    };

    if (responseType === "voice" && !details.text) {
      throw new Error("Voice responses require text");
    }

    if (responseType !== "voice" && !details.filePath && !details.url) {
      throw new Error("Image and file responses require file_path or url");
    }

    return {
      content: [
        {
          type: "text" as const,
          text:
            responseType === "voice"
              ? "Prepared voice response for the current channel."
              : `Prepared ${responseType} response for the current channel.`,
        },
      ],
      details,
    };
  },
};
