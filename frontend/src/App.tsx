import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { CommandPalette } from "./components/app/CommandPalette";
import { AutomationsScreen } from "./components/app/AutomationsScreen";
import { DesktopCollapsedSidebarStrip } from "./components/app/DesktopCollapsedSidebarStrip";
import { DesktopSidebarPanel } from "./components/app/DesktopSidebarPanel";
import { DesktopSidebarResizeHandle } from "./components/app/DesktopSidebarResizeHandle";
import { DesktopWorkspaceChatShell } from "./components/app/DesktopWorkspaceChatShell";
import { MobileChatListScreen } from "./components/app/MobileChatListScreen";
import { MobileConversationScreen } from "./components/app/MobileConversationScreen";
import { MobileViewerScreen } from "./components/app/MobileViewerScreen";
import { MobileTabBar } from "./components/app/MobileTabBar";
import { MobileWorkspaceScreen } from "./components/app/MobileWorkspaceScreen";
import { NativeDesktopHome } from "./components/app/NativeDesktopHome";
import { StartupErrorBanner } from "./components/app/StartupErrorBanner";
import { useAgentActivity } from "./hooks/useAgentActivity";
import { useAppChats } from "./hooks/useAppChats";
import { useCompletionSound } from "./hooks/useCompletionSound";
import { useIsDesktop } from "./hooks/useMediaQuery";
import { useShellNavigation } from "./hooks/useShellNavigation";
import { useViewerHistoryNav } from "./hooks/useViewerHistoryNav";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { useWorkspaceTemplateUpdateRequest } from "./hooks/useWorkspaceTemplateUpdateRequest";
import { useViewerElementPicker } from "./components/workspace/hooks/useViewerElementPicker";
import type { WorkspaceAppLink, WorkspaceEntry } from "./components/workspace/types";
import { type ChatElementSelection, useChatStore } from "./store/chatStore";
import { useThemeStore } from "./store/themeStore";

type RuntimeWorkspaceApp = {
  name: string;
  displayName?: string;
  href: string;
  viewerPath: string;
  iconHref?: string;
  archived: boolean;
  order: number;
};

const serializeWorkspaceApps = (
  workspaceApps: WorkspaceAppLink[],
): RuntimeWorkspaceApp[] =>
  workspaceApps.map((app, order) => ({
    name: app.name,
    displayName: app.displayName,
    href: app.href,
    viewerPath: app.viewerPath,
    iconHref: app.iconHref,
    archived: app.archived === true,
    order,
  }));

