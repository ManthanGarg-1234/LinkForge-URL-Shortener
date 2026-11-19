
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE_OPTIONS,
  ACCESS_TOKEN_CLEAR_OPTIONS,
  REFRESH_TOKEN_CLEAR_OPTIONS,
} from "../config/auth.js";

export function setAuthCookies(res, { accessToken, refreshToken }) {
  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string"
  ) {
    throw new TypeError("Valid authentication tokens are required.");
  }

  res.cookie(
    ACCESS_TOKEN_COOKIE,
    accessToken,
    ACCESS_TOKEN_COOKIE_OPTIONS
  );

  res.cookie(
    REFRESH_TOKEN_COOKIE,
    refreshToken,
    REFRESH_TOKEN_COOKIE_OPTIONS
  );
}

export function clearAuthCookies(res) {
  res.clearCookie(
    ACCESS_TOKEN_COOKIE,
    ACCESS_TOKEN_CLEAR_OPTIONS
  );

  res.clearCookie(
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_CLEAR_OPTIONS
  );
}
