import { useEffect, useRef, useState } from "react";

interface TruncatedTitleProps {
  text: string;
  className?: string;
}

export function TruncatedTitle({ text, className }: TruncatedTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const check = () => {
      setIsTruncated(
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      );
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  const showTooltip = isTruncated && isHovered;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <h2
        ref={ref}
        className={`${className ?? ""} ${isTruncated ? "cursor-help" : ""}`.trim()}
      >
        {text}
      </h2>
      {showTooltip ? (
        <div className="pointer-events-none absolute left-0 right-0 top-full z-30 mt-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold leading-snug text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
          {text}
        </div>
      ) : null}
    </div>
  );
}
