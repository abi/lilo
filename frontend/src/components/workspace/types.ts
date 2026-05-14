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

export type WorkspaceFrequentDocument = {
  entry: WorkspaceEntry;
  openCount: number;
  lastOpenedAt: number;
};

export type WorkspacePreferences = {
  timeZone: string;
  defaultChatModelSelection?: {
    provider: ChatModelProvider;
    modelId: ChatModelId;
  };
  automationOutputChannel?: AutomationOutputChannel;
  gitRemoteUrl?: string;
  gitBrowserUrl?: string;
};

export type AutomationOutputChannel = "email" | "telegram" | "whatsapp";

export type WorkspaceTemplateUpdate = {
  appName: string;
  displayName?: string;
  currentVersion: string | null;
  latestVersion: string;
};

export type WorkspaceSkill = {
  name: string;
  description: string;
  source: "workspace" | "workspace-agents";
  sourceLabel: string;
  directoryRelativePath: string;
  skillFileRelativePath: string;
  viewerPath: string;
};

export type WorkspaceSkillDiagnostic = {
  level: "warning" | "error";
  message: string;
  path?: string;
};
