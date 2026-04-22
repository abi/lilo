import { Type } from "@mariozechner/pi-ai";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { getImageGenerationModel } from "../config/media.js";

const REPLICATE_API_BASE_URL = "https://api.replicate.com/v1";
const FLUX_MODEL_PATH = "black-forest-labs/flux-2-klein-4b";
const NANO_BANANA_CLASSIC_MODEL_PATH = "google/nano-banana";
const NANO_BANANA_MODEL_PATH = "google/nano-banana-2";
const REMOVE_BACKGROUND_VERSION =
  "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";
const REPLICATE_POLL_INTERVAL_MS = 250;
const REPLICATE_MAX_POLLS = 360;

type GenerateImagesDetails = {
  images: Array<{
    prompt: string;
    image_url: string | null;
    status: "ok" | "error";
    error?: string;
    provider?: "replicate";
  }>;
};

type RemoveBackgroundDetails = {
  images: Array<{
    image_url: string;
    result_url: string | null;
    status: "ok" | "error";
    error?: string;
  }>;
};

const jsonText = async (response: Response): Promise<string> => {
  try {
    return JSON.stringify((await response.json()) as unknown);
  } catch {
    return await response.text();
  }
};

const dedupeStrings = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
};



const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("Request aborted"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });

const extractReplicateOutputUrl = (output: unknown, context: string): string => {
  if (typeof output === "string" && output.length > 0) {
    return output;
  }

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string" && first.length > 0) {
      return first;
    }
    if (first && typeof first === "object" && "url" in first) {
      const url = (first as { url?: unknown }).url;
      if (typeof url === "string" && url.length > 0) {
        return url;
      }
    }
  }

  if (output && typeof output === "object" && "url" in output) {
    const url = (output as { url?: unknown }).url;
    if (typeof url === "string" && url.length > 0) {
      return url;
    }
  }

  throw new Error(`Unexpected response from ${context}`);
};

const createTextResult = <TDetails>(
  text: string,
  details: TDetails,
): AgentToolResult<TDetails> => ({
  content: [{ type: "text", text }],
  details,
});

const createReplicatePrediction = async (
  url: string,
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<string> => {
  const apiKey = process.env.REPLICATE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("REPLICATE_API_KEY is not configured");
  }

  const createResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!createResponse.ok) {
    throw new Error(`Replicate request failed: ${createResponse.status} ${await jsonText(createResponse)}`);
  }

  const created = (await createResponse.json()) as { id?: unknown };
  const predictionId = typeof created.id === "string" ? created.id : null;
  if (!predictionId) {
    throw new Error("Replicate prediction id missing from response");
  }

  return predictionId;
};

