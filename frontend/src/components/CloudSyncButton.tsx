import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, ENABLE_WORKSPACE_SYNC } from "../config/runtime";
import { authFetch } from "../lib/auth";

type SyncState = "idle" | "syncing" | "done" | "error";

interface CloudSyncButtonProps {
  onSynced: () => void;
  onError?: (error: string) => void;
  /** Error message set by an external silent sync — shows error badge without user interaction */
  externalError?: string | null;
  /** Called when the user dismisses (clicks) or the external error times out */
  onClearExternalError?: () => void;
  className?: string;
  compact?: boolean;
  /** Fixed chip height / padding to align with other viewer header toolbar buttons (mobile). */
  toolbarChip?: boolean;
  /** Vertical icon-above-label style for the collapsed sidebar strip. */
  vertical?: boolean;
}

const stateStyles: Record<SyncState, string> = {
  syncing: "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-400",
  done: "border-green-300 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-950 dark:text-green-400",
  error: "border-red-300 bg-red-50 text-red-600 dark:border-red-600 dark:bg-red-950 dark:text-red-400",
  idle: "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};


const SpinnerIcon = () => (
  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ErrorIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

/** Cloud + upload arrow — distinct from the viewer “reload” circular-arrows icon */
const SyncIcon = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 13v8" />
    <path d="m4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="m8 17 4-4 4 4" />
  </svg>
);

const icons: Record<SyncState, React.FC> = {
  syncing: SpinnerIcon,
  done: CheckIcon,
  error: ErrorIcon,
  idle: SyncIcon,
};

export function CloudSyncButton({
  onSynced,
  onError,
  externalError,
  onClearExternalError,
  className = "",
  compact = false,
  toolbarChip = false,
  vertical = false,
}: CloudSyncButtonProps) {
  if (!ENABLE_WORKSPACE_SYNC) {
    return null;
  }

  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Show external errors (from silent sync) on the button
  useEffect(() => {
    if (!externalError) return;
    // Don't override an active manual sync
    if (syncState === "syncing") return;
    setSyncState("error");
    setStatusMsg(externalError);
    const timer = setTimeout(() => {
      setSyncState("idle");
      onClearExternalError?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [externalError, onClearExternalError, syncState]);

  const sync = useCallback(async () => {
    if (syncState === "syncing") return;
    onClearExternalError?.();
    setSyncState("syncing");
    setStatusMsg(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/workspace/sync`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = body?.details ?? body?.error ?? `Sync failed (${res.status})`;
        setStatusMsg(msg);
        setSyncState("error");
        setTimeout(() => setSyncState("idle"), 4000);
        onError?.(`Cloud sync failed: ${msg}`);
        return;
      }
      onSynced();
      if (body?.lastCommit) {
        setStatusMsg(body.lastCommit);
      }
      setSyncState("done");
      setTimeout(() => setSyncState("idle"), 4000);
    } catch {
      setStatusMsg("Network error");
      setSyncState("error");
      setTimeout(() => setSyncState("idle"), 4000);
      onError?.("Cloud sync failed: Network error");
    }
  }, [syncState, onClearExternalError, onError, onSynced]);

  const Icon = icons[syncState];
  const hoverClass = syncState === "idle" ? "hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-200" : "";
  const compactSize =
    compact && toolbarChip
      ? "h-9 min-h-9 shrink-0 px-2.5 py-0"
      : compact
        ? "px-3 py-1.5"
        : "px-2.5 py-1.5";

  const label =
    syncState === "error" ? "Sync failed" : syncState === "idle" ? "Sync" : syncState === "done" ? "Synced" : "Syncing\u2026";

  if (vertical) {
    const verticalState =
      syncState === "syncing"
        ? "text-blue-600 dark:text-blue-400"
        : syncState === "done"
          ? "text-green-600 dark:text-green-400"
          : syncState === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300";
    return (
      <button
        type="button"
        title={statusMsg ?? label}
        className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition disabled:cursor-not-allowed ${verticalState} ${className}`}
        onClick={() => void sync()}
        disabled={syncState === "syncing"}
      >
        <span className="flex h-5 w-5 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
          <Icon />
        </span>
        <span className="text-[10px] font-medium">{label}</span>
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        className={`flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded border text-xs font-medium transition ${compactSize} ${stateStyles[syncState]} ${hoverClass}`}
        onClick={() => void sync()}
        disabled={syncState === "syncing"}
      >
        <Icon />
        {toolbarChip && compact ? <span className="max-w-[4.75rem] truncate">{label}</span> : label}
      </button>
      {!compact && statusMsg && syncState !== "idle" && (
        <p className={`break-words text-center text-[10px] leading-tight ${syncState === "error" ? "text-red-400" : "text-green-600 dark:text-green-400"}`}>
          {statusMsg}
        </p>
      )}
    </div>
  );
}
