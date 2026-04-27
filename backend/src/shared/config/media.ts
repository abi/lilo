import { backendConfig, type ImageGenerationModel } from "./config.js";

export type { ImageGenerationModel };

export const getImageGenerationModel = (): ImageGenerationModel =>
  backendConfig.media.imageModel;
