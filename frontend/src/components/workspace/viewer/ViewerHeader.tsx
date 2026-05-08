import { useState } from "react";
import type { WorkspaceEntry } from "../types";
import { authFetch } from "../../../lib/auth";

interface ViewerHeaderProps {
  mobile?: boolean;
  title: string;
  kindLabel: string | null;
  selectedEntry: WorkspaceEntry | null;
  selectedViewerUrl: string | null;
  onBack?: () => void;
  onRefresh: () => void;
}

export function ViewerHeader({
  mobile = false,
  title,
  selectedEntry,
  selectedViewerUrl,
  onBack,
  onRefresh,
}: ViewerHeaderProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const canDownload =
    Boolean(selectedViewerUrl) &&
    Boolean(selectedEntry) &&
    selectedEntry?.kind !== "app" &&
    selectedEntry?.kind !== "directory";
  const downloadName = selectedEntry?.name || title || "download";

  const handleDownload = async () => {
    if (!selectedViewerUrl || !canDownload || isDownloading) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await authFetch(selectedViewerUrl);
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Download failed",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadButtonLabel = isDownloading
    ? "Downloading"
    : downloadError
      ? "Failed"
      : "Download";
  const downloadButtonTitle =
    downloadError ?? (canDownload ? `Download ${downloadName}` : undefined);

  const mobileBackMark =
    selectedEntry?.kind === "app" && selectedEntry.iconHref ? (
      <img
        src={selectedEntry.iconHref}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg border border-neutral-200 object-cover dark:border-neutral-600"
      />
    ) : selectedEntry?.kind === "app" ? (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-200 text-sm font-bold uppercase text-neutral-600 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
        {title.charAt(0)}
      </div>
    ) : (
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden
        className="h-9 w-9 shrink-0 object-contain"
      />
    );

  if (mobile) {
    return (
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
        <button
          type="button"
          onClick={onBack}
          className="flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-2 text-left text-neutral-900 transition hover:bg-neutral-100 active:opacity-70 dark:text-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Back to home"
        >
          <svg
            className="h-6 w-6 shrink-0 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {mobileBackMark}
          <span className="truncate font-heading text-lg font-semibold tracking-tight">{title}</span>
        </button>
        <div className="flex min-w-0 items-center gap-1">
          {canDownload ? (
            <button
              type="button"
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-900 active:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 dark:active:bg-neutral-800"
              onClick={handleDownload}
              disabled={isDownloading}
              aria-label={`Download ${downloadName}`}
              title={downloadButtonTitle}
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
              {downloadButtonLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-900 active:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 dark:active:bg-neutral-800"
            onClick={onRefresh}
            disabled={!selectedViewerUrl}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5 px-1.5 py-1">
          {selectedEntry?.kind === "app" && selectedEntry.iconHref ? (
            <img
              src={selectedEntry.iconHref}
              alt=""
              className="h-7 w-7 shrink-0 rounded-lg border border-neutral-200 object-cover dark:border-neutral-600"
            />
          ) : selectedEntry?.kind === "app" ? (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-200 text-xs font-bold uppercase text-neutral-600 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
              {title.charAt(0)}
            </div>
          ) : null}
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {title}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canDownload ? (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
              onClick={handleDownload}
              disabled={isDownloading}
              aria-label={`Download ${downloadName}`}
              title={downloadButtonTitle}
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
              {downloadButtonLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
            onClick={onRefresh}
            disabled={!selectedViewerUrl}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
