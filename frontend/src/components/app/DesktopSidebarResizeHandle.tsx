import type { PointerEventHandler } from "react";

interface DesktopSidebarResizeHandleProps {
  hidden: boolean;
  isResizing: boolean;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
}

export function DesktopSidebarResizeHandle({
  hidden,
  isResizing,
  onPointerDown,
}: DesktopSidebarResizeHandleProps) {
  return (
    <div
      className={`group relative w-1.5 shrink-0 touch-none items-center justify-center outline-none transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 ${
        hidden ? "hidden" : "hidden md:flex"
      } ${isResizing ? "bg-neutral-300 dark:bg-neutral-600" : "bg-neutral-100 dark:bg-neutral-800"}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize workspace sidebar"
    >
      <div className="absolute inset-y-0 -left-1.5 -right-1.5 z-10 cursor-col-resize" />
      <div
        aria-hidden
        className={`pointer-events-none flex h-8 w-1 flex-col items-center justify-center gap-0.5 rounded-full bg-neutral-400 transition-opacity dark:bg-neutral-500 ${
          isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <span className="block h-1 w-1 rounded-full bg-white/80 dark:bg-neutral-900/60" />
        <span className="block h-1 w-1 rounded-full bg-white/80 dark:bg-neutral-900/60" />
        <span className="block h-1 w-1 rounded-full bg-white/80 dark:bg-neutral-900/60" />
      </div>
    </div>
  );
}
