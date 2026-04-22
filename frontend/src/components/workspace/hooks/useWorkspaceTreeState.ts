import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildChildrenByParent,
  getSelectedAncestorPaths,
} from "../lib/workspaceTree";
import type { WorkspaceAppLink, WorkspaceEntry } from "../types";

interface UseWorkspaceTreeStateOptions {
  workspaceApps: WorkspaceAppLink[];
  workspaceEntries: WorkspaceEntry[];
  selectedViewerPath: string | null;
}

export function useWorkspaceTreeState({
  workspaceApps,
  workspaceEntries,
  selectedViewerPath,
}: UseWorkspaceTreeStateOptions) {
  const [showArchived, setShowArchived] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);

  const entryByRelativePath = useMemo(
    () => new Map(workspaceEntries.map((entry) => [entry.relativePath, entry])),
    [workspaceEntries],
  );

  const childrenByParent = useMemo(
    () => buildChildrenByParent(workspaceEntries),
    [workspaceEntries],
  );

  const selectedEntry = useMemo(
    () =>
      workspaceEntries.find((entry) => entry.viewerPath === selectedViewerPath) ?? null,
    [workspaceEntries, selectedViewerPath],
  );

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    const selectedAppName =
      selectedEntry.kind === "app" ? selectedEntry.name : selectedEntry.appName;
    if (!selectedAppName) {
      return;
    }

    const selectedApp = workspaceApps.find((app) => app.name === selectedAppName);
    if (selectedApp?.archived) {
      setShowArchived(true);
    }
  }, [selectedEntry, workspaceApps]);

  const selectedAncestorPaths = useMemo(
    () => getSelectedAncestorPaths(entryByRelativePath, selectedEntry),
    [entryByRelativePath, selectedEntry],
  );

  useEffect(() => {
    if (selectedAncestorPaths.length === 0) {
      return;
    }

    setExpandedPaths((current) => {
      const next = new Set(current);
      for (const path of selectedAncestorPaths) {
        next.add(path);
      }
      return [...next];
    });
  }, [selectedAncestorPaths]);

  const visibleAppEntries = useMemo(
    () =>
      workspaceApps
        .filter((app) => !app.archived)
        .map((app) => entryByRelativePath.get(app.name))
        .filter((entry): entry is WorkspaceEntry => Boolean(entry)),
    [entryByRelativePath, workspaceApps],
  );

  const archivedAppEntries = useMemo(
    () =>
      workspaceApps
        .filter((app) => app.archived)
        .map((app) => entryByRelativePath.get(app.name))
        .filter((entry): entry is WorkspaceEntry => Boolean(entry)),
    [entryByRelativePath, workspaceApps],
  );

  const otherTopLevelEntries = useMemo(
    () =>
      (childrenByParent.get(null) ?? []).filter((entry) => entry.kind !== "app"),
    [childrenByParent],
  );

  const toggleExpanded = useCallback((relativePath: string) => {
    setExpandedPaths((current) =>
      current.includes(relativePath)
        ? current.filter((value) => value !== relativePath)
        : [...current, relativePath],
    );
  }, []);

  const setExpanded = useCallback((relativePath: string, expanded: boolean) => {
    setExpandedPaths((current) => {
      const exists = current.includes(relativePath);
      if (expanded && !exists) {
        return [...current, relativePath];
      }

      if (!expanded && exists) {
        return current.filter((value) => value !== relativePath);
      }

      return current;
    });
  }, []);

  return {
    showArchived,
    setShowArchived,
    expandedPaths,
    childrenByParent,
    selectedEntry,
    visibleAppEntries,
    archivedAppEntries,
    otherTopLevelEntries,
    toggleExpanded,
    setExpanded,
  };
}
