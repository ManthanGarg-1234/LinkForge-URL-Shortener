
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

import { env } from "../config/env.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  getAccessTokenKey,
} from "../config/auth.js";

/**
 * Creates a cryptographically secure opaque token.
 * The raw token should only be sent to the client.
 * Store its SHA-256 hash in the database.
 */
export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Hashes a token using SHA-256.
 * Suitable for refresh, email verification,
 * and password reset token storage.
 */
export function hashToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("A non-empty token is required.");
  }

  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

/**
 * Creates a short-lived signed access JWT.
 * Only stable identifiers are included.
 */
export async function createAccessToken({
  userId,
  sessionId,
}) {
  if (!userId || !sessionId) {
    throw new TypeError(
      "Both userId and sessionId are required."
    );
  }

  const secret = getAccessTokenKey();

  return new SignJWT({
    sid: sessionId,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(userId)
    .setIssuer(env.AUTH_ISSUER)
    .setAudience(env.AUTH_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(
      `${ACCESS_TOKEN_TTL_SECONDS}s`
    )
    .sign(secret);
}

/**
 * Verifies an access JWT's signature, issuer,
 * audience, algorithm, and expiration.
 */
export async function verifyAccessToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("A valid access token is required.");
  }

  const secret = getAccessTokenKey();

  const { payload, protectedHeader } = await jwtVerify(
    token,
    secret,
    {
      issuer: env.AUTH_ISSUER,
      audience: env.AUTH_AUDIENCE,
      algorithms: ["HS256"],
    }
  );

  if (
    protectedHeader.typ !== "JWT" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string"
  ) {
    throw new Error("Invalid access token claims.");
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}
