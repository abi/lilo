import type { ChatMessage } from "../../../store/chatStore";

export interface EditDiffData {
  filePath: string;
  oldString: string;
  newString: string;
}

export interface BashData {
  command: string;
  output?: string;
}

type ToolImageDetails = {
  images?: Array<{
    prompt?: string;
    image_url?: string | null;
    result_url?: string | null;
    status?: "ok" | "error";
    error?: string;
  }>;
};

export const parseEditInput = (toolInput: string | undefined): EditDiffData | null => {
  if (!toolInput) {
    return null;
  }

  try {
    const input = JSON.parse(toolInput) as Record<string, unknown>;
    const filePath =
      typeof input.file_path === "string"
        ? input.file_path
        : typeof input.filePath === "string"
          ? input.filePath
          : typeof input.path === "string"
            ? input.path
            : typeof input.filename === "string"
              ? input.filename
              : null;

    const oldString = input.old_string ?? input.oldText ?? input.oldString;
    const newString = input.new_string ?? input.newText ?? input.newString;

    if (filePath && typeof oldString === "string" && typeof newString === "string") {
      return { filePath, oldString, newString };
    }
  } catch {
    // Ignore invalid JSON.
  }

  return null;
};

export const parseBashInput = (toolInput: string | undefined): BashData | null => {
  if (!toolInput) {
    return null;
  }

  try {
    const input = JSON.parse(toolInput) as Record<string, unknown>;
    if (typeof input.command === "string") {
      return { command: input.command.trim() };
    }
  } catch {
    // Ignore invalid JSON.
  }

  return null;
};

export const parseImageUrls = (toolDetails: unknown): string[] => {
  if (!toolDetails || typeof toolDetails !== "object") {
    return [];
  }

  const details = toolDetails as ToolImageDetails;
  if (!Array.isArray(details.images)) {
    return [];
  }

  return details.images
    .map((image) => image.result_url ?? image.image_url ?? null)
    .filter((url): url is string => url !== null);
};

const isToolImageDetails = (value: unknown): value is ToolImageDetails =>
  Boolean(
    value &&
      typeof value === "object" &&
      "images" in value &&
      Array.isArray((value as { images?: unknown }).images),
  );

export const getToolResultImages = (
  result: ChatMessage,
): Array<{
  prompt?: string;
  imageUrl?: string | null;
  resultUrl?: string | null;
  status?: "ok" | "error";
  error?: string;
}> => {
  if (!isToolImageDetails(result.toolDetails)) {
    return [];
  }

  return (result.toolDetails.images ?? []).map((image) => ({
    prompt: image.prompt,
    imageUrl: image.image_url,
    resultUrl: image.result_url,
    status: image.status,
    error: image.error,
  }));
};
