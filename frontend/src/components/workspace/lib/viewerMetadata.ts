import type { WorkspaceEntry } from "../types";

export const viewerLabelForEntry = (
  entry: WorkspaceEntry | null | undefined,
  selectedPath: string | null,
): string => {
  if (entry?.kind === "app") {
    return entry.name;
  }

  if (entry) {
    return entry.relativePath;
  }

  return selectedPath ? selectedPath.replace("/workspace/", "") : "No file selected";
};

export const viewerKindLabel = (
  entry: WorkspaceEntry | null | undefined,
): string | null => {
  switch (entry?.kind) {
    case "app":
      return "App";
    case "markdown":
      return "Markdown";
    case "json":
      return "JSON";
    case "image":
      return "Image";
    case "text":
      return "Text";
    case "code":
      return "Code";
    case "binary":
      return "Binary";
    default:
      return null;
  }
};

export const viewerLanguageForEntry = (
  entry: WorkspaceEntry | null | undefined,
): string | null => {
  if (!entry) {
    return null;
  }

  if (entry.kind === "json") {
    return "json";
  }

  if (entry.kind !== "code") {
    return null;
  }

  const extension = entry.name.includes(".")
    ? entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase()
    : "";

  switch (extension) {
    case ".html":
    case ".htm":
      return "html";
    case ".css":
      return "css";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".py":
      return "python";
    case ".rb":
      return "ruby";
    case ".php":
      return "php";
    case ".java":
      return "java";
    case ".kt":
      return "kotlin";
    case ".swift":
      return "swift";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    case ".c":
    case ".h":
      return "c";
    case ".cc":
    case ".cpp":
    case ".cxx":
    case ".hpp":
      return "cpp";
    case ".cs":
      return "csharp";
    case ".sh":
    case ".bash":
    case ".zsh":
      return "bash";
    case ".sql":
      return "sql";
    case ".xml":
      return "xml";
    case ".yml":
    case ".yaml":
      return "yaml";
    case ".toml":
      return "toml";
    case ".vue":
      return "vue";
    case ".svelte":
      return "svelte";
    default:
      return extension.length > 1 ? extension.slice(1) : "text";
  }
};
