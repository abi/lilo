import { config } from "../config/config";

type SentrySeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

interface CaptureFrontendExceptionOptions {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extras?: Record<string, unknown>;
  level?: SentrySeverityLevel;
  fingerprint?: string[];
}

type SentryBrowserModule = typeof import("@sentry/react");

let didInitSentry = false;
let sentryModulePromise: Promise<SentryBrowserModule | null> | null = null;

const shouldEnableSentry = (): boolean =>
  config.observability.sentry.enabled &&
  config.observability.sentry.dsn.length > 0;

const loadSentry = async (): Promise<SentryBrowserModule | null> => {
  if (!shouldEnableSentry()) {
    return null;
  }

  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/react")
      .then((Sentry) => {
        if (!didInitSentry) {
          Sentry.init({
            dsn: config.observability.sentry.dsn,
          });

          didInitSentry = true;
        }

        return Sentry;
      })
      .catch((error) => {
        console.error("Failed to initialize Sentry", error);
        sentryModulePromise = null;
        return null;
      });
  }

  return sentryModulePromise;
};

export const initializeSentry = (): void => {
  void loadSentry();
};

export const captureFrontendException = (
  error: unknown,
  options: CaptureFrontendExceptionOptions = {},
): void => {
  const normalizedError =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error));

  void loadSentry().then((Sentry) => {
    if (!Sentry) {
      return;
    }

    Sentry.withScope((scope) => {
      if (options.level) {
        scope.setLevel(options.level);
      }

      if (options.fingerprint) {
        scope.setFingerprint(options.fingerprint);
      }

      for (const [key, value] of Object.entries(options.tags ?? {})) {
        if (value !== undefined && value !== null) {
          scope.setTag(key, String(value));
        }
      }

      if (options.extras && Object.keys(options.extras).length > 0) {
        scope.setExtras(options.extras);
      }

      Sentry.captureException(normalizedError);
    });
  });
};
