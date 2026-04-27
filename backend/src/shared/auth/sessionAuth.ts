import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import { backendConfig } from "../config/config.js";

const SESSION_COOKIE_NAME = "lilo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  exp: number;
};

const base64UrlEncode = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

const base64UrlDecode = (value: string): string =>
  Buffer.from(value, "base64url").toString("utf8");

const getCookieSecret = (): string | null =>
  backendConfig.auth.sessionSecret;

const sign = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const parseCookieHeader = (header: string | undefined): Record<string, string> => {
  if (!header) {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) {
      return acc;
    }

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
};

const readPayload = (token: string): SessionPayload | null => {
  const secret = getCookieSecret();
  if (!secret) {
    return null;
  }

  const separator = token.indexOf(".");
  if (separator < 0) {
    return null;
  }

  const encodedPayload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  const expectedSignature = sign(encodedPayload, secret);

  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

export const isCookieSessionAuthEnabled = (): boolean =>
  Boolean(backendConfig.auth.password);

export const verifyLoginPassword = (password: string): boolean => {
  const expected = backendConfig.auth.password;
  if (!expected) {
    return false;
  }

  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};

export const createSessionToken = (): string => {
  const secret = getCookieSecret();
  if (!secret) {
    throw new Error("LILO_AUTH_PASSWORD must be set");
  }

  const payload: SessionPayload = {
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
};

export const setSessionCookie = (c: Context, token: string): void => {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: backendConfig.runtime.nodeEnv === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
};

export const clearSessionCookie = (c: Context): void => {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
  });
};

export const isAuthorizedRequest = (c: Context): boolean => {
  if (!isCookieSessionAuthEnabled()) {
    return true;
  }

  const cookie = getCookie(c, SESSION_COOKIE_NAME);
  return cookie ? readPayload(cookie) !== null : false;
};

export const isAuthorizedUpgrade = (request: IncomingMessage): boolean => {
  if (!isCookieSessionAuthEnabled()) {
    return true;
  }

  const cookies = parseCookieHeader(request.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  return token ? readPayload(token) !== null : false;
};

export const isSessionCookiePresent = (c: Context): boolean =>
  Boolean(getCookie(c, SESSION_COOKIE_NAME));
