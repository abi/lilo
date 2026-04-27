const parseErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { error?: string; details?: string };
    if (payload.details) {
      return payload.details;
    }
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Fall through to status/text fallback.
  }

  try {
    const text = await response.text();
    if (text.trim().length > 0) {
      return text.trim();
    }
  } catch {
    // Ignore body read failures.
  }

  return fallback;
};

const formatSetupError = (message: string): string => {
  const normalized = message.trim();

  if (/LILO_WORKSPACE_DIR must be set/i.test(normalized)) {
    return [
      "The backend is missing the required `LILO_WORKSPACE_DIR` environment variable.",
      "",
      "To fix this, set `LILO_WORKSPACE_DIR` to the workspace folder path before starting the backend.",
      "",
      "Examples:",
      "- local dev: `LILO_WORKSPACE_DIR=/absolute/path/to/workspace pnpm run dev:backend`",
      "- Docker: pass `-e LILO_WORKSPACE_DIR=/data/workspace` when starting the container",
    ].join("\n");
  }

  if (/Request failed with status 500/i.test(normalized)) {
    return [
      "The backend returned HTTP 500 while Lilo was loading.",
      "",
      "Most likely fix: set the required `LILO_WORKSPACE_DIR` environment variable before starting the backend.",
      "",
      "Examples:",
      "- local dev: `LILO_WORKSPACE_DIR=/absolute/path/to/workspace pnpm run dev:backend`",
      "- Docker: pass `-e LILO_WORKSPACE_DIR=/data/workspace` when starting the container",
      "",
      "If it still fails after setting that, check the backend logs for the exact startup error.",
    ].join("\n");
  }

  return normalized;
};

const formatJsonViewer = (value: string): string => {
  try {
    return `${JSON.stringify(JSON.parse(value), null, 2)}\n`;
  } catch {
    return value;
  }
};

export { formatJsonViewer, formatSetupError, parseErrorMessage };
