import type { SessionContext } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { captureBackendException } from "../observability/sentry.js";

type SessionAgentMessage = SessionContext["messages"][number];
type SentrySeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

interface ReportPiUpstreamErrorOptions {
  area: string;
  error: unknown;
  latestAssistantMessage?: SessionAgentMessage | null;
  tags?: Record<string, string | number | boolean | null | undefined>;
  extras?: Record<string, unknown>;
  fingerprint?: string[];
  level?: SentrySeverityLevel;
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error));

const parseJsonString = (value: string | null): unknown => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const toLogSafeValue = (value: unknown): unknown => {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }

  if (Array.isArray(value)) {
    return value.map(toLogSafeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toLogSafeValue(entry)]),
    );
  }

  return value;
};

const toLogString = (value: unknown): string => {
  try {
    return JSON.stringify(toLogSafeValue(value));
  } catch {
    return JSON.stringify({ serializationError: String(value) });
  }
};

export const getLatestAssistantMessage = (
  messages: SessionAgentMessage[],
): AssistantMessage | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message as AssistantMessage;
    }
  }

  return null;
};

export const reportPiUpstreamError = ({
  area,
  error,
  latestAssistantMessage = null,
  tags = {},
  extras = {},
  fingerprint,
  level = "error",
}: ReportPiUpstreamErrorOptions): void => {
  const normalizedError = toError(error);
  const stopReason =
    latestAssistantMessage &&
    "stopReason" in latestAssistantMessage &&
    typeof latestAssistantMessage.stopReason === "string"
      ? latestAssistantMessage.stopReason
      : null;
  const upstreamErrorMessage =
    latestAssistantMessage &&
    "errorMessage" in latestAssistantMessage &&
    typeof latestAssistantMessage.errorMessage === "string" &&
    latestAssistantMessage.errorMessage.trim().length > 0
      ? latestAssistantMessage.errorMessage
      : null;
  const parsedUpstreamError = parseJsonString(upstreamErrorMessage);

  console.error(
    `[pi-upstream] ${toLogString({
      area,
      tags,
      error: {
        name: normalizedError.name,
        message: normalizedError.message,
        stack: normalizedError.stack ?? null,
      },
      pi: {
        stopReason,
        upstreamErrorMessage,
        parsedUpstreamError,
      },
      extras,
    })}`,
  );

  captureBackendException(normalizedError, {
    tags: {
      area,
      ...tags,
      piStopReason: stopReason ?? "unknown",
      piHasUpstreamErrorMessage: upstreamErrorMessage ? "true" : "false",
    },
    extras: {
      ...extras,
      piStopReason: stopReason,
      piUpstreamErrorMessage: upstreamErrorMessage,
      piParsedUpstreamError: parsedUpstreamError,
      piErrorName: normalizedError.name,
      piErrorMessage: normalizedError.message,
      piErrorStack: normalizedError.stack ?? null,
    },
    fingerprint,
    level,
  });
};
