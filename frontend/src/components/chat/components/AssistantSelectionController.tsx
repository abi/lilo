import { useCallback, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ChatElementSelection } from "../../../store/chatStore";
import { getNormalizedSelectionText, getSelectionHtml } from "../lib/copySelection";
import { AssistantSelectionToolbar } from "./AssistantSelectionToolbar";

interface AssistantTextSelection {
  html: string;
  position: {
    left: number;
    top: number;
  };
  text: string;
}

interface AssistantSelectionControllerProps {
  chatId: string;
  chatScrollRef: RefObject<HTMLDivElement>;
  onAddAssistantSelection?: (selection: ChatElementSelection) => void;
}

const nodeToElement = (node: Node | null): Element | null => {
  if (!node) {
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }

  return node.parentElement;
};

const getAssistantMessageElement = (node: Node | null): HTMLElement | null =>
  nodeToElement(node)?.closest<HTMLElement>("[data-assistant-message-id]") ?? null;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getSelectionRect = (range: Range): DOMRect | null => {
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }

  return range.getClientRects()[0] ?? null;
};

export function AssistantSelectionController({
  chatId,
  chatScrollRef,
  onAddAssistantSelection,
}: AssistantSelectionControllerProps) {
  const [assistantSelection, setAssistantSelection] =
    useState<AssistantTextSelection | null>(null);

  const updateAssistantSelection = useCallback(() => {
    if (!onAddAssistantSelection) {
      setAssistantSelection(null);
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setAssistantSelection(null);
      return;
    }

    const anchorElement = getAssistantMessageElement(selection.anchorNode);
    const focusElement = getAssistantMessageElement(selection.focusNode);
    if (!anchorElement || !focusElement || anchorElement !== focusElement) {
      setAssistantSelection(null);
      return;
    }

    const container = chatScrollRef.current;
    if (!container || !container.contains(anchorElement)) {
      setAssistantSelection(null);
      return;
    }

    const text = getNormalizedSelectionText(selection);
    if (!text) {
      setAssistantSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = getSelectionRect(range);
    if (!rect || !anchorElement.dataset.assistantMessageId) {
      setAssistantSelection(null);
      return;
    }

    setAssistantSelection({
      html: getSelectionHtml(selection) || text,
      position: {
        left: clamp(rect.left + rect.width / 2, 92, window.innerWidth - 92),
        top: Math.max(8, rect.top - 48),
      },
      text,
    });
  }, [chatScrollRef, onAddAssistantSelection]);

  useEffect(() => {
    if (!onAddAssistantSelection) {
      return;
    }

    let selectionUpdateTimeout: number | null = null;
    const queueSelectionUpdate = () => {
      if (selectionUpdateTimeout !== null) {
        window.clearTimeout(selectionUpdateTimeout);
      }
      selectionUpdateTimeout = window.setTimeout(updateAssistantSelection, 0);
    };
    const clearAssistantSelection = () => setAssistantSelection(null);
    const scrollContainer = chatScrollRef.current;

    window.addEventListener("mouseup", queueSelectionUpdate);
    window.addEventListener("keyup", queueSelectionUpdate);
    window.addEventListener("touchend", queueSelectionUpdate);
    window.addEventListener("resize", clearAssistantSelection);
    scrollContainer?.addEventListener("scroll", clearAssistantSelection);

    return () => {
      if (selectionUpdateTimeout !== null) {
        window.clearTimeout(selectionUpdateTimeout);
      }
      window.removeEventListener("mouseup", queueSelectionUpdate);
      window.removeEventListener("keyup", queueSelectionUpdate);
      window.removeEventListener("touchend", queueSelectionUpdate);
      window.removeEventListener("resize", clearAssistantSelection);
      scrollContainer?.removeEventListener("scroll", clearAssistantSelection);
    };
  }, [chatScrollRef, onAddAssistantSelection, updateAssistantSelection]);

  useEffect(() => {
    setAssistantSelection(null);
  }, [chatId]);

  const addAssistantSelectionToChat = () => {
    if (!assistantSelection) {
      return;
    }

    onAddAssistantSelection?.({
      html: assistantSelection.html,
      label: "Assistant response",
      tagName: "assistant-response",
      textPreview: assistantSelection.text,
    });
    setAssistantSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  if (!assistantSelection || !onAddAssistantSelection) {
    return null;
  }

  return createPortal(
    <AssistantSelectionToolbar
      position={assistantSelection.position}
      onAddToChat={addAssistantSelectionToChat}
    />,
    document.body,
  );
}
