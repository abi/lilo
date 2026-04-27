const readStringEnv = (value: string | undefined): string =>
  value?.trim() ?? "";

const parseBooleanEnv = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  observability: {
    logrocket: {
      enabled: parseBooleanEnv(import.meta.env.VITE_ENABLE_LOGROCKET),
      appId: readStringEnv(import.meta.env.VITE_LOGROCKET_APP_ID),
    },
    sentry: {
      enabled: parseBooleanEnv(import.meta.env.VITE_ENABLE_SENTRY),
      dsn: readStringEnv(import.meta.env.VITE_SENTRY_DSN),
    },
  },
  workspace: {
    syncEnabled:
      import.meta.env.VITE_ENABLE_WORKSPACE_SYNC !== undefined
        ? parseBooleanEnv(import.meta.env.VITE_ENABLE_WORKSPACE_SYNC)
        : true,
  },
} as const;
