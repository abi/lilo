import { useEffect, useRef } from "react";

interface LiloLogoProps {
  className?: string;
}

// Outer blob outline — reused as a clip-path so the "eyeball" never crosses
// the blue silhouette, no matter how far the cursor is.
const BLOB_PATH =
  "m67.7 119.9c-43.3 0-66.5 0.1-66.5-38.9 0-47.9 6.3-79.9 35.5-79.9 28.5 0 82.1 37.2 82.1 80.6 0 25.5-15.6 38.2-38.6 38.2-4.3 0.1-8.6 0.1-12.5 0z";

/**
 * Inlined Lilo mascot (kept in sync with `frontend/public/favicon.svg`). The
 * eyeball (the inner iris group — dark ring, bright ring, white center) is
 * mounted in its own `<g>` so it can translate inside the blob. On mount it
 * plays a short "wake up" look-around; afterwards it follows the cursor.
 *
 * If you tweak colors/shapes here, mirror them into `favicon.svg` (and the
 * `favicon-working.svg` / `favicon-done.svg` siblings) so the browser tab,
 * apple-touch-icon, and sidebar stay visually consistent.
 */
export function LiloLogo({ className }: LiloLogoProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyeRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const eye = eyeRef.current;
    if (!svg || !eye) return;

    // Translation budget in CSS pixels. Calibrated for the 36 px sidebar —
    // 14 px is roughly 40 % of the icon width, so the eye sweeps almost to
    // the blob edge. The clipPath makes anything beyond that safe.
    const MAX_OFFSET_PX = 14;
    // Cursor distance (in px) at which the eye reaches MAX_OFFSET_PX. Lower
    // than the blob size so small cursor moves produce visible eye travel.
    const FOLLOW_DISTANCE_PX = 220;

    const setEye = (dx: number, dy: number) => {
      eye.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    // --- "Wake up" look-around on mount ----------------------------------
    const timeouts: number[] = [];
    const wakeup: Array<{ dx: number; dy: number; at: number }> = [
      { dx: 0, dy: 0, at: 0 },
      { dx: -MAX_OFFSET_PX, dy: MAX_OFFSET_PX * 0.2, at: 380 },
      { dx: MAX_OFFSET_PX, dy: -MAX_OFFSET_PX * 0.2, at: 760 },
      { dx: 0, dy: MAX_OFFSET_PX * 0.7, at: 1100 },
      { dx: 0, dy: 0, at: 1440 },
    ];
    for (const { dx, dy, at } of wakeup) {
      timeouts.push(window.setTimeout(() => setEye(dx, dy), at));
    }

    // --- Cursor follow (starts once the wake-up sequence ends) -----------
    let rafId: number | null = null;
    let latestX = 0;
    let latestY = 0;

    const applyFollow = () => {
      rafId = null;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = latestX - cx;
      const dy = latestY - cy;
      const mag = Math.hypot(dx, dy);
      if (mag === 0) {
        setEye(0, 0);
        return;
      }
      const scale = Math.min(1, mag / FOLLOW_DISTANCE_PX) * MAX_OFFSET_PX;
      setEye((dx / mag) * scale, (dy / mag) * scale);
    };

    const onMouseMove = (e: MouseEvent) => {
      latestX = e.clientX;
      latestY = e.clientY;
      if (rafId === null) rafId = requestAnimationFrame(applyFollow);
    };

    const startFollow = window.setTimeout(() => {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
    }, 1500);
    timeouts.push(startFollow);

    return () => {
      for (const id of timeouts) window.clearTimeout(id);
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 126"
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient
          id="liloLogo_shadow"
          cx="60"
          cy="112.4"
          r="54.15"
          gradientTransform="matrix(1 0 0 .3 0 78.68)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4E5178" offset="0" />
          <stop stopColor="#4E5178" stopOpacity="0" offset="1" />
        </radialGradient>
        <linearGradient
          id="liloLogo_blob"
          x1="12.2"
          x2="107.4"
          y1="10.14"
          y2="110.8"
          gradientTransform="matrix(1 0 0 -1 0 126)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#10119E" offset="0" />
          <stop stopColor="#290BAF" offset=".6066" />
          <stop stopColor="#2D0995" offset="1" />
        </linearGradient>
        <linearGradient
          id="liloLogo_hull"
          x1="10.6"
          x2="108.9"
          y1="108.5"
          y2="20.96"
          gradientTransform="matrix(1 0 0 -1 0 126)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#23006A" offset="0" />
          <stop stopColor="#290BAF" offset=".4543" />
          <stop stopColor="#0046F2" offset="1" />
        </linearGradient>
        <linearGradient
          id="liloLogo_iris"
          x1="37.4"
          x2="80.3"
          y1="68.3"
          y2="68.3"
          gradientTransform="matrix(1 0 0 -1 0 126)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#290BAF" offset="0" />
          <stop stopColor="#6143FD" offset=".2646" />
          <stop stopColor="#290BAF" offset=".708" />
          <stop stopColor="#190060" offset=".9987" />
        </linearGradient>
        <linearGradient
          id="liloLogo_iris2"
          x1="38"
          x2="79.7"
          y1="68.45"
          y2="68.45"
          gradientTransform="matrix(1 0 0 -1 0 126)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#290BAF" offset="0" />
          <stop stopColor="#6143FD" offset=".25" />
          <stop stopColor="#F3E8FF" offset=".75" />
          <stop stopColor="#290BAF" offset="1" />
        </linearGradient>
        <linearGradient
          id="liloLogo_gleam"
          x1="36.54"
          x2="101.4"
          y1="123.9"
          y2="80.23"
          gradientTransform="matrix(1 0 0 -1 0 126)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5816B8" offset=".1181" />
          <stop stopColor="#fff" offset=".3033" />
          <stop stopColor="#7837EF" offset=".6949" />
          <stop stopColor="#F3E8FF" offset=".8902" />
          <stop stopColor="#7837EF" offset="1" />
        </linearGradient>
        <linearGradient
          id="liloLogo_edge"
          x1="107.5"
          x2="107.5"
          y1="21.4"
          y2="82.7"
          gradientTransform="matrix(1 0 0 -1 0 126)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1681FF" offset="0" />
          <stop stopColor="#6EE0FF" offset=".48" />
          <stop stopColor="#F3E8FF" offset="1" />
        </linearGradient>
        <linearGradient
          id="liloLogo_fade"
          x1="2.7"
          x2="89.7"
          y1="58.1"
          y2="58.1"
          gradientTransform="matrix(1 0 0 -1 0 126)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2B1476" offset="0" />
          <stop stopColor="#4354E8" offset=".28" />
          <stop stopColor="#10119E" offset=".65" />
          <stop stopColor="#4354E8" stopOpacity="0" offset="1" />
        </linearGradient>
        {/* Clip the eye so it can never leak beyond the blue silhouette. */}
        <clipPath id="liloLogo_blobClip">
          <path d={BLOB_PATH} />
        </clipPath>
      </defs>

      <ellipse fill="url(#liloLogo_shadow)" cx="60" cy="112.4" rx="55.4" ry="11.6" />
      <path
        fill="url(#liloLogo_blob)"
        d="m67.7 119.9c-43.3 0-66.5 0.1-66.5-38.9 0-47.9 6.3-79.9 35.5-79.9 28.5 0 82.1 37.2 82.1 80.6 0 25.5-15.6 38.2-38.6 38.2-4.3 0.1-8.6 0.1-12.5 0z"
      />
      <path
        fill="#6143D1"
        d="m36.7 2.6c22.8 0 56.4 20.9 72.2 48.2-16.1-26.4-49.1-47.8-71.6-47.8-24.9 0-34 23.6-34 70.2 0 2.8 0 5.4 0.1 7.8-0.5-47 8.4-78.4 33.3-78.4z"
      />
      <path
        fill="url(#liloLogo_hull)"
        d="m36.1 2.7c-25 0-33.8 28.3-33.8 72.5 0 33.4 8.4 42.8 46.8 42.8h26.8c24 0 40.8-8.3 40.8-36.5 0-31.2-43.1-78.8-80.6-78.8zm23.4 74.9c-10.2 0-19.5-7.7-19.5-19.6 0-9.5 7.6-20.5 20-20.5 9.8 0 18.4 8.2 18.4 20.5 0 10-6.6 19.6-18.9 19.6z"
      />

      {/* Eyeball — the three iris layers translate as one group, clipped to the blob. */}
      <g clipPath="url(#liloLogo_blobClip)">
        <g
          ref={eyeRef}
          style={{
            transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <path
            fill="url(#liloLogo_iris)"
            d="m59.7 35.9c-10.4 0-22.3 8.2-22.3 21.6 0 12.3 8.3 22 21.8 22 13.4 0 21.1-9.2 21.1-22s-9.7-21.6-20.6-21.6zm-0.3 41.7c-10.1 0-19.4-7.7-19.4-19.6 0-9.5 7.6-20.5 20-20.5 9.8 0 18.4 8.2 18.4 20.5 0 10-6.6 19.6-19 19.6z"
          />
          <path
            fill="url(#liloLogo_iris2)"
            d="m59.6 36.6c-10 0-21.6 7.8-21.6 20.6 0 11.8 7.9 21.9 20.8 21.9 12.8 0 20.9-8.3 20.9-20.6s-9.5-21.9-20.1-21.9zm-0.3 41c-10.1 0-19.3-7.7-19.3-19.6 0-9.5 7.6-20.5 20-20.5 9.8 0 18.4 8.2 18.4 20.5 0 10-6.7 19.6-19.1 19.6z"
          />
          <path
            fill="#F5F5F5"
            d="m60 37.5c-11.1 0-20 8.6-20 20.5 0 10.7 7.9 19.6 19.3 19.6 10.6 0 19.1-7.9 19.1-19.6 0-10.7-7.9-20.5-18.4-20.5z"
          />
        </g>
      </g>

      <path
        fill="url(#liloLogo_gleam)"
        d="m36.7 1.4c-0.8 0-1.5 0-2.3 0.1 5.5-1.1 24.2-2 50.7 18.6 6.4 5 15 13.3 21.3 22.7-16.9-21.2-45.2-41.4-69.7-41.4z"
      />
      <path
        fill="url(#liloLogo_edge)"
        d="m108.4 52.4c5.4 8.9 9.1 18.6 9.1 28.7 0 9.4-2.1 17.8-7.6 23.5 4.5-5.7 6.7-13.5 6.7-23.5 0-20.6-15.2-39.7-19.1-44.2 2.1 2.4 7.4 8.8 10.9 15.5z"
      />
      <path
        fill="url(#liloLogo_fade)"
        d="m2.7 81c0.3 25.8 12.1 35.8 43.1 36.3l34.5 0.5c3.3 0 6.5-0.3 9.4-0.8-4.2 0.7-8.8 1-13.8 1h-26.8c-37.5 0-46.3-9-46.4-39.8v2.8z"
      />
    </svg>
  );
}
