import type { ChatModelId, ChatModelProvider } from "../../store/chatStore";

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
  defaultChatModelSelection?: {
    provider: ChatModelProvider;
    modelId: ChatModelId;
  };
  gitRemoteUrl?: string;
  gitBrowserUrl?: string;
};

export type WorkspaceTemplateUpdate = {
  appName: string;
  displayName?: string;
  currentVersion: string | null;
  latestVersion: string;
};
