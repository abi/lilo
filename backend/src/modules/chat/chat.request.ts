type UploadedImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export interface UploadedChatFile {
  originalName: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
  image?: UploadedImageContent;
}

export const uploadedChatFileFromFile = async (
  file: File,
): Promise<UploadedChatFile> => {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const mimeType = file.type || "application/octet-stream";

  return {
    originalName: file.name || "upload",
    mimeType,
    size: file.size,
    bytes,
    image: mimeType.startsWith("image/")
      ? {
          type: "image",
          data: Buffer.from(arrayBuffer).toString("base64"),
          mimeType,
        }
      : undefined,
  };
};
