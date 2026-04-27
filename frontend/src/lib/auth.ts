import { config } from "../config/config";

const AUTH_REQUIRED_EVENT = "lilo-auth-required";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export const notifyAuthRequired = (): void => {
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
};

export const onAuthRequired = (listener: () => void): (() => void) => {
  const wrapped = () => listener();
  window.addEventListener(AUTH_REQUIRED_EVENT, wrapped);
  return () => window.removeEventListener(AUTH_REQUIRED_EVENT, wrapped);
};

export const authFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  });

  if (response.status === 401) {
    notifyAuthRequired();
  }

  return response;
};

export interface SessionStatusResponse {
  enabled: boolean;
  authenticated: boolean;
  hasSessionCookie?: boolean;
}

export const fetchSessionStatus = async (): Promise<SessionStatusResponse> => {
  const response = await authFetch(`${config.apiBaseUrl}/auth/session`);
  if (!response.ok) {
    throw new Error(`Failed to fetch auth session (${response.status})`);
  }

  return (await response.json()) as SessionStatusResponse;
};

export const loginWithPassword = async (password: string): Promise<void> => {
  const response = await authFetch(`${config.apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    let message = `Login failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
};

export const logout = async (): Promise<void> => {
  await authFetch(`${config.apiBaseUrl}/auth/logout`, {
    method: "POST",
  });
};
