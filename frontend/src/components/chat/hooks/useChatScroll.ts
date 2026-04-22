import { useCallback, useEffect, useRef, useState } from "react";
import { SCROLL_BOTTOM_THRESHOLD } from "../constants";

interface UseChatScrollOptions {
  chatId?: string;
  messages: unknown[];
  isThinking: boolean;
  isWorking: boolean;
  connectionState: string;
}

export function useChatScroll({
  chatId,
  messages,
  isThinking,
  isWorking,
  connectionState,
}: UseChatScrollOptions) {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);

  const isNearBottom = useCallback((container: HTMLDivElement) => {
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD;
  }, []);

  const syncScrollState = useCallback(() => {
    const container = chatScrollRef.current;
    if (!container) {
      return;
    }

    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      const nearBottom = isNearBottom(container);
      setShowScrollToBottom(!nearBottom);
      return;
    }

    const nearBottom = isNearBottom(container);
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  }, [isNearBottom]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = chatScrollRef.current;
    if (!container) {
      return;
    }

    isProgrammaticScrollRef.current = true;
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    scrollChatToBottom("auto");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollChatToBottom("auto"));
    });
    const timer = setTimeout(() => scrollChatToBottom("auto"), 150);
    return () => clearTimeout(timer);
  }, [chatId, scrollChatToBottom]);

  useEffect(() => {
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => scrollChatToBottom("auto"));
      return;
    }

    setShowScrollToBottom(true);
  }, [messages, isThinking, isWorking, connectionState, scrollChatToBottom]);

  return {
    chatScrollRef,
    showScrollToBottom,
    syncScrollState,
    scrollChatToBottom,
  };
}
