import { backendConfig } from "../config/config.js";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

export class AudioSpeechUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioSpeechUnavailableError";
  }
}

export interface AudioSpeechInput {
  text: string;
  instructions?: string;
}

export interface AudioSpeechResult {
  provider: "openai";
  model: string;
  voice: string;
  mimeType: string;
  extension: string;
  bytes: Uint8Array;
}

const getOpenAiSpeechApiKey = (): string => {
  const apiKey = backendConfig.media.audioSpeech.openaiApiKey;
  if (!apiKey) {
    throw new AudioSpeechUnavailableError("OPENAI_API_KEY is not configured for audio speech");
  }

  return apiKey;
};

export const generateSpeechWithOpenAi = async (
  input: AudioSpeechInput,
): Promise<AudioSpeechResult> => {
  const { model, voice, responseFormat, mimeType, extension, maxChars } =
    backendConfig.media.audioSpeech;
  const text = input.text.trim();
  if (!text) {
    throw new Error("Speech text cannot be empty");
  }
  if (text.length > maxChars) {
    throw new Error(`Speech text is too long: ${text.length} chars > ${maxChars} chars`);
  }

  const response = await fetch(OPENAI_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiSpeechApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: responseFormat,
      ...(input.instructions?.trim()
        ? { instructions: input.instructions.trim() }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI audio speech failed with status ${response.status}: ${(await response.text()).slice(0, 1_000)}`,
    );
  }

  return {
    provider: "openai",
    model,
    voice,
    mimeType,
    extension,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
};
