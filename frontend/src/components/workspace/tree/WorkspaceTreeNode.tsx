import { EntryIcon } from "../EntryIcon";
import { kindBadge, reorderAppNames } from "../lib/workspaceTree";
import type { WorkspaceAppLink, WorkspaceEntry } from "../types";

interface WorkspaceTreeNodeProps {
  entry: WorkspaceEntry;
  depth: number;
  workspaceApps: WorkspaceAppLink[];
  childrenByParent: Map<string | null, WorkspaceEntry[]>;
  expandedPaths: string[];
  selectedViewerPath: string | null;
  selectedEntry: WorkspaceEntry | null;
  onSelectApp: (href: string) => void;
  onToggleExpanded: (relativePath: string) => void;
  onSetExpanded: (relativePath: string, expanded: boolean) => void;
  onReorderApps?: (appNames: string[]) => void;
}

export function WorkspaceTreeNode({
  entry,
  depth,
  workspaceApps,
  childrenByParent,
  expandedPaths,
  selectedViewerPath,
  selectedEntry,
  onSelectApp,
  onToggleExpanded,
  onSetExpanded,
  onReorderApps,
}: WorkspaceTreeNodeProps) {
  const children = childrenByParent.get(entry.relativePath) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedPaths.includes(entry.relativePath);
  const isSelected = entry.viewerPath !== null && selectedViewerPath === entry.viewerPath;
  const isContextSelected =
    entry.kind === "app" ? selectedEntry?.appName === entry.name || isSelected : isSelected;
  const appIndex = workspaceApps.findIndex((app) => app.name === entry.name);
  const badge = kindBadge(entry.kind);

  return (
    <div key={entry.relativePath} className="space-y-0.5">
      <div
        className={`flex items-center gap-1 rounded-lg ${
          isContextSelected
            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
            : "text-neutral-700 dark:text-neutral-300"
        }`}
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <button
          type="button"
          onClick={() => {
            if (hasChildren) {
              onToggleExpanded(entry.relativePath);
            }
          }}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-400 transition ${
            hasChildren
              ? "hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              : "opacity-30"
          }`}
          aria-label={hasChildren ? `Toggle ${entry.name}` : undefined}
          disabled={!hasChildren}
        >
          <svg
            className={`h-3 w-3 transition ${isExpanded ? "rotate-90" : ""}`}
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

        <button
          type="button"
          onClick={() => {
            if (entry.viewerPath) {
              if (entry.kind === "app" && hasChildren && !isExpanded) {
                onSetExpanded(entry.relativePath, true);
              }
              onSelectApp(entry.viewerPath);
              return;
            }

            if (hasChildren) {
              onToggleExpanded(entry.relativePath);
            }
          }}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition ${
            isContextSelected
              ? ""
              : "hover:bg-neutral-50 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          }`}
        >
          <EntryIcon entry={entry} />
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {badge ? (
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
              {badge}
            </span>
          ) : null}
        </button>

        {entry.kind === "app" && onReorderApps && appIndex !== -1 ? (
          <span
            className="ml-auto flex items-center gap-1 pr-1"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() =>
                onReorderApps(reorderAppNames(workspaceApps, appIndex, appIndex - 1))
              }
              disabled={appIndex === 0}
              className="rounded p-1 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-500 disabled:cursor-default disabled:opacity-30 dark:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
              title="Move up"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() =>
                onReorderApps(reorderAppNames(workspaceApps, appIndex, appIndex + 1))
              }
              disabled={appIndex === workspaceApps.length - 1}
              className="rounded p-1 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-500 disabled:cursor-default disabled:opacity-30 dark:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
              title="Move down"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </span>
        ) : null}
      </div>

      {hasChildren && isExpanded ? (
        <div className="ml-4 border-l border-neutral-200 pl-1 dark:border-neutral-700">
          {children.map((child) => (
            <WorkspaceTreeNode
              key={child.relativePath}
              entry={child}
              depth={depth + 1}
              workspaceApps={workspaceApps}
              childrenByParent={childrenByParent}
              expandedPaths={expandedPaths}
              selectedViewerPath={selectedViewerPath}
              selectedEntry={selectedEntry}
              onSelectApp={onSelectApp}
              onToggleExpanded={onToggleExpanded}
              onSetExpanded={onSetExpanded}
              onReorderApps={onReorderApps}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
