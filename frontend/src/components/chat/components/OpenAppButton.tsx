import type { ChatMessage } from "../../../store/chatStore";
import type { WorkspaceAppViewer } from "../types";

interface OpenAppButtonProps {
  message: ChatMessage;
  workspaceApps: WorkspaceAppViewer[];
  onOpenViewerApp?: (viewerPath: string) => void;
}

export function OpenAppButton({
  message,
  workspaceApps,
  onOpenViewerApp,
}: OpenAppButtonProps) {
  const appName = message.appName ?? "app";
  const matchedApp = workspaceApps.find((app) => app.name === appName);
  const appIcon = matchedApp?.iconHref;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:bg-neutral-50 active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-800/80 dark:hover:bg-neutral-800"
      onClick={() => message.viewerPath && onOpenViewerApp?.(message.viewerPath)}
    >
      {appIcon ? (
        <img
          src={appIcon}
          alt={`${appName} icon`}
          className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-black/5"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 shadow-sm ring-1 ring-black/5 dark:bg-neutral-700">
          <svg
            className="h-5 w-5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M2 3h20v14H2z" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>
      )}
      <span className="flex-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        Open {appName}
      </span>
      <svg
        className="h-5 w-5 text-neutral-300 dark:text-neutral-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
