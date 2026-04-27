import { useCallback, useEffect, useMemo, useState } from "react";
import { config } from "../config/config";
import { authFetch } from "../lib/auth";
import type { ChatMessage, ChatSessionState } from "../store/chatStore";

export interface AppChatSummary {
  id: string;
  sessionId: string;
  appName: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: "idle" | "streaming" | "error";
}

export interface AppChatDetail extends AppChatSummary {
  messages: ChatMessage[];
}

const toReadonlyChatState = (detail: AppChatDetail): ChatSessionState => ({
  id: detail.id,
  title: `${detail.title} · ${detail.appName}`,
  createdAt: detail.createdAt,
  updatedAt: detail.updatedAt,
  messageCount: detail.messages.length,
  status: detail.status,
  activeRunId: null,
  activeRunLastSeq: null,
  modelProvider: "anthropic",
  modelId: "claude-opus-4-7",
  messages: detail.messages,
  isLoaded: true,
  connectionState: "idle",
  isThinking: false,
  isWorking: detail.status === "streaming",
  error: detail.status === "error" ? "This app chat encountered an error." : null,
  draft: "",
  draftSelectedElements: [],
  queuedMessages: [],
  isQueuePaused: false,
  lastSubmittedInput: null,
});

export function useAppChats(showAppChats: boolean) {
  const [appChats, setAppChats] = useState<AppChatSummary[]>([]);
  const [activeAppChatId, setActiveAppChatId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, AppChatDetail>>({});
  const [loadingAppChats, setLoadingAppChats] = useState(false);

  const refreshAppChats = useCallback(async () => {
    if (!showAppChats) {
      return;
    }

    setLoadingAppChats(true);
    try {
      const response = await authFetch(`${config.apiBaseUrl}/api/app-chats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch app chats (${response.status})`);
      }

      const payload = (await response.json()) as { sessions?: AppChatSummary[] };
      setAppChats(Array.isArray(payload.sessions) ? payload.sessions : []);
    } catch (error) {
      console.error("[app-chats] Failed to refresh app chats", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      setLoadingAppChats(false);
    }
  }, [showAppChats]);

  useEffect(() => {
    void refreshAppChats();
  }, [refreshAppChats]);

  const selectAppChat = useCallback(async (summary: AppChatSummary) => {
    setActiveAppChatId(summary.id);
    if (detailsById[summary.id]) {
      console.debug("[app-chats] Reusing cached app chat detail", {
        appName: summary.appName,
        sessionId: summary.sessionId,
        id: summary.id,
      });
      return;
    }

    try {
      console.debug("[app-chats] Fetching app chat detail", {
        appName: summary.appName,
        sessionId: summary.sessionId,
        id: summary.id,
      });
      const response = await authFetch(
        `${config.apiBaseUrl}/api/app-chats/${encodeURIComponent(summary.appName)}/${encodeURIComponent(summary.sessionId)}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch app chat (${response.status})`);
      }

      const payload = (await response.json()) as { session?: AppChatDetail };
      if (payload.session) {
        console.debug("[app-chats] Loaded app chat detail", {
          appName: payload.session.appName,
          sessionId: payload.session.sessionId,
          messageCount: payload.session.messages.length,
          status: payload.session.status,
        });
        setDetailsById((current) => ({
          ...current,
          [summary.id]: payload.session!,
        }));
      } else {
        console.warn("[app-chats] App chat detail response missing session", {
          appName: summary.appName,
          sessionId: summary.sessionId,
          id: summary.id,
        });
      }
    } catch (error) {
      console.error("[app-chats] Failed to load app chat detail", {
        appName: summary.appName,
        sessionId: summary.sessionId,
        id: summary.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, [detailsById]);

  const activeAppChat = useMemo(() => {
    if (!activeAppChatId) {
      return null;
    }

    const detail = detailsById[activeAppChatId];
    return detail ? toReadonlyChatState(detail) : null;
  }, [activeAppChatId, detailsById]);

  return {
    appChats,
    activeAppChatId,
    activeAppChat,
    loadingAppChats,
    setActiveAppChatId,
    selectAppChat,
    refreshAppChats,
  };
}
