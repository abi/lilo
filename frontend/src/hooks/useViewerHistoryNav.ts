import { useEffect, useRef } from "react";

/**
 * Wrap the current viewer path with the browser History API so that
 * Back / Forward (including hardware gestures on mobile) navigate between
 * previously opened apps.
 *
 *   - On mount: `replaceState` seeds the initial entry with the current path.
 *   - On path change (from user action): `pushState` adds a new entry.
 *   - On `popstate`: the event's stored path is written back via `setPath`.
 *
 * We don't touch the URL itself — only the history state object — so routing
 * within the SPA stays unchanged.
 */
export function useViewerHistoryNav(
  path: string | null,
  setPath: (next: string | null) => void,
): void {
  // Suppress the very first effect run and any change that originated from a
  // popstate event, so we never double-push or loop.
  const suppressPushRef = useRef(true);
  const lastPushedPathRef = useRef<string | null>(path);

  // Seed the initial history entry with the current viewer path.
  useEffect(() => {
    try {
      window.history.replaceState(
        { viewerPath: path },
        "",
        window.location.href,
      );
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push a new entry whenever the viewer path changes via user action.
  useEffect(() => {
    if (suppressPushRef.current) {
      suppressPushRef.current = false;
      lastPushedPathRef.current = path;
      return;
    }
    if (path === lastPushedPathRef.current) {
      return;
    }
    lastPushedPathRef.current = path;
    try {
      window.history.pushState({ viewerPath: path }, "", window.location.href);
    } catch {
      /* ignore */
    }
  }, [path]);

  // Restore the viewer path when the user hits Back / Forward.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { viewerPath?: string | null } | null;
      if (!state || state.viewerPath === undefined) {
        return;
      }
      suppressPushRef.current = true;
      lastPushedPathRef.current = state.viewerPath;
      setPath(state.viewerPath);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setPath]);
}
