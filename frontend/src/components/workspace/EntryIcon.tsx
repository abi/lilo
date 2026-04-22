import type { WorkspaceEntry } from "./types";

interface EntryIconProps {
  entry: WorkspaceEntry;
}

export function EntryIcon({ entry }: EntryIconProps) {
  if (entry.kind === "app" && entry.iconHref) {
    return (
      <img
        src={entry.iconHref}
        alt={`${entry.name} icon`}
        className="h-4 w-4 shrink-0 rounded object-cover"
      />
    );
  }

  if (entry.kind === "app" || entry.kind === "directory") {
    return (
      <svg
        className="h-4 w-4 shrink-0 text-neutral-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
      </svg>
    );
  }

  if (entry.kind === "image") {
    return (
      <svg
        className="h-4 w-4 shrink-0 text-neutral-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    );
  }

  if (entry.kind === "markdown") {
    return (
      <svg
        className="h-4 w-4 shrink-0 text-neutral-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8M16 17H8M10 9H8" />
      </svg>
    );
  }

  if (entry.kind === "json" || entry.kind === "code") {
    return (
      <svg
        className="h-4 w-4 shrink-0 text-neutral-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
      </svg>
    );
  }

  return (
    <svg
      className="h-4 w-4 shrink-0 text-neutral-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