const pollReplicatePrediction = async (
  predictionId: string,
  signal: AbortSignal | undefined,
): Promise<unknown> => {
  const apiKey = process.env.REPLICATE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("REPLICATE_API_KEY is not configured");
  }

  for (let attempt = 0; attempt < REPLICATE_MAX_POLLS; attempt += 1) {
    await delay(REPLICATE_POLL_INTERVAL_MS, signal);

    const statusResponse = await fetch(`${REPLICATE_API_BASE_URL}/predictions/${predictionId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal,
    });

    if (!statusResponse.ok) {
      throw new Error(
        `Replicate status polling failed: ${statusResponse.status} ${await jsonText(statusResponse)}`,
      );
    }

    const statusPayload = (await statusResponse.json()) as {
      status?: unknown;
      output?: unknown;
      error?: unknown;
    };
    const status = typeof statusPayload.status === "string" ? statusPayload.status : "";

    if (status === "succeeded") {
      return statusPayload.output;
    }

    if (status === "failed" || status === "canceled") {
      throw new Error(`Replicate prediction ${status}`);
    }

    if (status === "error") {
      throw new Error(
        typeof statusPayload.error === "string" && statusPayload.error.length > 0
          ? statusPayload.error
          : "Replicate prediction errored",
      );
    }
  }

  throw new Error("Replicate prediction timed out");
};

const runReplicateVersionPrediction = async (
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<unknown> => {
  const predictionId = await createReplicatePrediction(
    `${REPLICATE_API_BASE_URL}/predictions`,
    payload,
    signal,
  );
  return pollReplicatePrediction(predictionId, signal);
};

const runReplicateModelPrediction = async (
  modelPath: string,
  input: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<unknown> => {
  const predictionId = await createReplicatePrediction(
    `${REPLICATE_API_BASE_URL}/models/${modelPath}/predictions`,
    { input },
    signal,
  );
  return pollReplicatePrediction(predictionId, signal);
};

const generateImageWithReplicate = async (
  prompt: string,
  signal: AbortSignal | undefined,
): Promise<string> => {
  const imageModel = getImageGenerationModel();

  if (imageModel === "nano-banana") {
    const output = await runReplicateModelPrediction(
      NANO_BANANA_CLASSIC_MODEL_PATH,
      {
        prompt,
        image_input: [],
        aspect_ratio: "1:1",
        output_format: "jpg",
      },
      signal,
    );

    return extractReplicateOutputUrl(output, "Nano Banana image generation");
  }

  if (imageModel === "nano-banana-2") {
    const output = await runReplicateModelPrediction(
      NANO_BANANA_MODEL_PATH,
      {
        prompt,
        resolution: "1K",
        image_input: [],
        aspect_ratio: "1:1",
        image_search: false,
        google_search: false,
        output_format: "jpg",
      },
      signal,
    );

    return extractReplicateOutputUrl(output, "Nano Banana 2 image generation");
  }

  const output = await runReplicateModelPrediction(
    FLUX_MODEL_PATH,
    {
      prompt,
      aspect_ratio: "1:1",
      output_format: "png",
    },
    signal,
  );

  return extractReplicateOutputUrl(output, "Flux image generation");
};

const removeBackgroundWithReplicate = async (
  imageUrl: string,
  signal: AbortSignal | undefined,
): Promise<string> => {
  const output = await runReplicateVersionPrediction(
    {
      version: REMOVE_BACKGROUND_VERSION,
      input: {
        image: imageUrl,
        format: "png",
        reverse: false,
        threshold: 0,
        background_type: "rgba",
      },
    },
    signal,
  );

  return extractReplicateOutputUrl(output, "background removal");
};

export const generateImagesTool: ToolDefinition = {
  name: "generate_images",
  label: "Generate Images",
  description:
    "Generate image URLs from prompts. Use this to replace placeholder images or create assets for an app. You can pass multiple prompts at once.",
  promptSnippet:
    "generate_images: create one or more images from text prompts and get back image URLs or data URLs.",
  parameters: Type.Object({
    prompts: Type.Array(
      Type.String({
        description: "Prompt describing one image to generate.",
        minLength: 1,
      }),
      { minItems: 1 },
    ),
  }),
  async execute(_toolCallId, params, signal) {
    const prompts = dedupeStrings((params as { prompts?: unknown }).prompts);
    if (prompts.length === 0) {
      return createTextResult<GenerateImagesDetails>("No valid prompts were provided.", {
        images: [],
      });
    }

    if (!process.env.REPLICATE_API_KEY?.trim()) {
      return createTextResult<GenerateImagesDetails>(
        "Image generation requires REPLICATE_API_KEY.",
        { images: [] },
      );
    }

    const images = await Promise.all(
      prompts.map(async (prompt) => {
        try {
          const imageUrl = await generateImageWithReplicate(prompt, signal);
          return {
            prompt,
            image_url: imageUrl,
            status: "ok" as const,
            provider: "replicate" as const,
          };
        } catch (error) {
          return {
            prompt,
            image_url: null,
            status: "error" as const,
            error: error instanceof Error ? error.message : "Unknown image generation error",
            provider: "replicate" as const,
          };
        }
      }),
    );

    const successCount = images.filter((image) => image.status === "ok").length;
    const lines = [
      successCount === images.length
        ? `Generated ${successCount} image${successCount === 1 ? "" : "s"}.`
        : `Generated ${successCount} of ${images.length} requested image${images.length === 1 ? "" : "s"}.`,
      "",
      ...images.map((image, index) =>
        image.status === "ok" && image.image_url
          ? `Image ${index + 1} URL: ${image.image_url}`
          : `Image ${index + 1} error: ${image.error ?? "Unknown image generation error"}`,
      ),
    ];

    return createTextResult<GenerateImagesDetails>(
      lines.join("\n"),
      { images },
    );
  },
};

export const removeBackgroundTool: ToolDefinition = {
  name: "remove_background",
  label: "Remove Background",
  description:
    "Remove the background from one or more images. Pass image URLs or data URLs and get back transparent-background PNG URLs.",
  promptSnippet:
    "remove_background: remove the background from one or more images and get back transparent PNG URLs.",
  parameters: Type.Object({
    image_urls: Type.Array(
      Type.String({
        description: "URL or data URL of an image to process.",
        minLength: 1,
      }),
      { minItems: 1 },
    ),
  }),
  async execute(_toolCallId, params, signal) {
    const imageUrls = dedupeStrings((params as { image_urls?: unknown }).image_urls);
    if (imageUrls.length === 0) {
      return createTextResult<RemoveBackgroundDetails>("No valid image URLs were provided.", {
        images: [],
      });
    }

    if (!process.env.REPLICATE_API_KEY?.trim()) {
      return createTextResult<RemoveBackgroundDetails>(
        "Background removal requires REPLICATE_API_KEY.",
        { images: [] },
      );
    }

    const images = await Promise.all(
      imageUrls.map(async (imageUrl) => {
        try {
          const resultUrl = await removeBackgroundWithReplicate(imageUrl, signal);
          return {
            image_url: imageUrl,
            result_url: resultUrl,
            status: "ok" as const,
          };
        } catch (error) {
          return {
            image_url: imageUrl,
            result_url: null,
            status: "error" as const,
            error: error instanceof Error ? error.message : "Unknown background removal error",
          };
        }
      }),
    );

    const successCount = images.filter((image) => image.status === "ok").length;
    return createTextResult<RemoveBackgroundDetails>(
      successCount === images.length
        ? `Removed backgrounds from ${successCount} image${successCount === 1 ? "" : "s"}.`
        : `Removed backgrounds from ${successCount} of ${images.length} image${images.length === 1 ? "" : "s"}.`,
      { images },
    );
  },
};
