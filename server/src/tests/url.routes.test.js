import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("../middleware/auth.middleware.js", () => ({
  authenticate(req, res, next) {
    if (req.headers.cookie?.includes("lf_test_auth=valid")) {
      req.user = {
        id: "user-123",
        email: "user@example.com",
        role: "USER",
        sessionId: "session-123",
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

vi.mock("../lib/click-queue.js", () => ({
  enqueueClick: vi.fn(),
}));

vi.mock("../services/url.service.js", () => ({
  createShortUrl: vi.fn(),
  getUserShortUrls: vi.fn(),
  updateShortUrlStatus: vi.fn(),
  deleteShortUrl: vi.fn(),
  resolveShortCode: vi.fn(),
  recordClick: vi.fn(),
}));

import app from "../app.js";
import { env } from "../config/env.js";

import { enqueueClick } from "../lib/click-queue.js";

import {
  createShortUrl,
  getUserShortUrls,
  updateShortUrlStatus,
  deleteShortUrl,
  resolveShortCode,
  recordClick,
} from "../services/url.service.js";

const validRecord = {
  id: "url-123",
  shortCode: "Ab12Cd34",
  originalUrl: "https://example.com",
  isActive: true,
  expiresAt: null,
  createdAt: new Date("2026-11-19T10:00:00.000Z"),
};

const validUrlId = "550e8400-e29b-41d4-a716-446655440000";

function authenticatedRequest(method, path) {
  return request(app)[method](path).set("Cookie", "lf_test_auth=valid");
}

function trustedAuthenticatedRequest(method, path) {
  return authenticatedRequest(method, path).set("Origin", env.CORS_ORIGIN);
}

describe("URL API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createShortUrl.mockResolvedValue(validRecord);

    getUserShortUrls.mockResolvedValue({
      items: [validRecord],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    updateShortUrlStatus.mockResolvedValue(validRecord);
    deleteShortUrl.mockResolvedValue(true);

    resolveShortCode.mockResolvedValue({
      id: validRecord.id,
      originalUrl: validRecord.originalUrl,
      isActive: true,
      expiresAt: null,
    });

    enqueueClick.mockResolvedValue({ id: "job-123" });

    recordClick.mockResolvedValue({
      id: "click-123",
      shortUrlId: validRecord.id,
      clickedAt: new Date(),
    });
  });

  describe("POST /api/v1/urls", () => {
    it("creates a short URL for the authenticated user", async () => {
      const response = await trustedAuthenticatedRequest(
        "post",
        "/api/v1/urls",
      ).send({
        originalUrl: "https://example.com",
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url.shortCode).toBe("Ab12Cd34");
      expect(response.body.data.url.shortUrl).toBe(
        `${env.APP_BASE_URL}/Ab12Cd34`,
      );

      expect(createShortUrl).toHaveBeenCalledWith({
        userId: "user-123",
        originalUrl: "https://example.com",
        expiresAt: undefined,
      });
    });

    it("rejects requests without authentication", async () => {
      const response = await request(app)
        .post("/api/v1/urls")
        .set("Origin", env.CORS_ORIGIN)
        .send({
          originalUrl: "https://example.com",
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(createShortUrl).not.toHaveBeenCalled();
    });

    it("rejects requests from an untrusted origin", async () => {
      const response = await authenticatedRequest("post", "/api/v1/urls")
        .set("Origin", "https://attacker.example")
        .send({
          originalUrl: "https://example.com",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(createShortUrl).not.toHaveBeenCalled();
    });

    it("rejects invalid URLs", async () => {
      const response = await trustedAuthenticatedRequest(
        "post",
        "/api/v1/urls",
      ).send({
        originalUrl: "javascript:alert(1)",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(createShortUrl).not.toHaveBeenCalled();
    });

    it("rejects additional unexpected request properties", async () => {
      const response = await trustedAuthenticatedRequest(
        "post",
        "/api/v1/urls",
      ).send({
        originalUrl: "https://example.com",
        userId: "another-user",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(createShortUrl).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/urls", () => {
    it("returns only the authenticated user's URL records", async () => {
      const response = await authenticatedRequest("get", "/api/v1/urls");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.urls).toHaveLength(1);
      expect(response.body.data.urls[0].shortCode).toBe("Ab12Cd34");

      expect(getUserShortUrls).toHaveBeenCalledWith({
        userId: "user-123",
        page: 1,
        limit: 20,
      });
    });

    it("supports pagination query parameters", async () => {
      const response = await authenticatedRequest(
        "get",
        "/api/v1/urls?page=2&limit=10",
      );

      expect(response.status).toBe(200);

      expect(getUserShortUrls).toHaveBeenCalledWith({
        userId: "user-123",
        page: 2,
        limit: 10,
      });
    });

    it("rejects invalid pagination parameters", async () => {
      const response = await authenticatedRequest(
        "get",
        "/api/v1/urls?page=0&limit=500",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(getUserShortUrls).not.toHaveBeenCalled();
    });

    it("rejects requests without authentication", async () => {
      const response = await request(app).get("/api/v1/urls");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(getUserShortUrls).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/v1/urls/:id/status", () => {
    it("deactivates an owned short URL", async () => {
      updateShortUrlStatus.mockResolvedValue({
        ...validRecord,
        isActive: false,
      });

      const response = await trustedAuthenticatedRequest(
        "patch",
        `/api/v1/urls/${validUrlId}/status`,
      ).send({
        isActive: false,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url.isActive).toBe(false);

      expect(updateShortUrlStatus).toHaveBeenCalledWith({
        userId: "user-123",
        id: validUrlId,
        isActive: false,
      });
    });

    it("activates an owned short URL", async () => {
      const response = await trustedAuthenticatedRequest(
        "patch",
        `/api/v1/urls/${validUrlId}/status`,
      ).send({
        isActive: true,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url.isActive).toBe(true);

      expect(updateShortUrlStatus).toHaveBeenCalledWith({
        userId: "user-123",
        id: validUrlId,
        isActive: true,
      });
    });

    it("rejects an invalid URL ID", async () => {
      const response = await trustedAuthenticatedRequest(
        "patch",
        "/api/v1/urls/invalid-id/status",
      ).send({
        isActive: false,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(updateShortUrlStatus).not.toHaveBeenCalled();
    });

    it("rejects an invalid status value", async () => {
      const response = await trustedAuthenticatedRequest(
        "patch",
        `/api/v1/urls/${validUrlId}/status`,
      ).send({
        isActive: "false",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(updateShortUrlStatus).not.toHaveBeenCalled();
    });

    it("returns 404 when the URL does not belong to the user", async () => {
      updateShortUrlStatus.mockResolvedValue(null);

      const response = await trustedAuthenticatedRequest(
        "patch",
        `/api/v1/urls/${validUrlId}/status`,
      ).send({
        isActive: false,
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app)
        .patch(`/api/v1/urls/${validUrlId}/status`)
        .set("Origin", env.CORS_ORIGIN)
        .send({
          isActive: false,
        });

      expect(response.status).toBe(401);
      expect(updateShortUrlStatus).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/v1/urls/:id", () => {
    it("deletes an owned short URL", async () => {
      const response = await trustedAuthenticatedRequest(
        "delete",
        `/api/v1/urls/${validUrlId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(deleteShortUrl).toHaveBeenCalledWith({
        userId: "user-123",
        id: validUrlId,
      });
    });

    it("returns 404 when the URL does not belong to the user", async () => {
      deleteShortUrl.mockResolvedValue(false);

      const response = await trustedAuthenticatedRequest(
        "delete",
        `/api/v1/urls/${validUrlId}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");
    });

    it("rejects an invalid URL ID", async () => {
      const response = await trustedAuthenticatedRequest(
        "delete",
        "/api/v1/urls/invalid-id",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(deleteShortUrl).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app)
        .delete(`/api/v1/urls/${validUrlId}`)
        .set("Origin", env.CORS_ORIGIN);

      expect(response.status).toBe(401);
      expect(deleteShortUrl).not.toHaveBeenCalled();
    });

    it("rejects requests from an untrusted origin", async () => {
      const response = await authenticatedRequest(
        "delete",
        `/api/v1/urls/${validUrlId}`,
      ).set("Origin", "https://attacker.example");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(deleteShortUrl).not.toHaveBeenCalled();
    });
  });

  describe("GET /:shortCode", () => {
    it("redirects to the original URL and queues a click", async () => {
      const response = await request(app).get("/Ab12Cd34");

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("https://example.com");
      expect(response.headers["cache-control"]).toContain("no-store");

      expect(resolveShortCode).toHaveBeenCalledWith("Ab12Cd34");

      expect(enqueueClick).toHaveBeenCalledWith(
        expect.objectContaining({
          shortUrlId: validRecord.id,
          referrerOrigin: null,
          clickedAt: expect.any(Date),
        }),
      );

      expect(recordClick).not.toHaveBeenCalled();
    });

    it("queues only the referrer origin with the click timestamp", async () => {
      const response = await request(app)
        .get("/Ab12Cd34")
        .set("Referer", "https://google.com/search?q=private");

      expect(response.status).toBe(302);

      expect(enqueueClick).toHaveBeenCalledWith(
        expect.objectContaining({
          shortUrlId: validRecord.id,
          referrerOrigin: "https://google.com",
          clickedAt: expect.any(Date),
        }),
      );
    });

    it("falls back to direct database recording when queue submission fails", async () => {
      enqueueClick.mockRejectedValue(new Error("Redis queue unavailable"));

      const response = await request(app).get("/Ab12Cd34");

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("https://example.com");

      expect(enqueueClick).toHaveBeenCalledTimes(1);
      expect(recordClick).toHaveBeenCalledTimes(1);

      const queuedClick = enqueueClick.mock.calls[0][0];

      expect(queuedClick.clickedAt).toBeInstanceOf(Date);

      expect(recordClick).toHaveBeenCalledWith(queuedClick);
      expect(recordClick.mock.calls[0][0].clickedAt).toBe(
        queuedClick.clickedAt,
      );
    });

    it("still redirects when both queue and database recording fail", async () => {
      enqueueClick.mockRejectedValue(new Error("Redis queue unavailable"));

      recordClick.mockRejectedValue(
        new Error("Analytics database unavailable"),
      );

      const response = await request(app).get("/Ab12Cd34");

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("https://example.com");
    });

    it("returns 404 for an invalid short code format", async () => {
      const response = await request(app).get("/invalid");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");
      expect(resolveShortCode).not.toHaveBeenCalled();
      expect(enqueueClick).not.toHaveBeenCalled();
      expect(recordClick).not.toHaveBeenCalled();
    });

    it("returns 404 when the short code does not exist", async () => {
      resolveShortCode.mockResolvedValue(null);

      const response = await request(app).get("/Ab12Cd34");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");
      expect(enqueueClick).not.toHaveBeenCalled();
      expect(recordClick).not.toHaveBeenCalled();
    });
  });
});