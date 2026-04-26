import { useCallback } from "react";
import { buildWorkspaceTemplateUpdatePrompt } from "../components/workspace/lib/templateUpdatePrompt";
import type { WorkspaceTemplateUpdate } from "../components/workspace/types";
import type { ChatStoreState } from "../store/chat/types";

interface UseWorkspaceTemplateUpdateRequestOptions {
  createChat: ChatStoreState["createChat"];
  selectChat: ChatStoreState["selectChat"];
  sendMessage: ChatStoreState["sendMessage"];
  setActiveAppChatId: (chatId: string | null) => void;
  openConversation: () => void;
}

export const useWorkspaceTemplateUpdateRequest = ({
  createChat,
  selectChat,
  sendMessage,
  setActiveAppChatId,
  openConversation,
}: UseWorkspaceTemplateUpdateRequestOptions) =>
  useCallback(
    (update: WorkspaceTemplateUpdate) => {
      void (async () => {
        setActiveAppChatId(null);
        const chatId = await createChat({ select: true });
        await selectChat(chatId);
        openConversation();
        await sendMessage(chatId, buildWorkspaceTemplateUpdatePrompt(update));
      })().catch((error) => {
        console.error("Failed to start workspace app update", error);
      });
    },
    [createChat, openConversation, selectChat, sendMessage, setActiveAppChatId],
  );
