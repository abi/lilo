export type ImageGenerationModel =
  | "flux-2-klein-4b"
  | "nano-banana"
  | "nano-banana-2";

const FALLBACK_IMAGE_MODEL: ImageGenerationModel = "nano-banana";

export const getImageGenerationModel = (): ImageGenerationModel => {
  const configured = process.env.LILO_DEFAULT_IMAGE_MODEL?.trim().toLowerCase();

  if (configured === "nano-banana-2") {
    return "nano-banana-2";
  }

  if (configured === "nano-banana") {
    return "nano-banana";
  }

  if (configured === "flux-2-klein-4b") {
    return "flux-2-klein-4b";
  }

  return FALLBACK_IMAGE_MODEL;
};