function App() {
  const [prefillComposerFocus, setPrefillComposerFocus] = useState<{
    chatId: string;
    nonce: number;
  } | null>(null);
  const [showAppChats, setShowAppChats] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const {
    chatOrder,
    chatsById,
    activeChatId,
    loadingInitial,
    initializationError,
    workspaceVersion,
    initialize,
    refreshChatList,
    createChat,
    selectChat,
    setDraft,
    addDraftSelectedElement,
    removeDraftSelectedElement,
    clearDraftSelectedElements,
    enqueueMessage,
    updateQueuedMessage,
    reorderQueuedMessage,
    removeQueuedMessage,
    setQueuePaused,
    resumeQueue,
    sendQueuedMessage,
    updateChatModel,
    sendMessage,
    retryLastMessage,
    stopChat,
    clearError,
  } = useChatStore();
  const { theme, setTheme } = useThemeStore();

  const orderedChats = useMemo(
    () =>
      chatOrder
        .map((id) => chatsById[id])
        .filter((chat): chat is NonNullable<typeof chatsById[string]> => Boolean(chat)),
    [chatOrder, chatsById],
  );
  const activeChat = activeChatId ? chatsById[activeChatId] ?? null : null;
  const {
    appChats,
    activeAppChatId,
    activeAppChat,
    loadingAppChats,
    setActiveAppChatId,
    selectAppChat,
  } = useAppChats(showAppChats);

  const prefillComposerNonce =
    activeChat?.id && activeChat.id === prefillComposerFocus?.chatId
      ? (prefillComposerFocus?.nonce ?? 0)
      : 0;

  const anyChatBusy = orderedChats.some(
    (chat) =>
      chat.status === "streaming" ||
      chat.connectionState === "connecting" ||
      chat.connectionState === "streaming" ||
      chat.isWorking,
  );

  useAgentActivity(anyChatBusy);
  useCompletionSound(anyChatBusy);

  const shell = useShellNavigation();
  const isDesktop = useIsDesktop();
  const postSystemMessage = useCallback(
    (chatId: string, message: string) => sendMessage(chatId, message),
    [sendMessage],
  );
  const workspace = useWorkspaceState({
    activeChatId,
    initializationError,
    initialize,
    workspaceVersion,
    sendMessage: postSystemMessage,
  });

  const handleCreateChat = useCallback(async () => {
    setActiveAppChatId(null);
    const chatId = await createChat({ select: true });
    await selectChat(chatId);
    shell.openConversation();
  }, [createChat, selectChat, setActiveAppChatId, shell]);

  const handleRequestTemplateUpdate = useWorkspaceTemplateUpdateRequest({
    createChat,
    selectChat,
    sendMessage,
    setActiveAppChatId,
    openConversation: shell.openConversation,
  });

  useEffect(() => {
    if (!showAppChats) {
      setActiveAppChatId(null);
    }
  }, [showAppChats, setActiveAppChatId]);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      // Switch the view first so the tap feels instant, then load. The store
      // sets `activeChatId` synchronously inside selectChat — wrapping in a
      // transition lets React keep the chat list responsive while the (often
      // heavy) ChatPane re-render and any network fetch happen in the
      // background.
      setActiveAppChatId(null);
      shell.openConversation();
      startTransition(() => {
        void selectChat(chatId);
      });
    },
    [selectChat, setActiveAppChatId, shell],
  );

  const handleSelectViewerElement = useCallback(
    async (selection: ChatElementSelection) => {
      let chatId = activeChatId;

      if (!chatId) {
        chatId = await createChat({ select: true });
        await selectChat(chatId);
      }

      shell.openConversation();
      addDraftSelectedElement(chatId, selection);
    },
    [activeChatId, createChat, selectChat, shell, addDraftSelectedElement],
  );

  const canPickElements =
    workspace.selectedWorkspaceEntry?.kind === "app" &&
    Boolean(workspace.selectedViewerUrl);
  const picker = useViewerElementPicker({
    canPickElements,
    viewerRefreshKey: workspace.viewerRefreshKey,
    selectedViewerUrl: workspace.selectedViewerUrl,
    onSelectElement: handleSelectViewerElement,
  });
  const pickerInjection = {
    iframeRef: picker.iframeRef,
    isSelectingElement: picker.isSelectingElement,
    pickerError: picker.pickerError,
    canPickElements,
    toggleSelecting: picker.toggleSelecting,
  };
  const handleMobileToggleSelecting = useCallback(() => {
    if (!canPickElements) {
      return;
    }
    if (!picker.isSelectingElement && shell.mobileView !== "viewer") {
      shell.openMobileViewer();
    }
    picker.toggleSelecting();
  }, [canPickElements, picker, shell]);

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const data = event.data;
      if (!data) {
        return;
      }

      const source = event.source as WindowProxy | null;

      if (data.type === "lilo:create-chat") {
        const shouldFocusChat = data.focus !== false;
        const chatId = await createChat({ select: shouldFocusChat });
        if (shouldFocusChat) {
          await selectChat(chatId);
          shell.openConversation();
        }
        if (data.message && data.send === true) {
          void sendMessage(chatId, data.message);
        } else if (data.message) {
          setDraft(chatId, data.message);
          if (shouldFocusChat) {
            setPrefillComposerFocus({ chatId, nonce: Date.now() });
          }
        }
        source?.postMessage(
          {
            type: "lilo:create-chat:response",
            requestId: data.requestId,
            chatId,
          },
          "*",
        );
        return;
      }

      if (data.type === "lilo:open-chat") {
        await selectChat(data.chatId);
        shell.openConversation();
        source?.postMessage(
          {
            type: "lilo:open-chat:response",
            requestId: data.requestId,
            chatId: data.chatId,
          },
          "*",
        );
        return;
      }

      if (data.type === "lilo:list-apps") {
        source?.postMessage(
          {
            type: "lilo:list-apps:response",
            requestId: data.requestId,
            apps: serializeWorkspaceApps(workspace.workspaceApps),
          },
          "*",
        );
        return;
      }

      if (data.type === "lilo:set-app-order") {
        try {
          if (
            !Array.isArray(data.appNames) ||
            data.appNames.some((value: unknown) => typeof value !== "string")
          ) {
            throw new Error("appNames must be an array of strings");
          }

          const apps = await workspace.setAppOrder(data.appNames);
          source?.postMessage(
            {
              type: "lilo:set-app-order:response",
              requestId: data.requestId,
              apps: serializeWorkspaceApps(apps),
            },
            "*",
          );
        } catch (error) {
          source?.postMessage(
            {
              type: "lilo:set-app-order:response",
              requestId: data.requestId,
              error: error instanceof Error ? error.message : "Failed to save app order",
            },
            "*",
          );
        }
        return;
      }

      if (data.type === "lilo:set-app-archived") {
        try {
          if (typeof data.appName !== "string" || data.appName.trim().length === 0) {
            throw new Error("appName must be a non-empty string");
          }
          if (typeof data.archived !== "boolean") {
            throw new Error("archived must be a boolean");
          }

          const apps = await workspace.setAppArchived(data.appName, data.archived);
          const runtimeApps = serializeWorkspaceApps(apps);
          source?.postMessage(
            {
              type: "lilo:set-app-archived:response",
              requestId: data.requestId,
              apps: runtimeApps,
              app: runtimeApps.find((app) => app.name === data.appName) ?? null,
            },
            "*",
          );
        } catch (error) {
          source?.postMessage(
            {
              type: "lilo:set-app-archived:response",
              requestId: data.requestId,
              error: error instanceof Error ? error.message : "Failed to save app archive state",
            },
            "*",
          );
        }
        return;
      }

      if (data.type === "lilo:open-viewer" && typeof data.viewerPath === "string") {
        shell.openDesktopViewer();
        workspace.setSelectedViewerPath(data.viewerPath);
        workspace.refreshViewer();
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [createChat, selectChat, sendMessage, setDraft, shell, workspace]);

  const handleOpenViewerApp = useCallback(
    (viewerPath: string) => {
      shell.openDesktopViewer();
      workspace.setSelectedViewerPath(viewerPath);
      workspace.refreshViewer();
    },
    [workspace, shell],
  );

  const handleOpenMobileViewerApp = useCallback(
    (viewerPath: string) => {
      workspace.setSelectedViewerPath(viewerPath);
      workspace.refreshViewer();
      shell.openMobileViewer();
    },
    [workspace, shell],
  );

  const handleOpenMobileWorkspaceApp = useCallback(
    (href: string) => {
      workspace.setSelectedViewerPath(href);
      shell.openMobileViewer();
    },
    [workspace, shell],
  );

  /** Mobile "Home" is Lilo's native desktop launcher. */
  const handleOpenMobileHome = useCallback(() => {
    shell.openMobileHome();
  }, [shell]);

  const handleCreateChatFromHome = useCallback(
    async (message: string) => {
      const chatId = await createChat({ select: true });
      await selectChat(chatId);
      shell.openConversation();
      await sendMessage(chatId, message);
    },
    [createChat, selectChat, sendMessage, shell],
  );

  const handleOpenAppFromPalette = useCallback(
    (app: WorkspaceAppLink) => {
      workspace.setSelectedViewerPath(app.viewerPath);
      workspace.refreshViewer();
      shell.openDesktopViewer();
      // Also switch the mobile view — harmless on desktop.
      shell.openMobileViewer();
      setIsCommandPaletteOpen(false);
    },
    [workspace, shell],
  );

  const handleOpenFileFromPalette = useCallback(
    (entry: WorkspaceEntry) => {
      if (!entry.viewerPath) {
        return;
      }

      workspace.setSelectedViewerPath(entry.viewerPath);
      workspace.refreshViewer();
      shell.openDesktopViewer();
      shell.showSidebarPanel();
      // Also switch the mobile view — harmless on desktop.
      shell.openMobileViewer();
      setIsCommandPaletteOpen(false);
    },
    [workspace, shell],
  );

  // Global Cmd/Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Back / Forward step through previously opened apps.
  useViewerHistoryNav(
    workspace.selectedViewerPath,
    workspace.setSelectedViewerPath,
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white dark:bg-neutral-900 md:h-screen md:flex-row">
      {workspace.startupErrorMessage ? (
        <StartupErrorBanner
          message={workspace.startupErrorMessage}
          onRetry={workspace.retryStartup}
        />
      ) : null}

      {isDesktop ? (
        <>
          <DesktopCollapsedSidebarStrip
            workspaceApps={workspace.workspaceApps}
            selectedViewerPath={workspace.selectedViewerPath}
            showArchived={shell.showArchivedInStrip}
            desktopMainView={shell.desktopMainView}
            desktopSidebarPanel={shell.desktopSidebarPanel}
            theme={theme}
            workspaceTimeZone={workspace.workspacePreferences.timeZone}
            workspaceGitRemoteUrl={workspace.workspacePreferences.gitRemoteUrl}
            workspaceGitBrowserUrl={workspace.workspacePreferences.gitBrowserUrl}
            defaultChatModelSelection={workspace.workspacePreferences.defaultChatModelSelection}
            templateUpdates={workspace.templateUpdates}
            onToggleWorkspacePanel={shell.toggleWorkspacePanel}
            onOpenDesktop={shell.openDesktopHome}
            onOpenAutomations={shell.openDesktopAutomations}
            onToggleArchived={shell.toggleArchivedInStrip}
            onSelectApp={handleOpenViewerApp}
            onReorderApps={workspace.saveAppOrder}
            onSelectTheme={setTheme}
            onSaveWorkspaceTimeZone={workspace.saveWorkspaceTimeZone}
            onDefaultChatModelChange={workspace.saveDefaultChatModelSelection}
            onRequestTemplateUpdate={handleRequestTemplateUpdate}
            onDismissTemplateUpdate={workspace.dismissTemplateUpdate}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onSync={workspace.onSynced}
            onSyncError={workspace.onSyncError}
            syncError={workspace.silentSyncError}
            onClearSyncError={workspace.clearSilentSyncError}
          />

          <DesktopSidebarPanel
            width={shell.leftPaneWidth}
            panel={shell.desktopSidebarPanel}
            selectedViewerPath={workspace.selectedViewerPath}
            workspaceTimeZone={workspace.workspacePreferences.timeZone}
            workspaceGitRemoteUrl={workspace.workspacePreferences.gitRemoteUrl}
            workspaceGitBrowserUrl={workspace.workspacePreferences.gitBrowserUrl}
            defaultChatModelSelection={workspace.workspacePreferences.defaultChatModelSelection}
            workspaceApps={workspace.workspaceApps}
            workspaceEntries={workspace.workspaceEntries}
            templateUpdates={workspace.templateUpdates}
            onSelectApp={(viewerPath) => {
              shell.openDesktopViewer();
              workspace.setSelectedViewerPath(viewerPath);
            }}
            onRefreshWorkspace={() => void workspace.loadWorkspace()}
            onSaveWorkspaceTimeZone={workspace.saveWorkspaceTimeZone}
            onDefaultChatModelChange={workspace.saveDefaultChatModelSelection}
            onRequestTemplateUpdate={handleRequestTemplateUpdate}
            onDismissTemplateUpdate={workspace.dismissTemplateUpdate}
            onReorderApps={workspace.saveAppOrder}
          />

          <DesktopSidebarResizeHandle
            hidden={shell.hiddenDesktopSidebar}
            isResizing={shell.isResizing}
            onPointerDown={shell.startResizeLeft}
          />
        </>
      ) : null}

      {!isDesktop && shell.mobileView === "chats" && shell.mobileChatMode === "list" ? (
        <MobileChatListScreen
          chats={orderedChats}
          activeChatId={activeChatId}
          loading={loadingInitial}
          onCreateChat={() => void handleCreateChat()}
          onSelectChat={(chatId) => void handleSelectChat(chatId)}
        />
      ) : null}

      {!isDesktop && shell.mobileView === "workspace" ? (
        <MobileWorkspaceScreen
          workspaceApps={workspace.workspaceApps}
          workspaceEntries={workspace.workspaceEntries}
          selectedViewerPath={workspace.selectedViewerPath}
          workspaceTimeZone={workspace.workspacePreferences.timeZone}
          workspaceGitRemoteUrl={workspace.workspacePreferences.gitRemoteUrl}
          workspaceGitBrowserUrl={workspace.workspacePreferences.gitBrowserUrl}
          defaultChatModelSelection={workspace.workspacePreferences.defaultChatModelSelection}
          templateUpdates={workspace.templateUpdates}
          syncError={workspace.silentSyncError}
          onSelectApp={handleOpenMobileWorkspaceApp}
          onRefreshWorkspace={() => void workspace.loadWorkspace()}
          onSaveWorkspaceTimeZone={workspace.saveWorkspaceTimeZone}
          onDefaultChatModelChange={workspace.saveDefaultChatModelSelection}
          onRequestTemplateUpdate={handleRequestTemplateUpdate}
          onDismissTemplateUpdate={workspace.dismissTemplateUpdate}
          onReorderApps={workspace.saveAppOrder}
          onSynced={workspace.onSynced}
          onSyncError={workspace.onSyncError}
          onClearSyncError={workspace.clearSilentSyncError}
        />
      ) : null}

      {!isDesktop && shell.mobileView === "automations" ? (
        <AutomationsScreen
          mobile
          automationOutputChannel={workspace.workspacePreferences.automationOutputChannel}
          onAutomationOutputChannelChange={workspace.saveAutomationOutputChannel}
        />
      ) : null}

      {!isDesktop && shell.mobileView === "home" ? (
        <NativeDesktopHome
          mobile
          workspaceApps={workspace.workspaceApps}
          onOpenApp={handleOpenMobileViewerApp}
          onReorderApps={workspace.saveAppOrder}
          onSetAppArchived={workspace.saveArchivedApps}
          onCreateChatMessage={handleCreateChatFromHome}
        />
      ) : null}

      {isDesktop ? (
      <div className="min-h-0 min-w-0 flex-1 flex">
        <DesktopWorkspaceChatShell
          activeChat={activeChat}
          activeAppChat={activeAppChat}
          mainView={shell.desktopMainView}
          automationOutputChannel={workspace.workspacePreferences.automationOutputChannel}
          selectedViewerPath={workspace.selectedViewerPath}
          selectedViewerUrl={workspace.selectedViewerUrl}
          selectedWorkspaceEntry={workspace.selectedWorkspaceEntry}
          workspaceApps={workspace.workspaceApps}
          workspaceEntries={workspace.workspaceEntries}
          fileViewerText={workspace.fileViewerText}
          fileViewerError={workspace.fileViewerError}
          isLoadingFileViewer={workspace.isLoadingFileViewer}
          viewerRefreshKey={workspace.viewerRefreshKey}
          onSelectElement={handleSelectViewerElement}
          onRefreshViewer={workspace.refreshViewer}
          onOpenViewerApp={handleOpenViewerApp}
          onOpenViewerPath={handleOpenViewerApp}
          onReorderApps={workspace.saveAppOrder}
          onSetAppArchived={workspace.saveArchivedApps}
          onSetDraft={setDraft}
          onRemoveDraftSelectedElement={removeDraftSelectedElement}
          onClearDraftSelectedElements={clearDraftSelectedElements}
          onEnqueueMessage={enqueueMessage}
          onUpdateQueuedMessage={updateQueuedMessage}
          onReorderQueuedMessage={reorderQueuedMessage}
          onRemoveQueuedMessage={removeQueuedMessage}
          onSetQueuePaused={setQueuePaused}
          onResumeQueue={resumeQueue}
          onSendQueuedMessage={sendQueuedMessage}
          onUpdateChatModel={updateChatModel}
          onSendMessage={sendMessage}
          focusComposerNonce={prefillComposerNonce}
          onNewChat={() => void handleCreateChat()}
          onRetryLastMessage={retryLastMessage}
          onStopChat={stopChat}
          onClearError={clearError}
          chats={orderedChats}
          activeChatId={activeChatId}
          appChats={appChats}
          activeAppChatId={activeAppChatId}
          loadingChats={loadingInitial || loadingAppChats}
          showAppChats={showAppChats}
          onSelectChat={(chatId) => void handleSelectChat(chatId)}
          onSelectAppChat={(chat) => {
            shell.openConversation();
            startTransition(() => {
              void selectAppChat(chat);
            });
          }}
          onToggleShowAppChats={() => setShowAppChats((value) => !value)}
          onRefreshChats={refreshChatList}
          onAutomationOutputChannelChange={workspace.saveAutomationOutputChannel}
          pickerInjection={pickerInjection}
        />
      </div>
      ) : null}

      {!isDesktop ? (
      <MobileConversationScreen
        visible={shell.mobileView === "chats" && shell.mobileChatMode === "conversation"}
        chat={activeChat}
        viewerPath={workspace.selectedViewerPath}
        workspaceApps={workspace.workspaceApps}
        workspaceEntries={workspace.workspaceEntries}
        onBackToChatList={shell.backToMobileChatList}
        onOpenViewerApp={handleOpenMobileViewerApp}
        onSetDraft={setDraft}
        onRemoveDraftSelectedElement={removeDraftSelectedElement}
        onClearDraftSelectedElements={clearDraftSelectedElements}
        onEnqueueMessage={enqueueMessage}
        onUpdateQueuedMessage={updateQueuedMessage}
        onReorderQueuedMessage={reorderQueuedMessage}
        onRemoveQueuedMessage={removeQueuedMessage}
        onSetQueuePaused={setQueuePaused}
        onResumeQueue={resumeQueue}
        onSendQueuedMessage={sendQueuedMessage}
        onUpdateChatModel={updateChatModel}
        onSendMessage={sendMessage}
        focusComposerNonce={prefillComposerNonce}
        onNewChat={() => void handleCreateChat()}
        onRetryLastMessage={retryLastMessage}
        onStopChat={stopChat}
        onClearError={clearError}
        viewerPicker={{
          isSelectingElement: picker.isSelectingElement,
          canPickElements,
          pickerError: picker.pickerError,
          onToggleSelecting: handleMobileToggleSelecting,
        }}
      />
      ) : null}

      {!isDesktop && shell.mobileView === "viewer" ? (
        <MobileViewerScreen
          selectedViewerPath={workspace.selectedViewerPath}
          selectedViewerUrl={workspace.selectedViewerUrl}
          selectedEntry={workspace.selectedWorkspaceEntry}
          workspaceEntries={workspace.workspaceEntries}
          fileViewerText={workspace.fileViewerText}
          fileViewerError={workspace.fileViewerError}
          isLoadingFileViewer={workspace.isLoadingFileViewer}
          viewerRefreshKey={workspace.viewerRefreshKey}
          onBack={handleOpenMobileHome}
          onSelectElement={handleSelectViewerElement}
          onOpenViewerPath={workspace.setSelectedViewerPath}
          onRefresh={workspace.refreshViewer}
          pickerInjection={pickerInjection}
        />
      ) : null}

      {!isDesktop ? (
        <MobileTabBar
          mobileView={shell.mobileView}
          workspaceApps={workspace.workspaceApps}
          selectedViewerPath={workspace.selectedViewerPath}
          workspaceTimeZone={workspace.workspacePreferences.timeZone}
          workspaceGitRemoteUrl={workspace.workspacePreferences.gitRemoteUrl}
          workspaceGitBrowserUrl={workspace.workspacePreferences.gitBrowserUrl}
          defaultChatModelSelection={workspace.workspacePreferences.defaultChatModelSelection}
          templateUpdates={workspace.templateUpdates}
          theme={theme}
          onOpenChats={shell.openChatsTab}
          onOpenHome={handleOpenMobileHome}
          onOpenAutomations={shell.openAutomationsTab}
          onOpenWorkspaceOrViewer={(app) => {
            if (app) {
              workspace.setSelectedViewerPath(app.viewerPath);
              shell.openMobileViewer();
              return;
            }
            shell.openWorkspaceOrViewer(Boolean(workspace.selectedViewerPath));
          }}
          onSaveWorkspaceTimeZone={workspace.saveWorkspaceTimeZone}
          onDefaultChatModelChange={workspace.saveDefaultChatModelSelection}
          onRequestTemplateUpdate={handleRequestTemplateUpdate}
          onDismissTemplateUpdate={workspace.dismissTemplateUpdate}
          onSelectTheme={setTheme}
        />
      ) : null}

      <CommandPalette
        open={isCommandPaletteOpen}
        workspaceApps={workspace.workspaceApps}
        workspaceEntries={workspace.workspaceEntries}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectApp={handleOpenAppFromPalette}
        onSelectFile={handleOpenFileFromPalette}
      />
    </div>
  );
}

export default App;
