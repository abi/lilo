interface ImageAttachmentPreview {
  kind: "image";
  title: string;
  subtitle: string;
  src: string;
}

interface TextAttachmentPreview {
  kind: "text";
  title: string;
  subtitle: string;
  content: string;
  isTruncated?: boolean;
}

interface FileAttachmentPreview {
  kind: "file";
  title: string;
  subtitle: string;
  src: string;
  type: string;
}

interface PdfAttachmentPreview {
  kind: "pdf";
  title: string;
  subtitle: string;
  src: string;
}

export type ComposerAttachmentPreview =
  | ImageAttachmentPreview
  | TextAttachmentPreview
  | FileAttachmentPreview
  | PdfAttachmentPreview;

interface ComposerAttachmentPreviewDialogProps {
  preview: ComposerAttachmentPreview | null;
  onClose: () => void;
}

export function ComposerAttachmentPreviewDialog({
  preview,
  onClose,
}: ComposerAttachmentPreviewDialogProps) {
  if (!preview) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/45 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Attachment preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-neutral-900">
        <div className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-base font-semibold text-neutral-950 dark:text-neutral-100">
              {preview.title}
            </p>
            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
              {preview.subtitle}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-label="Close attachment preview"
            onClick={onClose}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {preview.kind === "image" ? (
            <div className="flex justify-center">
              <img
                src={preview.src}
                alt={preview.title}
                className="max-h-[65vh] max-w-full rounded-2xl object-contain"
              />
            </div>
          ) : null}

          {preview.kind === "text" ? (
            <div className="space-y-3">
              {preview.isTruncated ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  Previewing the first 200 KB of this attachment.
                </p>
              ) : null}
              <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-neutral-200 bg-neutral-50 p-4 font-mono text-sm leading-relaxed text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
                {preview.content || "(empty)"}
              </pre>
            </div>
          ) : null}

          {preview.kind === "pdf" ? (
            <iframe
              title={`PDF preview: ${preview.title}`}
              src={preview.src}
              className="h-[65vh] w-full rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
            />
          ) : null}

          {preview.kind === "file" ? (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Lilo can attach this file, but it cannot render an inline preview for this type yet.
              </p>
              <a
                href={preview.src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200"
              >
                Open in new tab
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M7 17 17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
