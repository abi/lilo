import { basename, extname } from "node:path";
import { backendConfig } from "../config/config.js";

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";

const AUDIO_MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".mpeg": "audio/mpeg",
  ".mpga": "audio/mpeg",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

export class AudioTranscriptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioTranscriptionUnavailableError";
  }
}

export interface AudioTranscriptionInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  prompt?: string;
}

export interface AudioTranscriptionResult {
  provider: "openai";
  model: string;
  text: string;
}

export const normalizeMediaMimeType = (value: string): string =>
  value.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";

export const isAudioMimeType = (value: string): boolean =>
  normalizeMediaMimeType(value).startsWith("audio/");

export const getAudioMimeTypeFromFileName = (fileName: string): string =>
  AUDIO_MIME_TYPE_BY_EXTENSION[extname(fileName).toLowerCase()] ?? "application/octet-stream";

const sanitizeFileName = (fileName: string): string => basename(fileName.trim() || "audio");

const getOpenAiTranscriptionApiKey = (): string => {
  const apiKey = backendConfig.media.audioTranscription.openaiApiKey;
  if (!apiKey) {
    throw new AudioTranscriptionUnavailableError(
      "OPENAI_API_KEY is not configured for audio transcription",
    );
  }

  return apiKey;
};

const parseTranscriptionText = (responseText: string): string => {
  try {
    const payload = JSON.parse(responseText) as { text?: unknown };
    return typeof payload.text === "string" ? payload.text.trim() : "";
  } catch {
    return "";
  }
};

export const transcribeAudioWithOpenAi = async (
  input: AudioTranscriptionInput,
): Promise<AudioTranscriptionResult> => {
  const { model, maxBytes } = backendConfig.media.audioTranscription;
  const apiKey = getOpenAiTranscriptionApiKey();
  const mimeType = normalizeMediaMimeType(input.mimeType);

  if (input.bytes.byteLength > maxBytes) {
    throw new Error(
      `Audio file is too large for transcription: ${input.bytes.byteLength} bytes > ${maxBytes} bytes`,
    );
  }

  const audioBuffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  const audioBlob = new Blob([audioBuffer], { type: mimeType });
  const formData = new FormData();
  formData.set("file", audioBlob, sanitizeFileName(input.fileName));
  formData.set("model", model);
  formData.set("response_format", "json");
  if (input.prompt?.trim()) {
    formData.set("prompt", input.prompt.trim());
  }

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenAI audio transcription failed with status ${response.status}: ${responseText.slice(0, 1_000)}`,
    );
  }

  const text = parseTranscriptionText(responseText);
  if (!text) {
    throw new Error("OpenAI audio transcription returned an empty transcript");
  }

  return {
    provider: "openai",
    model,
    text,
  };
};
