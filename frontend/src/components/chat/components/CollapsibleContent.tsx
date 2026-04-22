import { useEffect, useRef, useState, type ReactNode } from "react";

const MAX_COLLAPSED_HEIGHT = 200;

interface CollapsibleContentProps {
  children: ReactNode;
}

export function CollapsibleContent({ children }: CollapsibleContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const element = contentRef.current;
    if (element) {
      setIsOverflowing(element.scrollHeight > MAX_COLLAPSED_HEIGHT);
    }
  }, [children]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-200"
        style={!isExpanded && isOverflowing ? { maxHeight: MAX_COLLAPSED_HEIGHT } : undefined}
      >
        {children}
      </div>
      {isOverflowing && !isExpanded ? (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-white pt-8 pb-1 dark:from-neutral-950">
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
          >
            Show more
          </button>
        </div>
      ) : null}
      {isOverflowing && isExpanded ? (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="mt-1 text-[11px] text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}
