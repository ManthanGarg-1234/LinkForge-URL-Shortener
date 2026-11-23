import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { env } from "../config/env.js";
const { blockShortUrl, restoreShortUrl } = vi.hoisted(() => ({
  blockShortUrl: vi.fn(),
  restoreShortUrl: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("../middleware/auth.middleware.js", () => ({
  authenticate(req, res, next) {
    const cookie = req.headers.cookie ?? "";

    if (cookie.includes("lf_test_auth=admin")) {
      req.user = {
        id: "11111111-1111-4111-8111-111111111111",
        email: "admin@example.com",
        role: "ADMIN",
        sessionId: "admin-session-123",
      };

      return next();
    }

    if (cookie.includes("lf_test_auth=user")) {
      req.user = {
        id: "22222222-2222-4222-8222-222222222222",
        email: "user@example.com",
        role: "USER",
        sessionId: "user-session-123",
      };

      return next();
    }

    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
  },
}));

vi.mock("../services/admin-url-moderation.service.js", () => ({
  blockShortUrl,
  restoreShortUrl,
}));

import app from "../app.js";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const SHORT_CODE = "Ab12Cd34";

const blockedUrl = {
  id: "33333333-3333-4333-8333-333333333333",
  shortCode: SHORT_CODE,
  originalUrl: "https://example.com",
  isActive: true,
  moderationStatus: "BLOCKED",
  moderationReason: "Confirmed phishing destination.",
};

const restoredUrl = {
  ...blockedUrl,
  moderationStatus: "APPROVED",
  moderatedAt: null,
  moderationReason: null,
  moderatedByAdminId: null,
};

function adminRequest(method, path) {
  return request(app)
    [method](path)
    .set("Cookie", "lf_test_auth=admin")
    .set("Origin", env.CORS_ORIGIN);
}

describe("Admin URL moderation API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    blockShortUrl.mockResolvedValue(blockedUrl);
    restoreShortUrl.mockResolvedValue(restoredUrl);
  });

  describe("POST /api/v1/admin/short-urls/:shortCode/block", () => {
    const path = `/api/v1/admin/short-urls/${SHORT_CODE}/block`;

    it("rejects unauthenticated requests", async () => {
      const response = await request(app)
        .post(path)
        .send({ reason: "Confirmed phishing destination." });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("rejects authenticated non-admin users", async () => {
      const response = await request(app)
        .post(path)
        .set("Cookie", "lf_test_auth=user")
        .send({ reason: "Confirmed phishing destination." });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("blocks a URL for an administrator", async () => {
      const response = await adminRequest("post", path).send({
        reason: "Confirmed phishing destination.",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toEqual(blockedUrl);

      expect(blockShortUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
          reason: "Confirmed phishing destination.",
        }),
      );
    });

    it("rejects admin block requests from an untrusted origin", async () => {
      const response = await request(app)
        .post(path)
        .set("Cookie", "lf_test_auth=admin")
        .set("Origin", "https://attacker.example")
        .send({ reason: "Confirmed phishing destination." });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("rejects a short code with an invalid format", async () => {
      const response = await adminRequest(
        "post",
        "/api/v1/admin/short-urls/invalid-code/block",
      ).send({ reason: "Confirmed phishing destination." });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("rejects a short code with an incorrect length", async () => {
      const response = await adminRequest(
        "post",
        "/api/v1/admin/short-urls/Ab123/block",
      ).send({ reason: "Confirmed phishing destination." });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("rejects a missing blocking reason", async () => {
      const response = await adminRequest("post", path).send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("rejects a blocking reason shorter than 10 characters", async () => {
      const response = await adminRequest("post", path).send({
        reason: "Too short",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("rejects a blocking reason longer than 500 characters", async () => {
      const response = await adminRequest("post", path).send({
        reason: "A".repeat(501),
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("rejects unexpected request body properties", async () => {
      const response = await adminRequest("post", path).send({
        reason: "Confirmed phishing destination.",
        moderationStatus: "APPROVED",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(blockShortUrl).not.toHaveBeenCalled();
    });

    it("returns the service error when the URL does not exist", async () => {
      blockShortUrl.mockRejectedValueOnce(
        Object.assign(new Error("The requested short URL does not exist."), {
          statusCode: 404,
          code: "SHORT_URL_NOT_FOUND",
        }),
      );

      const response = await adminRequest("post", path).send({
        reason: "Confirmed phishing destination.",
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");
    });

    it("returns a conflict when the URL is already blocked", async () => {
      blockShortUrl.mockRejectedValueOnce(
        Object.assign(new Error("This short URL is already blocked."), {
          statusCode: 409,
          code: "SHORT_URL_ALREADY_BLOCKED",
        }),
      );

      const response = await adminRequest("post", path).send({
        reason: "Confirmed phishing destination.",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SHORT_URL_ALREADY_BLOCKED");
    });
  });

  describe("POST /api/v1/admin/short-urls/:shortCode/restore", () => {
    const path = `/api/v1/admin/short-urls/${SHORT_CODE}/restore`;

    it("rejects unauthenticated requests", async () => {
      const response = await request(app).post(path);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(restoreShortUrl).not.toHaveBeenCalled();
    });

    it("rejects authenticated non-admin users", async () => {
      const response = await request(app)
        .post(path)
        .set("Cookie", "lf_test_auth=user");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(restoreShortUrl).not.toHaveBeenCalled();
    });

    it("restores a blocked URL for an administrator", async () => {
      const response = await adminRequest("post", path);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toEqual(restoredUrl);

      expect(restoreShortUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
        }),
      );
    });

    it("rejects admin restore requests from an untrusted origin", async () => {
      const response = await request(app)
        .post(path)
        .set("Cookie", "lf_test_auth=admin")
        .set("Origin", "https://attacker.example");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(restoreShortUrl).not.toHaveBeenCalled();
    });

    it("rejects an invalid short code", async () => {
      const response = await adminRequest(
        "post",
        "/api/v1/admin/short-urls/bad-code/restore",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(restoreShortUrl).not.toHaveBeenCalled();
    });

    it("returns 404 when the URL does not exist", async () => {
      restoreShortUrl.mockRejectedValueOnce(
        Object.assign(new Error("The requested short URL does not exist."), {
          statusCode: 404,
          code: "SHORT_URL_NOT_FOUND",
        }),
      );

      const response = await adminRequest("post", path);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");
    });

    it("returns a conflict when the URL is not blocked", async () => {
      restoreShortUrl.mockRejectedValueOnce(
        Object.assign(new Error("This short URL is not currently blocked."), {
          statusCode: 409,
          code: "SHORT_URL_NOT_BLOCKED",
        }),
      );

      const response = await adminRequest("post", path);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_BLOCKED");
    });

    it("does not expose unexpected internal service errors", async () => {
      restoreShortUrl.mockRejectedValueOnce(
        new Error("Sensitive database connection details"),
      );

      const response = await adminRequest("post", path);

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain(
        "Sensitive database connection details",
      );
    });
  });
});
