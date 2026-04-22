import type { Hono } from "hono";
import {
  PiSdkChatService,
} from "./chat.service.js";
import { uploadedChatFileFromFile } from "./chat.request.js";
import {
  isSupportedChatModelSelection,
} from "../../shared/pi/runtime.js";

const parseOptionalJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return request.json();
};

export const registerChatRoutes = (
  app: Hono,
  chatService: PiSdkChatService,
): void => {
  app.get("/chats", async (c) => {
    return c.json({ chats: await chatService.listChats() });
  });

  app.post("/chats", async (c) => {
    const body = await parseOptionalJsonBody(c.req.raw);
    if (body !== null && !isSupportedChatModelSelection(body)) {
      return c.json({ error: "Invalid chat model selection" }, 400);
    }

    const chat = await chatService.createChat(
      body !== null ? body : undefined,
    );
    return c.json({ chat }, 201);
  });

  app.get("/chats/:chatId", async (c) => {
    const chat = await chatService.getChat(c.req.param("chatId"));
    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    return c.json({ chat });
  });

  app.patch("/chats/:chatId/model", async (c) => {
    const body = await c.req.json();
    if (!isSupportedChatModelSelection(body)) {
      return c.json({ error: "Invalid chat model selection" }, 400);
    }

    try {
      const chat = await chatService.updateChatModel(c.req.param("chatId"), body);
      return c.json({ chat });
    } catch (error) {
      if (error instanceof Error && error.name === "ChatNotFoundError") {
        return c.json({ error: "Chat not found" }, 404);
      }

      if (error instanceof Error && error.name === "ChatBusyError") {
        return c.json({ error: error.message }, 409);
      }

      return c.json(
        {
          error: error instanceof Error ? error.message : "Failed to update chat model",
        },
        500,
      );
    }
  });

  app.post("/chats/:chatId/stop", async (c) => {
    try {
      await chatService.stopChat(c.req.param("chatId"));
      return c.json({ status: "ok" });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Failed to stop chat",
        },
        500,
      );
    }
  });

  app.post("/chats/:chatId/uploads", async (c) => {
    const chatId = c.req.param("chatId");

    if (!(await chatService.hasChat(chatId))) {
      return c.json({ error: "Chat not found" }, 404);
    }

    try {
      const formData = await c.req.raw.formData();
      const files = formData
        .getAll("files")
        .filter((value): value is File => value instanceof File);

      if (files.length === 0) {
        return c.json({ error: "files are required" }, 400);
      }

      const uploads = await Promise.all(files.map((file) => uploadedChatFileFromFile(file)));
      const uploadIds = await chatService.storeUploads(chatId, uploads);
      return c.json({ uploadIds });
    } catch {
      return c.json({ error: "Invalid upload request" }, 400);
    }
  });
};
