import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import type { WorkspaceEntry } from "../types";

interface AppViewerFrameProps {
  iframeRef: RefObject<HTMLIFrameElement>;
  mobile?: boolean;
  viewerRefreshKey: number;
  selectedViewerUrl: string;
  workspaceEntries: WorkspaceEntry[];
  onOpenViewerPath?: (viewerPath: string) => void;
}

export function AppViewerFrame({
  iframeRef,
  mobile = false,
  viewerRefreshKey,
  selectedViewerUrl,
  workspaceEntries,
  onOpenViewerPath,
}: AppViewerFrameProps) {
  const workspaceFilePaths = useMemo(
    () =>
      workspaceEntries.filter(
        (entry) => entry.viewerPath && entry.kind !== "app" && entry.kind !== "directory",
      ),
    [workspaceEntries],
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || workspaceFilePaths.length === 0 || !onOpenViewerPath) {
      return;
    }

    const viewerPathByRelativePath = new Map(
      workspaceFilePaths.map((entry) => [entry.relativePath, entry.viewerPath!]),
    );
    const viewerPaths = new Set(workspaceFilePaths.map((entry) => entry.viewerPath!));

    const stripSearchAndHash = (value: string): string => value.split("#", 1)[0].split("?", 1)[0];

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const rawHref = anchor.getAttribute("href")?.trim();
      if (
        !rawHref ||
        rawHref.startsWith("#") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("javascript:") ||
        rawHref.startsWith("./") ||
        rawHref.startsWith("../")
      ) {
        return;
      }

      const normalizedRawHref = stripSearchAndHash(rawHref).replace(/^\/+/, "");
      if (!normalizedRawHref.includes("/")) {
        return;
      }

      const matchedRelativePath = viewerPathByRelativePath.get(normalizedRawHref);
      if (matchedRelativePath) {
        event.preventDefault();
        onOpenViewerPath(matchedRelativePath);
        return;
      }

      try {
        const resolvedUrl = new URL(anchor.href, iframe.contentWindow?.location.href ?? selectedViewerUrl);
        if (resolvedUrl.origin !== window.location.origin) {
          return;
        }

        const pathname = decodeURIComponent(stripSearchAndHash(resolvedUrl.pathname));
        if (!viewerPaths.has(pathname)) {
          return;
        }

        event.preventDefault();
        onOpenViewerPath(pathname);
      } catch {
        // Ignore links we can't parse and let the iframe handle them normally.
      }
    };

    const attachListener = () => {
      const document = iframe.contentDocument;
      if (!document) {
        return;
      }

      document.addEventListener("click", handleClick);
    };

    const detachListener = () => {
      iframe.contentDocument?.removeEventListener("click", handleClick);
    };

    attachListener();
    iframe.addEventListener("load", attachListener);

    return () => {
      detachListener();
      iframe.removeEventListener("load", attachListener);
    };
  }, [iframeRef, onOpenViewerPath, selectedViewerUrl, workspaceFilePaths]);

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={iframeRef}
        key={`${mobile ? "mobile-" : ""}${selectedViewerUrl}-${viewerRefreshKey}`}
        title="App Viewer"
        src={selectedViewerUrl}
        className="h-full w-full bg-white"
      />
    </div>
  );
}
