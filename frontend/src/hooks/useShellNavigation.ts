import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  DesktopMainView,
  DesktopSidebarPanelKind,
  MobileChatMode,
  MobileView,
} from "../components/app/types";

const LEFT_PANE_DEFAULT_WIDTH = 288;
const LEFT_PANE_MIN_WIDTH = 240;
const LEFT_PANE_MAX_WIDTH = 520;
const hasInitialViewerPath = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return new URL(window.location.href).searchParams.has("viewer");
  } catch {
    return false;
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export function useShellNavigation() {
  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_PANE_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [showArchivedInStrip, setShowArchivedInStrip] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>(() =>
    hasInitialViewerPath() ? "viewer" : "home",
  );
  const [mobileChatMode, setMobileChatMode] = useState<MobileChatMode>("list");

  const [desktopMainView, setDesktopMainView] =
    useState<DesktopMainView>(() => hasInitialViewerPath() ? "viewer" : "desktop");
  const [desktopSidebarPanel, setDesktopSidebarPanel] =
    useState<DesktopSidebarPanelKind | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startWidth: number;
    pointerId: number;
    frameId: number | null;
    nextWidth: number;
  } | null>(null);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const commitPendingWidth = () => {
      const resizeState = resizeRef.current;
      if (!resizeState) {
        return;
      }

      resizeState.frameId = null;
      setLeftPaneWidth(resizeState.nextWidth);
    };

    const onPointerMove = (event: PointerEvent) => {
      const resizeState = resizeRef.current;
      if (!resizeState || event.pointerId !== resizeState.pointerId) {
        return;
      }

      event.preventDefault();
      resizeState.nextWidth = clamp(
        resizeState.startWidth + (event.clientX - resizeState.startX),
        LEFT_PANE_MIN_WIDTH,
        LEFT_PANE_MAX_WIDTH,
      );

      if (resizeState.frameId === null) {
        resizeState.frameId = window.requestAnimationFrame(commitPendingWidth);
      }
    };

    const finishResize = () => {
      const resizeState = resizeRef.current;
      if (resizeState && resizeState.frameId !== null) {
        window.cancelAnimationFrame(resizeState.frameId);
        setLeftPaneWidth(resizeState.nextWidth);
      }
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.documentElement.style.cursor = "col-resize";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    window.addEventListener("blur", finishResize);

    return () => {
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
      document.documentElement.style.removeProperty("cursor");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("blur", finishResize);

      const resizeState = resizeRef.current;
      if (resizeState && resizeState.frameId !== null) {
        window.cancelAnimationFrame(resizeState.frameId);
      }
    };
  }, [isResizing]);

  const openConversation = useCallback(() => {
    setMobileView("chats");
    setMobileChatMode("conversation");
  }, []);

  const openMobileViewer = useCallback(() => {
    setMobileView("viewer");
  }, []);

  const openMobileHome = useCallback(() => {
    setMobileView("home");
  }, []);

  const openDesktopViewer = useCallback(() => {
    setDesktopMainView("viewer");
  }, []);

  const openDesktopHome = useCallback(() => {
    setDesktopMainView("desktop");
  }, []);

  const openChatsTab = useCallback(() => {
    setMobileView((currentView) => {
      // Tapping the Chats tab while already on it toggles back to the list
      // view (so users can escape a conversation without a back gesture).
      if (currentView === "chats" && mobileChatMode === "conversation") {
        setMobileChatMode("list");
        return currentView;
      }

      // Coming from another tab, preserve the last mode so we return to
      // either the list or the previously open conversation as-is.
      return "chats";
    });
  }, [mobileChatMode]);

  const openWorkspaceOrViewer = useCallback((hasSelectedApp: boolean) => {
    setMobileView(hasSelectedApp ? "viewer" : "workspace");
  }, []);

  const openAutomationsTab = useCallback(() => {
    setMobileView("automations");
  }, []);

  const openSkillsTab = useCallback(() => {
    setMobileView("skills");
  }, []);

  const openDesktopAutomations = useCallback(() => {
    setDesktopMainView("automations");
  }, []);

  const openDesktopSkills = useCallback(() => {
    setDesktopMainView("skills");
  }, []);

  const backToMobileChatList = useCallback(() => {
    setMobileChatMode("list");
  }, []);

  const backToMobileWorkspace = useCallback(() => {
    setMobileView("workspace");
  }, []);

  const showSidebarPanel = useCallback(() => {
    setDesktopSidebarPanel("workspace");
  }, []);

  const toggleWorkspacePanel = useCallback(() => {
    setDesktopSidebarPanel((current) => (current === "workspace" ? null : "workspace"));
  }, []);

  const toggleArchivedInStrip = useCallback(() => {
    setShowArchivedInStrip((value) => !value);
  }, []);

  const startResizeLeft = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      startX: event.clientX,
      startWidth: leftPaneWidth,
      pointerId: event.pointerId,
      frameId: null,
      nextWidth: leftPaneWidth,
    };
    setIsResizing(true);
  }, [leftPaneWidth]);

  return {
    leftPaneWidth,
    isResizing,
    showArchivedInStrip,
    mobileView,
    mobileChatMode,
    desktopMainView,
    desktopSidebarPanel,
    hiddenDesktopSidebar: desktopSidebarPanel === null,
    openConversation,
    openMobileViewer,
    openMobileHome,
    openDesktopViewer,
    openDesktopHome,
    openChatsTab,
    openWorkspaceOrViewer,
    openAutomationsTab,
    openSkillsTab,
    openDesktopAutomations,
    openDesktopSkills,
    backToMobileChatList,
    backToMobileWorkspace,
    showSidebarPanel,
    toggleWorkspacePanel,
    toggleArchivedInStrip,
    startResizeLeft,
  };
}
