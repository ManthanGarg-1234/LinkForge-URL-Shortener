
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const {
  requestPasswordResetMock,
  resetPasswordMock,
  sendPasswordResetEmailMock,
} = vi.hoisted(() => ({
  requestPasswordResetMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
}));

vi.mock("../services/password-reset.service.js", () => ({
  requestPasswordReset: requestPasswordResetMock,
  resetPassword: resetPasswordMock,
}));

vi.mock("../services/password-reset-delivery.service.js", () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

import app from "../app.js";
import { env } from "../config/env.js";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "../config/auth.js";

const origin = env.CORS_ORIGIN;

const validResetToken = "password-reset-token-12345678901234567890";

const activeUserResult = {
  requested: true,
  resetToken: validResetToken,
  user: {
    id: "user-123",
    email: "user@example.com",
    name: "Test User",
  },
};

function trustedRequest(method, path) {
  return request(app)[method](path).set("Origin", origin);
}

describe("Password recovery API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requestPasswordResetMock.mockResolvedValue(activeUserResult);

    resetPasswordMock.mockResolvedValue({
      reset: true,
      reason: "PASSWORD_RESET",
    });

    sendPasswordResetEmailMock.mockResolvedValue({
      delivered: true,
    });
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("should request a reset link for an existing account", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/forgot-password"
      ).send({
        email: "USER@example.com",
      });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);

      expect(requestPasswordResetMock).toHaveBeenCalledWith(
        "user@example.com"
      );

      expect(sendPasswordResetEmailMock).toHaveBeenCalledWith({
        email: "user@example.com",
        name: "Test User",
        token: validResetToken,
      });
    });

    it("should return the same public response for an unknown account", async () => {
      requestPasswordResetMock.mockResolvedValue({
        requested: false,
        resetToken: null,
        user: null,
      });

      const response = await trustedRequest(
        "post",
        "/api/v1/auth/forgot-password"
      ).send({
        email: "unknown@example.com",
      });

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        success: true,
        message:
          "If an account exists for this email, password reset instructions will be sent.",
      });

      expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    });

    it("should reject an invalid email address", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/forgot-password"
      ).send({
        email: "not-an-email",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(requestPasswordResetMock).not.toHaveBeenCalled();
    });

    it("should reject an untrusted origin", async () => {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .set("Origin", "https://attacker.example")
        .send({
          email: "user@example.com",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(requestPasswordResetMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("should reset the password and clear authentication cookies", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/reset-password"
      ).send({
        token: validResetToken,
        newPassword: "NewStrongPassword123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(resetPasswordMock).toHaveBeenCalledWith(
        validResetToken,
        "NewStrongPassword123!"
      );

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
      expect(accessCookie).toContain("Expires=");

      expect(refreshCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain("Path=/api/v1/auth");
      expect(refreshCookie).toContain("Expires=");
    });

    it("should reject an invalid or expired reset token", async () => {
      resetPasswordMock.mockResolvedValue({
        reset: false,
        reason: "EXPIRED_TOKEN",
      });

      const response = await trustedRequest(
        "post",
        "/api/v1/auth/reset-password"
      ).send({
        token: validResetToken,
        newPassword: "NewStrongPassword123!",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("EXPIRED_TOKEN");
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("should reject an invalid reset request", async () => {
      const response = await trustedRequest(
        "post",
        "/api/v1/auth/reset-password"
      ).send({
        token: "short",
        newPassword: "weak",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(resetPasswordMock).not.toHaveBeenCalled();
    });

    it("should reject an untrusted origin", async () => {
      const response = await request(app)
        .post("/api/v1/auth/reset-password")
        .set("Origin", "https://attacker.example")
        .send({
          token: validResetToken,
          newPassword: "NewStrongPassword123!",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(resetPasswordMock).not.toHaveBeenCalled();
    });
  });
});
