import type { WorkspaceAppLink, WorkspaceEntry } from "../types";
import { WorkspaceTreeNode } from "./WorkspaceTreeNode";

interface WorkspaceTreeProps {
  entries: WorkspaceEntry[];
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

export function WorkspaceTree({
  entries,
  workspaceApps,
  childrenByParent,
  expandedPaths,
  selectedViewerPath,
  selectedEntry,
  onSelectApp,
  onToggleExpanded,
  onSetExpanded,
  onReorderApps,
}: WorkspaceTreeProps) {
  return (
    <>
      {entries.map((entry) => (
        <WorkspaceTreeNode
          key={entry.relativePath}
          entry={entry}
          depth={0}
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
    </>
  );
}
