import { useEffect, useState } from "react";
import type { WorkspaceEntry } from "../components/workspace/types";
import { UnauthorizedError, authFetch } from "../lib/auth";
import { API_BASE_URL, formatJsonViewer, parseErrorMessage } from "./workspace/utils";

interface UseWorkspaceFileViewerOptions {
  selectedViewerPath: string | null;
  workspaceEntries: WorkspaceEntry[];
  viewerRefreshKey: number;
}

export function useWorkspaceFileViewer({
  selectedViewerPath,
  workspaceEntries,
  viewerRefreshKey,
}: UseWorkspaceFileViewerOptions) {
  const [fileViewerText, setFileViewerText] = useState<string | null>(null);
  const [fileViewerError, setFileViewerError] = useState<string | null>(null);
  const [isLoadingFileViewer, setIsLoadingFileViewer] = useState(false);

  useEffect(() => {
    if (!selectedViewerPath) {
      setFileViewerText(null);
      setFileViewerError(null);
      setIsLoadingFileViewer(false);
      return;
    }

    const selectedEntry = workspaceEntries.find((entry) => entry.viewerPath === selectedViewerPath);
    if (!selectedEntry || !["markdown", "text", "json", "code"].includes(selectedEntry.kind)) {
      setFileViewerText(null);
      setFileViewerError(null);
      setIsLoadingFileViewer(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingFileViewer(true);
    setFileViewerError(null);

    authFetch(`${API_BASE_URL}${selectedViewerPath}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) {
            throw new UnauthorizedError();
          }
          throw new Error(
            await parseErrorMessage(response, `Failed to load file (${response.status})`),
          );
        }

        const text = await response.text();
        return selectedEntry.kind === "json" ? formatJsonViewer(text) : text;
      })
      .then((text) => setFileViewerText(text))
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setFileViewerError(
          error instanceof Error ? error.message : "Failed to load viewer",
        );
      })
      .finally(() => setIsLoadingFileViewer(false));

    return () => controller.abort();
  }, [selectedViewerPath, workspaceEntries, viewerRefreshKey]);

  return {
    fileViewerText,
    fileViewerError,
    isLoadingFileViewer,
  };
}
