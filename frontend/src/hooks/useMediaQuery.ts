import { useEffect, useState } from "react";

/**
 * Reactively subscribe to a CSS media query. Returns `true` while the query
 * matches and `false` otherwise. Server-side / pre-hydration renders get the
 * supplied `fallback` (default `false`).
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return fallback;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Tailwind's default `md` breakpoint.
export const useIsDesktop = (): boolean => useMediaQuery("(min-width: 768px)");
