import type {
  WorkspaceAppLink,
  WorkspaceEntry,
  WorkspaceEntryKind,
} from "../types";

export const reorderAppNames = (
  apps: WorkspaceAppLink[],
  fromIndex: number,
  toIndex: number,
): string[] => {
  const next = [...apps];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((app) => app.name);
};

export const sortEntries = (left: WorkspaceEntry, right: WorkspaceEntry): number => {
  const leftIsDir = left.kind === "app" || left.kind === "directory";
  const rightIsDir = right.kind === "app" || right.kind === "directory";

  if (leftIsDir !== rightIsDir) {
    return leftIsDir ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
};

export const kindBadge = (kind: WorkspaceEntryKind): string | null => {
  switch (kind) {
    case "markdown":
      return "MD";
    case "json":
      return "JSON";
    case "image":
      return "IMG";
    case "text":
      return "TXT";
    case "code":
      return "CODE";
    default:
      return null;
  }
};

export const buildChildrenByParent = (
  workspaceEntries: WorkspaceEntry[],
): Map<string | null, WorkspaceEntry[]> => {
  const grouped = new Map<string | null, WorkspaceEntry[]>();

  for (const entry of workspaceEntries) {
    const key = entry.parentRelativePath;
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  for (const [key, bucket] of grouped) {
    grouped.set(key, bucket.sort(sortEntries));
  }

  return grouped;
};

export const getSelectedAncestorPaths = (
  entryByRelativePath: Map<string, WorkspaceEntry>,
  selectedEntry: WorkspaceEntry | null,
): string[] => {
  const ancestors = new Set<string>();
  let currentParent = selectedEntry?.parentRelativePath ?? null;

  while (currentParent) {
    ancestors.add(currentParent);
    currentParent = entryByRelativePath.get(currentParent)?.parentRelativePath ?? null;
  }

  if (selectedEntry?.kind === "app") {
    ancestors.add(selectedEntry.relativePath);
  }

  return [...ancestors];
};
