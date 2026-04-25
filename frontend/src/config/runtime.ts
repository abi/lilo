export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const parseBooleanEnv = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export const ENABLE_LOGROCKET = parseBooleanEnv(import.meta.env.VITE_ENABLE_LOGROCKET);
export const LOGROCKET_APP_ID = import.meta.env.VITE_LOGROCKET_APP_ID?.trim() || "";
export const ENABLE_SENTRY = parseBooleanEnv(import.meta.env.VITE_ENABLE_SENTRY);
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN?.trim() || "";
export const ENABLE_WORKSPACE_SYNC =
  import.meta.env.VITE_ENABLE_WORKSPACE_SYNC !== undefined
    ? parseBooleanEnv(import.meta.env.VITE_ENABLE_WORKSPACE_SYNC)
    : true;
