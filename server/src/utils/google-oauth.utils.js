
import { createHash, randomBytes } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";

import { env } from "../config/env.js";

const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

const GOOGLE_TOKEN_ENDPOINT =
  "https://oauth2.googleapis.com/token";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

const GOOGLE_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
];

export function createOAuthRandomValue() {
  return randomBytes(32).toString("base64url");
}

export function createPKCEChallenge(verifier) {
  if (typeof verifier !== "string" || verifier.length === 0) {
    throw new TypeError("A valid PKCE verifier is required.");
  }

  return createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

export function buildGoogleAuthorizationUrl({
  state,
  nonce,
  codeChallenge,
}) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth is not configured.");
  }

  if (
    typeof state !== "string" ||
    typeof nonce !== "string" ||
    typeof codeChallenge !== "string"
  ) {
    throw new TypeError("Valid OAuth state, nonce and PKCE challenge are required.");
  }

  const authorizationUrl = new URL(
    GOOGLE_AUTHORIZATION_ENDPOINT
  );

  authorizationUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  return authorizationUrl.toString();
}

export async function exchangeGoogleAuthorizationCode({
  code,
  codeVerifier,
  expectedNonce,
}) {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Google OAuth is not configured.");
  }

  if (
    typeof code !== "string" ||
    code.length === 0 ||
    typeof codeVerifier !== "string" ||
    codeVerifier.length === 0 ||
    typeof expectedNonce !== "string" ||
    expectedNonce.length === 0
  ) {
    throw new TypeError(
      "Authorization code, PKCE verifier and expected nonce are required."
    );
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error("Google authorization code exchange failed.");
  }

  const tokenResponse = await response.json();

  if (
    typeof tokenResponse.id_token !== "string" ||
    tokenResponse.id_token.length === 0
  ) {
    throw new Error("Google did not return a valid ID token.");
  }

  return verifyGoogleIdToken(
    tokenResponse.id_token,
    expectedNonce
  );
}

export async function verifyGoogleIdToken(
  idToken,
  expectedNonce
) {
  if (
    typeof idToken !== "string" ||
    idToken.length === 0 ||
    typeof expectedNonce !== "string" ||
    expectedNonce.length === 0
  ) {
    throw new TypeError("A valid Google ID token and nonce are required.");
  }

  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("Google OAuth is not configured.");
  }

  const { payload, protectedHeader } = await jwtVerify(
    idToken,
    GOOGLE_JWKS,
    {
      issuer: GOOGLE_ISSUERS,
      audience: env.GOOGLE_CLIENT_ID,
      algorithms: ["RS256"],
      requiredClaims: [
        "sub",
        "iss",
        "aud",
        "exp",
        "iat",
        "nonce",
      ],
    }
  );

  if (
    protectedHeader.alg !== "RS256" ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    payload.email_verified !== true ||
    typeof payload.nonce !== "string" ||
    payload.nonce !== expectedNonce
  ) {
    throw new Error("Google identity claims are invalid or unverified.");
  }

  return Object.freeze({
    providerAccountId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name:
      typeof payload.name === "string"
        ? payload.name.slice(0, 100)
        : null,
    emailVerified: true,
  });
}
