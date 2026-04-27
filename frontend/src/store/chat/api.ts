import { UnauthorizedError, authFetch } from "../../lib/auth";
import { config } from "../../config/config";

const fetchJson = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await authFetch(input, init);

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let backendMessage = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string; details?: string };
      if (payload.error) {
        backendMessage = payload.details
          ? `${payload.error}: ${payload.details}`
          : payload.error;
      }
    } catch {
      // Keep fallback message.
    }

    throw new Error(backendMessage);
  }

  return (await response.json()) as T;
};

const uploadChatAttachments = async (
  chatId: string,
  files: File[],
): Promise<string[]> => {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const payload = await fetchJson<{ uploadIds: string[] }>(
    `${config.apiBaseUrl}/chats/${chatId}/uploads`,
    {
      method: "POST",
      body: formData,
    },
  );

  return payload.uploadIds;
};

export { fetchJson, uploadChatAttachments };
