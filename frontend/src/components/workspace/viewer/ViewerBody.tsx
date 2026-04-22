import type { RefObject } from "react";
import type { WorkspaceEntry } from "../types";
import { AppViewerFrame } from "./AppViewerFrame";
import { BinaryViewer } from "./BinaryViewer";
import { CodeViewer } from "./CodeViewer";
import { EmptyViewer } from "./EmptyViewer";
import { ErrorViewer } from "./ErrorViewer";
import { ImageViewer } from "./ImageViewer";
import { MarkdownViewer } from "./MarkdownViewer";
import { PdfViewer } from "./PdfViewer";
import { TextViewer } from "./TextViewer";

interface ViewerBodyProps {
  selectedEntry: WorkspaceEntry | null;
  selectedViewerUrl: string | null;
  fileViewerText: string | null;
  fileViewerError: string | null;
  isLoadingFileViewer: boolean;
  viewerRefreshKey: number;
  viewerLanguage: string | null;
  kindLabel: string | null;
  mobile?: boolean;
  iframeRef: RefObject<HTMLIFrameElement>;
  workspaceEntries: WorkspaceEntry[];
  onOpenViewerPath?: (viewerPath: string) => void;
}

export function ViewerBody({
  selectedEntry,
  selectedViewerUrl,
  fileViewerText,
  fileViewerError,
  isLoadingFileViewer,
  viewerRefreshKey,
  viewerLanguage,
  kindLabel,
  mobile = false,
  iframeRef,
  workspaceEntries,
  onOpenViewerPath,
}: ViewerBodyProps) {
  if (!selectedEntry) {
    return <EmptyViewer message="Select a file to view." />;
  }

  if (selectedEntry.kind === "app") {
    if (!selectedViewerUrl) {
      return <EmptyViewer message="No viewer available." />;
    }

    return (
      <AppViewerFrame
        iframeRef={iframeRef}
        mobile={mobile}
        viewerRefreshKey={viewerRefreshKey}
        selectedViewerUrl={selectedViewerUrl}
        workspaceEntries={workspaceEntries}
        onOpenViewerPath={onOpenViewerPath}
      />
    );
  }

  if (selectedEntry.kind === "image") {
    if (!selectedViewerUrl) {
      return <EmptyViewer message="Image unavailable." />;
    }

    return (
      <ImageViewer
        name={selectedEntry.name}
        viewerRefreshKey={viewerRefreshKey}
        selectedViewerUrl={selectedViewerUrl}
      />
    );
  }

  if (selectedEntry.kind === "binary") {
    const isPdf = selectedEntry.name.toLowerCase().endsWith(".pdf");
    if (isPdf && selectedViewerUrl) {
      return (
        <PdfViewer
          name={selectedEntry.name}
          selectedViewerUrl={selectedViewerUrl}
          viewerRefreshKey={viewerRefreshKey}
        />
      );
    }

    return <BinaryViewer selectedViewerUrl={selectedViewerUrl} />;
  }

  if (fileViewerError) {
    return <ErrorViewer message={fileViewerError} />;
  }

  if (isLoadingFileViewer) {
    return <EmptyViewer message="Loading viewer..." />;
  }

  if (selectedEntry.kind === "markdown") {
    return (
      <MarkdownViewer
        content={fileViewerText ?? ""}
        basePath={selectedEntry.viewerPath}
        onOpenWorkspacePath={onOpenViewerPath}
      />
    );
  }

  if ((selectedEntry.kind === "json" || selectedEntry.kind === "code") && viewerLanguage) {
    return <CodeViewer content={fileViewerText ?? ""} language={viewerLanguage} />;
  }

  return <TextViewer content={fileViewerText ?? ""} languageLabel={kindLabel} />;
}
