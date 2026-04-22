import type { MouseEventHandler } from "react";

interface DesktopSidebarResizeHandleProps {
  hidden: boolean;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
}

export function DesktopSidebarResizeHandle({
  hidden,
  onMouseDown,
}: DesktopSidebarResizeHandleProps) {
  return (
    <div
      className={`group relative w-0 shrink-0 ${hidden ? "hidden" : "hidden md:block"}`}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-neutral-200 transition-colors group-hover:bg-neutral-400 dark:bg-neutral-700 dark:group-hover:bg-neutral-500" />
    </div>
  );
}
