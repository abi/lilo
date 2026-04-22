type SentrySeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

interface CaptureBackendExceptionOptions {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extras?: Record<string, unknown>;
  level?: SentrySeverityLevel;
  fingerprint?: string[];
}

type SentryNodeModule = typeof import("@sentry/node");

let didInitSentry = false;
let sentryModulePromise: Promise<SentryNodeModule | null> | null = null;

const parseBooleanEnv = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const shouldEnableSentry = (): boolean =>
  parseBooleanEnv(process.env.ENABLE_SENTRY) && Boolean(process.env.SENTRY_DSN?.trim());

const loadSentry = async (): Promise<SentryNodeModule | null> => {
  if (!shouldEnableSentry()) {
    return null;
  }

  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/node")
      .then((Sentry) => {
        if (!didInitSentry) {
          Sentry.init({
            dsn: process.env.SENTRY_DSN?.trim(),
          });

          didInitSentry = true;
        }

        return Sentry;
      })
      .catch((error) => {
        console.error("Failed to initialize backend Sentry", error);
        sentryModulePromise = null;
        return null;
      });
  }

  return sentryModulePromise;
};

export const initializeBackendSentry = (): void => {
  void loadSentry();
};

export const captureBackendException = (
  error: unknown,
  options: CaptureBackendExceptionOptions = {},
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
