interface PdfViewerProps {
  name: string;
  selectedViewerUrl: string;
  viewerRefreshKey: number;
}

export function PdfViewer({ name, selectedViewerUrl, viewerRefreshKey }: PdfViewerProps) {
  return (
    <iframe
      key={`${selectedViewerUrl}-${viewerRefreshKey}`}
      title={`PDF preview: ${name}`}
      src={selectedViewerUrl}
      className="h-full w-full rounded border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
    />
  );
}
