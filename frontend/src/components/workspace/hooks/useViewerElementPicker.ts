import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatElementSelection } from "../../../store/chatStore";

interface UseViewerElementPickerOptions {
  canPickElements: boolean;
  viewerRefreshKey: number;
  selectedViewerUrl: string | null;
  onSelectElement?: (selection: ChatElementSelection) => void;
}

export function useViewerElementPicker({
  canPickElements,
  viewerRefreshKey,
  selectedViewerUrl,
  onSelectElement,
}: UseViewerElementPickerOptions) {
  // Track the mounted iframe element in state so effects re-run when it
  // mounts/unmounts (e.g. when the mobile viewer screen appears after the
  // composer triggers picker mode). `iframeRef` is a stable object; its
  // `current` property both writes into a ref (for sync access) and updates
  // React state (so effects see the change).
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const iframeRefObj = useRef<React.MutableRefObject<HTMLIFrameElement> | null>(null);
  if (!iframeRefObj.current) {
    iframeRefObj.current = Object.seal({
      get current() {
        return iframeElRef.current as HTMLIFrameElement;
      },
      set current(el: HTMLIFrameElement | null) {
        if (iframeElRef.current !== el) {
          iframeElRef.current = el;
          setIframeEl(el);
        }
      },
    }) as unknown as React.MutableRefObject<HTMLIFrameElement>;
  }
  const iframeRef = iframeRefObj.current;
  const [isSelectingElement, setIsSelectingElement] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const postMessageToIframe = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const clearHoveredElement = useCallback(() => {
    postMessageToIframe({ type: "lilo:viewer-picker:clear-highlights" });
  }, [postMessageToIframe]);

  const setPickerEnabled = useCallback(
    (enabled: boolean) => {
      postMessageToIframe({
        type: "lilo:viewer-picker:set-enabled",
        enabled,
      });
    },
    [postMessageToIframe],
  );

  const cancelSelecting = useCallback(() => {
    setIsSelectingElement(false);
    clearHoveredElement();
    setPickerEnabled(false);
  }, [clearHoveredElement, setPickerEnabled]);

  const toggleSelecting = useCallback(() => {
    if (!canPickElements) {
      return;
    }

    setPickerError(null);
    setIsSelectingElement((current) => !current);
    clearHoveredElement();
  }, [canPickElements, clearHoveredElement]);

  useEffect(() => {
    setIsSelectingElement(false);
    setPickerError(null);
    clearHoveredElement();
    setPickerEnabled(false);
  }, [selectedViewerUrl, viewerRefreshKey, clearHoveredElement, setPickerEnabled]);

  useEffect(() => {
    if (canPickElements) {
      return;
    }

    cancelSelecting();
  }, [canPickElements, cancelSelecting]);

  useEffect(() => {
    if (!isSelectingElement) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelSelecting();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSelectingElement, cancelSelecting]);

  useEffect(() => {
    const iframe = iframeEl;
    if (!iframe || !canPickElements) {
      return;
    }

    const postSelectionState = () => {
      setPickerEnabled(isSelectingElement);
    };

    setPickerError(null);
    const timer = window.setTimeout(postSelectionState, 50);
    iframe.addEventListener("load", postSelectionState);

    return () => {
      window.clearTimeout(timer);
      iframe.removeEventListener("load", postSelectionState);
      clearHoveredElement();
      setPickerEnabled(false);
    };
  }, [
    iframeEl,
    canPickElements,
    isSelectingElement,
    viewerRefreshKey,
    selectedViewerUrl,
    clearHoveredElement,
    setPickerEnabled,
  ]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data as
        | {
            type?: string;
            selection?: ChatElementSelection;
          }
        | undefined;

      if (!data?.type) {
        return;
      }

      if (data.type === "lilo:viewer-picker:cancelled") {
        cancelSelecting();
        return;
      }

      if (data.type === "lilo:viewer-picker:selected" && data.selection) {
        setPickerError(null);
        void onSelectElement?.(data.selection);
        requestAnimationFrame(() => {
          setPickerEnabled(true);
        });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cancelSelecting, onSelectElement, setPickerEnabled]);

  return {
    iframeRef,
    isSelectingElement,
    pickerError,
    toggleSelecting,
  };
}
