import type { ChatAttachment, ChatMessage } from "../../../store/chatStore";

const extractContextTag = (content: string, tagName: string): string | null => {
  const match = content.match(
    new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "i"),
  );
  return match?.[1]?.trim() ?? null;
};

const extractSelectedElementAttachment = (content: string): ChatAttachment | null => {
  const html = extractContextTag(content, "selected_element_html");
  if (!html) {
    return null;
  }

  const tagName = extractContextTag(content, "selected_element_tag_name") ?? "element";
  const label = extractContextTag(content, "selected_element_label") ?? `<${tagName}>`;
  const textPreview = extractContextTag(content, "selected_element_text_preview") ?? "";

  return {
    name: label,
    type: "text/html",
    previewUrl: "",
    kind: "selected_element",
    label,
    textPreview,
    html,
    tagName,
  };
};

const extractUploadedFileAttachments = (content: string): ChatAttachment[] => {
  const matches = content.match(/<uploaded_file>[\s\S]*?<\/uploaded_file>/g) ?? [];
  const attachments: ChatAttachment[] = [];

  for (const block of matches) {
    const name = extractContextTag(block, "uploaded_file_name");
    if (!name) {
      continue;
    }

    const type =
      extractContextTag(block, "uploaded_file_mime_type") ?? "application/octet-stream";
    const isImage =
      (extractContextTag(block, "uploaded_file_is_image") ?? "").toLowerCase() === "true";

    attachments.push({
      name,
      type,
      previewUrl: "",
      kind: isImage ? "image" : "file",
    });
  }

  return attachments;
};

export const getImageAttachments = (attachments?: ChatAttachment[]): ChatAttachment[] =>
  (attachments ?? []).filter(
    (attachment) => attachment.kind === "image" || attachment.type.startsWith("image/"),
  );

export const getFileAttachments = (message: ChatMessage): ChatAttachment[] => {
  const explicit = (message.attachments ?? []).filter(
    (attachment) => attachment.kind === "file" && !attachment.type.startsWith("image/"),
  );

  if (explicit.length > 0) {
    return explicit;
  }

  return extractUploadedFileAttachments(message.content ?? "").filter(
    (attachment) => attachment.kind === "file",
  );
};

export const getSelectedElementAttachments = (message: ChatMessage): ChatAttachment[] => {
  const explicit = (message.attachments ?? []).filter(
    (attachment) => attachment.kind === "selected_element",
  );

  if (explicit.length > 0) {
    return explicit;
  }

  const parsed = extractSelectedElementAttachment(message.content ?? "");
  return parsed ? [parsed] : [];
};
