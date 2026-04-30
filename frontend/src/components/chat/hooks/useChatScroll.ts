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
  const lastScrollTopRef = useRef(0);

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

    const currentScrollTop = container.scrollTop;
    const scrolledUp = currentScrollTop < lastScrollTopRef.current - 2;

    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      const nearBottom = isNearBottom(container);
      const shouldStickToBottom = !scrolledUp && nearBottom;
      isNearBottomRef.current = shouldStickToBottom;
      lastScrollTopRef.current = currentScrollTop;
      setShowScrollToBottom(!shouldStickToBottom);
      return;
    }

    const nearBottom = isNearBottom(container);
    const shouldStickToBottom = !scrolledUp && nearBottom;
    isNearBottomRef.current = shouldStickToBottom;
    lastScrollTopRef.current = currentScrollTop;
    setShowScrollToBottom(!shouldStickToBottom);
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
    lastScrollTopRef.current = container.scrollTop;
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    isNearBottomRef.current = true;
    lastScrollTopRef.current = 0;
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
      requestAnimationFrame(() => {
        if (isNearBottomRef.current) {
          scrollChatToBottom("auto");
        }
      });
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
