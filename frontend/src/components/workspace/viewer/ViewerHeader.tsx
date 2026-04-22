import { useId } from "react";
import type { WorkspaceEntry } from "../types";

interface ViewerHeaderProps {
  mobile?: boolean;
  title: string;
  kindLabel: string | null;
  selectedEntry: WorkspaceEntry | null;
  selectedViewerUrl: string | null;
  onBack?: () => void;
  onRefresh: () => void;
}

export function ViewerHeader({
  mobile = false,
  title,
  selectedEntry,
  selectedViewerUrl,
  onBack,
  onRefresh,
}: ViewerHeaderProps) {
  const logoGradientId = useId().replace(/:/g, "");

  const mobileBackMark =
    selectedEntry?.kind === "app" && selectedEntry.iconHref ? (
      <img
        src={selectedEntry.iconHref}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg border border-neutral-200 object-cover dark:border-neutral-600"
      />
    ) : selectedEntry?.kind === "app" ? (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-200 text-sm font-bold uppercase text-neutral-600 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
        {title.charAt(0)}
      </div>
    ) : (
      <svg viewBox="0 0 2048 1837" className="h-9 w-9 shrink-0" aria-hidden>
        <defs>
          <linearGradient
            id={logoGradientId}
            x1="247.588"
            y1="385.958"
            x2="1526.08"
            y2="1642.72"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#00d4aa" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${logoGradientId})`}
          d="M 637.537 154.42 C 687.037 152.046 744.732 155.51 793.933 161.548 C 1005.35 187.302 1204.5 274.743 1366.53 412.96 C 1587.76 601.684 1723.95 871.333 1744.54 1161.39 C 1747.44 1198.78 1748.56 1248.63 1744.75 1285.3 C 1735.18 1376.08 1698.31 1461.82 1639.01 1531.22 C 1556.67 1627.25 1447.96 1679.26 1322.68 1688.9 C 1263.78 1690.31 1205.62 1689.88 1146.71 1689.88 L 895.102 1689.87 L 737.873 1689.86 C 676.216 1689.9 625.867 1692.38 565.102 1679.03 C 491.64 1662.77 423.431 1628.34 366.723 1578.89 C 276.394 1500.52 220.892 1389.47 212.422 1270.18 C 209.77 1229.72 211.047 1180.06 211.047 1138.77 L 211.057 920.065 L 211.059 707.633 C 211.054 640.647 207.439 573.144 221.904 507.66 C 238.248 433.914 272.848 365.452 322.531 308.555 C 402.429 216.77 516.037 161.181 637.537 154.42 z"
        />
        <path
          fill="#f5f5f5"
          d="M 957.843 634.507 C 1116.65 622.701 1254.89 742.029 1266.41 900.858 C 1277.93 1059.69 1158.35 1197.71 999.501 1208.94 C 841.057 1220.14 703.463 1100.94 691.974 942.516 C 680.485 784.093 799.441 646.283 957.843 634.507 z"
        />
      </svg>
    );

  if (mobile) {
    return (
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
        <button
          type="button"
          onClick={onBack}
          className="flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-2 text-left text-neutral-900 transition hover:bg-neutral-100 active:opacity-70 dark:text-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Back to home"
        >
          <svg
            className="h-6 w-6 shrink-0 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {mobileBackMark}
          <span className="truncate font-heading text-lg font-semibold tracking-tight">{title}</span>
        </button>
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-900 active:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 dark:active:bg-neutral-800"
            onClick={onRefresh}
            disabled={!selectedViewerUrl}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5 px-1.5 py-1">
          {selectedEntry?.kind === "app" && selectedEntry.iconHref ? (
            <img
              src={selectedEntry.iconHref}
              alt=""
              className="h-7 w-7 shrink-0 rounded-lg border border-neutral-200 object-cover dark:border-neutral-600"
            />
          ) : selectedEntry?.kind === "app" ? (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-200 text-xs font-bold uppercase text-neutral-600 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
              {title.charAt(0)}
            </div>
          ) : null}
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {title}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
            onClick={onRefresh}
            disabled={!selectedViewerUrl}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
