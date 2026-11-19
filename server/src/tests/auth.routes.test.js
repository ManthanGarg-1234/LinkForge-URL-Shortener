
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const {
  prismaMock,
  registerUserMock,
  loginUserMock,
  verifyEmailAddressMock,
  sendVerificationEmailMock,
  rotateRefreshTokenMock,
  revokeSessionMock,
  verifyAccessTokenMock,
} = vi.hoisted(() => ({
  prismaMock: {
    session: {
      findFirst: vi.fn(),
    },
  },
  registerUserMock: vi.fn(),
  loginUserMock: vi.fn(),
  verifyEmailAddressMock: vi.fn(),
  sendVerificationEmailMock: vi.fn(),
  rotateRefreshTokenMock: vi.fn(),
  revokeSessionMock: vi.fn(),
  verifyAccessTokenMock: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../services/auth.service.js", () => ({
  registerUser: registerUserMock,
  loginUser: loginUserMock,
}));

vi.mock("../services/email-verification.service.js", () => ({
  verifyEmailAddress: verifyEmailAddressMock,
}));

vi.mock("../services/email-delivery.service.js", () => ({
  sendVerificationEmail: sendVerificationEmailMock,
}));

vi.mock("../services/session.service.js", () => ({
  rotateRefreshToken: rotateRefreshTokenMock,
  revokeSession: revokeSessionMock,
}));

vi.mock("../utils/token.utils.js", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    verifyAccessToken: verifyAccessTokenMock,
  };
});

import app from "../app.js";
import { env } from "../config/env.js";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "../config/auth.js";

