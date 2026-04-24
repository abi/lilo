export type WorkspaceAppLink = {
  name: string;
  displayName?: string;
  href: string;
  viewerPath: string;
  iconHref?: string;
  archived?: boolean;
};

export type WorkspaceEntryKind =
  | "app"
  | "directory"
  | "markdown"
  | "json"
  | "image"
  | "text"
  | "code"
  | "binary";

export type WorkspaceEntry = {
  name: string;
  relativePath: string;
  parentRelativePath: string | null;
  kind: WorkspaceEntryKind;
  viewerPath: string | null;
  appName?: string;
  iconHref?: string;
  archived?: boolean;
};

export type WorkspacePreferences = {
  timeZone: string;
  gitRemoteUrl?: string;
};
