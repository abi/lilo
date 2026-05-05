import { randomUUID } from "node:crypto";
import type { Hono } from "hono";

interface OutboundMediaRecord {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  expiresAt: number;
}

const OUTBOUND_MEDIA_TTL_MS = 1000 * 60 * 30;
const records = new Map<string, OutboundMediaRecord>();

const pruneExpiredMedia = () => {
  const now = Date.now();
  for (const [token, record] of records.entries()) {
    if (record.expiresAt <= now) {
      records.delete(token);
    }
  }
};

const encodePathSegment = (value: string): string =>
  encodeURIComponent(value).replace(/%2F/gi, "_");

export const registerTemporaryOutboundMedia = (record: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}): string => {
  pruneExpiredMedia();
  const token = randomUUID();
  records.set(token, {
    ...record,
    expiresAt: Date.now() + OUTBOUND_MEDIA_TTL_MS,
  });
  return `/channel-media/${token}/${encodePathSegment(record.filename)}`;
};

export const registerOutboundMediaRoutes = (app: Hono): void => {
  app.get("/channel-media/:token/:filename", (c) => {
    pruneExpiredMedia();
    const record = records.get(c.req.param("token"));
    if (!record) {
      return c.text("Media not found", 404);
    }

    return new Response(Buffer.from(record.bytes), {
      headers: {
        "Cache-Control": "private, max-age=1800",
        "Content-Disposition": `inline; filename="${record.filename.replace(/"/g, "")}"`,
        "Content-Type": record.mimeType,
      },
    });
  });
};