const validUser = {
  id: "user-123",
  email: "user@example.com",
  name: "Test User",
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const validSession = {
  sessionId: "session-123",
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token-123456789",
};

const activeDatabaseSession = {
  id: "session-123",
  userId: "user-123",
  user: {
    id: "user-123",
    email: "user@example.com",
    name: "Test User",
    role: "USER",
    status: "ACTIVE",
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
};

const origin = env.CORS_ORIGIN;

function trustedRequest(method, path) {
  return request(app)[method](path).set("Origin", origin);
}

function authenticatedRequest(method, path) {
  return trustedRequest(method, path).set(
    "Cookie",
    `${ACCESS_TOKEN_COOKIE}=valid-access-token`
  );
}

describe("Authentication API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    registerUserMock.mockResolvedValue({
      created: true,
      user: validUser,
      verificationToken: "verification-token-12345678901234567890",
    });

    loginUserMock.mockResolvedValue({
      authenticated: true,
      user: validUser,
      session: validSession,
    });

    verifyEmailAddressMock.mockResolvedValue({
      verified: true,
      reason: "EMAIL_VERIFIED",
    });

    sendVerificationEmailMock.mockResolvedValue({
      delivered: true,
    });

    rotateRefreshTokenMock.mockResolvedValue({
      rotated: true,
      sessionId: "session-123",
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token-123456789",
    });

    revokeSessionMock.mockResolvedValue({
      revoked: true,
    });

    verifyAccessTokenMock.mockResolvedValue({
      userId: "user-123",
      sessionId: "session-123",
    });

    prismaMock.session.findFirst.mockResolvedValue({
      ...activeDatabaseSession,
      user: { ...activeDatabaseSession.user },
    });
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a user and send a verification email", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/register"
      ).send({
        name: "Test User",
        email: "user@example.com",
        password: "StrongPassword123!",
      });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);

      expect(registerUserMock).toHaveBeenCalledWith({
        name: "Test User",
        email: "user@example.com",
        password: "StrongPassword123!",
      });

      expect(sendVerificationEmailMock).toHaveBeenCalledWith({
        email: "user@example.com",
        name: "Test User",
        token: "verification-token-12345678901234567890",
      });

      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("should return the same response for an existing email", async () => {
      registerUserMock.mockResolvedValue({
        created: false,
        user: null,
        verificationToken: null,
      });

      const response = await trustedRequest(
        "post",
        "/api/v1/auth/register"
      ).send({
        name: "Test User",
        email: "user@example.com",
        password: "StrongPassword123!",
      });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(sendVerificationEmailMock).not.toHaveBeenCalled();
    });

    it("should reject invalid registration input", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/register"
      ).send({
        name: "A",
        email: "not-an-email",
        password: "short",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(registerUserMock).not.toHaveBeenCalled();
    });

    it("should reject an untrusted origin", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .set("Origin", "https://attacker.example")
        .send({
          name: "Test User",
          email: "user@example.com",
          password: "StrongPassword123!",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(registerUserMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/verify-email", () => {
    it("should verify a valid email token", async () => {
      const token = "verification-token-12345678901234567890";

      const response = await trustedRequest(
        "post",
        "/api/v1/auth/verify-email"
      ).send({ token });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(verifyEmailAddressMock).toHaveBeenCalledWith(token);
    });

    it("should reject an invalid verification token", async () => {
      verifyEmailAddressMock.mockResolvedValue({
        verified: false,
        reason: "INVALID_TOKEN",
      });

      const response = await trustedRequest(
        "post",
        "/api/v1/auth/verify-email"
      ).send({
        token: "verification-token-12345678901234567890",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_TOKEN");
    });

    it("should reject a missing verification token", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/verify-email"
      ).send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(verifyEmailAddressMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("should authenticate a user and set HTTP-only cookies", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/login"
      ).send({
        email: "user@example.com",
        password: "StrongPassword123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe("user@example.com");

      const cookies = response.headers["set-cookie"];

      expect(cookies).toHaveLength(2);

      const accessCookie = cookies.find((cookie) =>
        cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`)
      );

      const refreshCookie = cookies.find((cookie) =>
        cookie.startsWith(`${REFRESH_TOKEN_COOKIE}=`)
      );

      expect(accessCookie).toContain("HttpOnly");
      expect(accessCookie).toContain("Path=/api/v1");

      expect(refreshCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain("Path=/api/v1/auth");
    });

    it("should reject invalid credentials without setting cookies", async () => {
      loginUserMock.mockResolvedValue({
        authenticated: false,
        reason: "INVALID_CREDENTIALS",
      });

      const response = await trustedRequest(
        "post",
        "/api/v1/auth/login"
      ).send({
        email: "user@example.com",
        password: "WrongPassword123!",
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTHENTICATION_FAILED");
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("should reject invalid login input", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/login"
      ).send({
        email: "invalid-email",
        password: "",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(loginUserMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("should rotate the refresh token and issue new cookies", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/refresh"
      ).set(
        "Cookie",
        `${REFRESH_TOKEN_COOKIE}=old-refresh-token-123456789`
      ).send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
        "old-refresh-token-123456789"
      );

      expect(response.headers["set-cookie"]).toHaveLength(2);
    });

    it("should reject a missing refresh token and clear cookies", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/refresh"
      ).send({});

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
      expect(rotateRefreshTokenMock).not.toHaveBeenCalled();

      expect(response.headers["set-cookie"]).toHaveLength(2);
    });

    it("should reject an invalid refresh token and clear cookies", async () => {
      rotateRefreshTokenMock.mockResolvedValue({
        rotated: false,
        reason: "INVALID_TOKEN",
      });

      const response = await trustedRequest(
        "post",
        "/api/v1/auth/refresh"
      ).set(
        "Cookie",
        `${REFRESH_TOKEN_COOKIE}=invalid-refresh-token-123456`
      ).send({});

      expect(response.status).toBe(401);
      expect(response.headers["set-cookie"]).toHaveLength(2);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should revoke the session and clear authentication cookies", async () => {
      const response = await authenticatedRequest(
        "post",
        "/api/v1/auth/logout"
      ).send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(revokeSessionMock).toHaveBeenCalledWith({
        sessionId: "session-123",
        userId: "user-123",
      });

      expect(response.headers["set-cookie"]).toHaveLength(2);
    });

    it("should reject logout without authentication", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/logout"
      ).send({});

      expect(response.status).toBe(401);
      expect(revokeSessionMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("should return the authenticated user's safe profile", async () => {
      const response = await authenticatedRequest(
        "get",
        "/api/v1/auth/me"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data.user).toEqual({
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
        role: "USER",
      });

      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    it("should reject a request without authentication", async () => {
      const response = await request(app).get(
        "/api/v1/auth/me"
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("should reject a revoked session", async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);

      const response = await authenticatedRequest(
        "get",
        "/api/v1/auth/me"
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });
  });
});
