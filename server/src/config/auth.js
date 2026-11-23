
import { env } from "./env.js";

export const ACCESS_TOKEN_COOKIE = "lf_access";
export const REFRESH_TOKEN_COOKIE = "lf_refresh";

export const ACCESS_TOKEN_TTL_SECONDS =
  env.AUTH_ACCESS_TOKEN_TTL_SECONDS;

export const REFRESH_TOKEN_TTL_DAYS =
  env.AUTH_REFRESH_TOKEN_TTL_DAYS;

export const REFRESH_TOKEN_TTL_MS =
  REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export const REFRESH_TOKEN_TTL_SECONDS =
  REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

export const ACCESS_TOKEN_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/v1",
  maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
});

export const REFRESH_TOKEN_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/v1/auth",
  maxAge: REFRESH_TOKEN_TTL_MS,
});

export const ACCESS_TOKEN_CLEAR_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/v1",
});

export const REFRESH_TOKEN_CLEAR_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/v1/auth",
});

export function getAccessTokenKey() {
  if (!env.AUTH_ACCESS_TOKEN_SECRET) {
    throw new Error(
      "AUTH_ACCESS_TOKEN_SECRET is not configured."
    );
  }

  return new TextEncoder().encode(
    env.AUTH_ACCESS_TOKEN_SECRET
  );
}
