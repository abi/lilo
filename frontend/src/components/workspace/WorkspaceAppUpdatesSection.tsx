import type { WorkspaceTemplateUpdate } from "./types";

interface WorkspaceAppUpdatesSectionProps {
  templateUpdates: WorkspaceTemplateUpdate[];
  onRequestTemplateUpdate: (update: WorkspaceTemplateUpdate) => void;
  className?: string;
}

const formatVersion = (version: string | null): string =>
  version ? `v${version}` : "Untracked";

export function WorkspaceAppUpdatesSection({
  templateUpdates,
  onRequestTemplateUpdate,
  className = "border-b border-neutral-200 px-4 py-4 dark:border-neutral-700",
}: WorkspaceAppUpdatesSectionProps) {
  const hasUpdates = templateUpdates.length > 0;

  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            App Updates
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Compare bundled template apps with this workspace, then ask the agent to port updates.
          </p>
        </div>
        {hasUpdates ? (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            {templateUpdates.length} ready
          </span>
        ) : null}
      </div>

      {!hasUpdates ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          All workspace apps are up to date with the bundled templates.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {templateUpdates.map((update) => {
            const label = update.displayName ?? update.appName;

            return (
              <article
                key={update.appName}
                className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm dark:border-amber-500/25 dark:bg-amber-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {formatVersion(update.currentVersion)} → {formatVersion(update.latestVersion)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
                    onClick={() => onRequestTemplateUpdate(update)}
                  >
                    Ask agent
                  </button>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                  Ask the agent to compare the bundled template with your workspace copy and port the update.
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
