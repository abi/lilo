import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { MobileChatMode, MobileView } from "../components/app/types";

const LEFT_PANE_DEFAULT_WIDTH = 288;
const LEFT_PANE_MIN_WIDTH = 240;
const LEFT_PANE_MAX_WIDTH = 520;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export function useShellNavigation() {
  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_PANE_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [showArchivedInStrip, setShowArchivedInStrip] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("viewer");
  const [mobileChatMode, setMobileChatMode] = useState<MobileChatMode>("list");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!resizeRef.current) {
        return;
      }

      const { startX, startWidth } = resizeRef.current;
      setLeftPaneWidth(
        clamp(
          startWidth + (event.clientX - startX),
          LEFT_PANE_MIN_WIDTH,
          LEFT_PANE_MAX_WIDTH,
        ),
      );
    };

    const onMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  const openConversation = useCallback(() => {
    setMobileView("chats");
    setMobileChatMode("conversation");
  }, []);

  const openMobileViewer = useCallback(() => {
    setMobileView("viewer");
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

  const backToMobileChatList = useCallback(() => {
    setMobileChatMode("list");
  }, []);

  const backToMobileWorkspace = useCallback(() => {
    setMobileView("workspace");
  }, []);

  const showSidebarPanel = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const hideSidebarPanel = useCallback(() => {
    setSidebarOpen(false);
  }, []);


  const toggleArchivedInStrip = useCallback(() => {
    setShowArchivedInStrip((value) => !value);
  }, []);

  const startResizeLeft = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeRef.current = {
      startX: event.clientX,
      startWidth: leftPaneWidth,
    };
    setIsResizing(true);
  }, [leftPaneWidth]);

  return {
    leftPaneWidth,
    showArchivedInStrip,
    mobileView,
    mobileChatMode,
    sidebarOpen,
    hiddenDesktopSidebar: !sidebarOpen,
    openConversation,
    openMobileViewer,
    openChatsTab,
    openWorkspaceOrViewer,
    backToMobileChatList,
    backToMobileWorkspace,
    showSidebarPanel,
    hideSidebarPanel,

    toggleArchivedInStrip,
    startResizeLeft,
  };
}
