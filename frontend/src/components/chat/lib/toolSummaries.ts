export const extractFilePath = (input: Record<string, unknown>): string | null => {
  for (const key of ["file_path", "filePath", "path", "filename"]) {
    if (typeof input[key] === "string") {
      return input[key] as string;
    }
  }

  return null;
};

export const shortenFilePath = (filePath: string): string => {
  const workspaceIndex = filePath.indexOf("/workspace/");
  if (workspaceIndex !== -1) {
    return filePath.slice(workspaceIndex + "/workspace/".length);
  }

  return filePath.split("/").pop() ?? filePath;
};

export const formatToolSummary = (
  toolName: string | undefined,
  toolInput: string | undefined,
): string => {
  if (!toolName) {
    return "Tool call";
  }

  if (!toolInput) {
    return toolName;
  }

  const name = toolName.toLowerCase();

  try {
    const input = JSON.parse(toolInput) as Record<string, unknown>;
    const filePath = extractFilePath(input);

    if (name === "read" && filePath) {
      return `Read ${shortenFilePath(filePath)}`;
    }

    if (name === "edit" && filePath) {
      return `Edited ${shortenFilePath(filePath)}`;
    }

    if (name === "write" && filePath) {
      return `Wrote ${shortenFilePath(filePath)}`;
    }

    if (name === "open_app" && typeof input.app_name === "string") {
      return `Open App ${input.app_name}`;
    }

    if (name === "generate_images" || name === "generate_image") {
      const prompts = input.prompts as string[] | undefined;
      const count = Array.isArray(prompts) ? prompts.length : 1;
      return count === 1 ? "Generated image" : `Generated ${count} images`;
    }

    if (name === "bash" && typeof input.command === "string") {
      const command = input.command.trim();
      return `Bash: ${command.length > 50 ? `${command.slice(0, 47)}…` : command}`;
    }

    if (filePath) {
      return `${toolName} ${shortenFilePath(filePath)}`;
    }
  } catch {
    // Fall through to tool name.
  }

  return toolName;
};
