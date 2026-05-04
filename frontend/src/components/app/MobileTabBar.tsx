import { useEffect, useMemo, useState } from "react";
import { WorkspaceSettingsButton } from "../workspace/WorkspaceSettingsButton";
import type { WorkspaceAppLink, WorkspacePreferences, WorkspaceTemplateUpdate } from "../workspace/types";
import type { MobileView } from "./types";

interface MobileTabBarProps {
  mobileView: MobileView;
  workspaceApps: WorkspaceAppLink[];
  selectedViewerPath: string | null;
  workspaceTimeZone: string;
  workspaceGitRemoteUrl?: string;
  workspaceGitBrowserUrl?: string;
  defaultChatModelSelection?: WorkspacePreferences["defaultChatModelSelection"];
  templateUpdates?: WorkspaceTemplateUpdate[];
  theme: "light" | "dark" | "system";
  onOpenChats: () => void;
  onOpenHome: () => void;
  onOpenAutomations: () => void;
  onOpenWorkspaceOrViewer: (app?: WorkspaceAppLink) => void;
  onSaveWorkspaceTimeZone: (timeZone: string) => void;
  onDefaultChatModelChange: (
    selection: NonNullable<WorkspacePreferences["defaultChatModelSelection"]>,
  ) => Promise<void> | void;
  onRequestTemplateUpdate?: (update: WorkspaceTemplateUpdate) => void;
  onDismissTemplateUpdate?: (update: WorkspaceTemplateUpdate) => Promise<void> | void;
  onSelectTheme: (theme: "light" | "dark" | "system") => void;
}

export function MobileTabBar({
  mobileView,
  workspaceApps,
  selectedViewerPath,
  workspaceTimeZone,
  workspaceGitRemoteUrl,
  workspaceGitBrowserUrl,
  defaultChatModelSelection,
  templateUpdates = [],
  theme,
  onOpenChats,
  onOpenHome,
  onOpenAutomations,
  onOpenWorkspaceOrViewer,
  onSaveWorkspaceTimeZone,
  onDefaultChatModelChange,
  onRequestTemplateUpdate,
  onDismissTemplateUpdate,
  onSelectTheme,
}: MobileTabBarProps) {
  // The "Home" tab is Lilo's native launcher. The third tab shows whatever
  // app is currently selected, and remembers the most recent app so the tab
  // keeps that app's icon/name after the user navigates back home.
  const currentApp = workspaceApps.find(
    (app) =>
      selectedViewerPath === app.href ||
      selectedViewerPath === app.viewerPath ||
      selectedViewerPath?.startsWith(`${app.href}/`),
  );
  const isOnOtherApp =
    mobileView === "viewer" || mobileView === "workspace";

  const [rememberedAppName, setRememberedAppName] = useState<string | null>(null);
  useEffect(() => {
    if (currentApp) {
      setRememberedAppName(currentApp.name);
    }
  }, [currentApp]);

  // Resolve the remembered name against the live workspaceApps list so the
  // tab tracks renames / icon changes and gracefully clears if the app gets
  // removed.
  const rememberedApp = useMemo(() => {
    if (!rememberedAppName) return null;
    return workspaceApps.find((app) => app.name === rememberedAppName) ?? null;
  }, [rememberedAppName, workspaceApps]);

  const otherApp = currentApp ?? rememberedApp;
  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[11px] font-medium transition min-h-[56px] ${
      active ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-400"
    }`;

  return (
    <nav className="flex shrink-0 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-neutral-700 dark:bg-neutral-900 md:hidden">
      <button
        type="button"
        onClick={onOpenChats}
        className={tabClass(mobileView === "chats")}
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        Chats
      </button>
      <button
        type="button"
        onClick={onOpenHome}
        className={tabClass(mobileView === "home")}
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
        Home
      </button>
      <button
        type="button"
        onClick={() => {
          // If we have a remembered/current non-desktop app and the user
          // isn't already viewing it, jump straight to that app. Otherwise
          // fall through to the default "open workspace or current viewer"
          // behavior.
          if (otherApp && !isOnOtherApp) {
            onOpenWorkspaceOrViewer(otherApp);
          } else {
            onOpenWorkspaceOrViewer();
          }
        }}
        className={tabClass(isOnOtherApp)}
      >
        {otherApp?.iconHref ? (
          <img
            src={otherApp.iconHref}
            alt={`${otherApp.name} icon`}
            className="h-6 w-6 rounded-md object-cover"
          />
        ) : (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
        )}
        {otherApp?.name ?? "Apps"}
      </button>
      <button
        type="button"
        onClick={onOpenAutomations}
        className={tabClass(mobileView === "automations")}
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M3 10h18" />
          <path d="M12 14v3l2 1" />
        </svg>
        Automations
      </button>
      <WorkspaceSettingsButton
        workspaceTimeZone={workspaceTimeZone}
        workspaceGitRemoteUrl={workspaceGitRemoteUrl}
        workspaceGitBrowserUrl={workspaceGitBrowserUrl}
        defaultChatModelSelection={defaultChatModelSelection}
        templateUpdates={templateUpdates}
        onRequestTemplateUpdate={onRequestTemplateUpdate}
        onDismissTemplateUpdate={onDismissTemplateUpdate}
        onOpenAutomations={onOpenAutomations}
        onTimeZoneChange={onSaveWorkspaceTimeZone}
        onDefaultChatModelChange={onDefaultChatModelChange}
        theme={theme}
        onSelectTheme={onSelectTheme}
        title="Settings"
        label="Settings"
        triggerClassName={tabClass(false)}
        triggerIconClassName="h-6 w-6"
      />
    </nav>
  );
}
