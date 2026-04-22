interface ImageViewerProps {
  name: string;
  viewerRefreshKey: number;
  selectedViewerUrl: string;
}

export function ImageViewer({
  name,
  viewerRefreshKey,
  selectedViewerUrl,
}: ImageViewerProps) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto rounded border border-neutral-200 bg-[linear-gradient(45deg,#f5f5f5_25%,transparent_25%),linear-gradient(-45deg,#f5f5f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f5f5f5_75%),linear-gradient(-45deg,transparent_75%,#f5f5f5_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px] p-6 dark:border-neutral-700 dark:bg-[linear-gradient(45deg,#262626_25%,transparent_25%),linear-gradient(-45deg,#262626_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#262626_75%),linear-gradient(-45deg,transparent_75%,#262626_75%)]">
      <img
        key={`${selectedViewerUrl}-${viewerRefreshKey}`}
        src={selectedViewerUrl}
        alt={name}
        className="max-h-full max-w-full rounded-lg object-contain shadow-xl"
      />
    </div>
  );
}
