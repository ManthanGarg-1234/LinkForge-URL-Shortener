
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

vi.mock("../services/analytics.service.js", () => ({
  getAnalyticsOverview: vi.fn(),
  getLinkAnalytics: vi.fn(),
}));

import app from "../app.js";

import {
  getAnalyticsOverview,
  getLinkAnalytics,
} from "../services/analytics.service.js";

const validUrlId = "550e8400-e29b-41d4-a716-446655440000";

function authenticatedRequest(method, path) {
  return request(app)
    [method](path)
    .set("Cookie", "lf_test_auth=valid");
}

const overviewResponse = {
  summary: {
    totalLinks: 5,
    activeLinks: 3,
    totalClicks: 42,
  },
  dailyClicks: [
    {
      date: "2026-11-19",
      clicks: 4,
    },
  ],
  topLinks: [
    {
      id: validUrlId,
      shortCode: "Ab12Cd34",
      originalUrl: "https://example.com",
      isActive: true,
      clicks: 20,
    },
  ],
  period: {
    days: 30,
    startDate: "2026-10-21",
    endDate: "2026-11-19",
    timezone: "UTC",
  },
};

const linkAnalyticsResponse = {
  link: {
    id: validUrlId,
    shortCode: "Ab12Cd34",
    originalUrl: "https://example.com",
    isActive: true,
    createdAt: new Date("2026-11-19T10:00:00.000Z"),
  },
  summary: {
    totalClicks: 10,
    clicksLast30Days: 4,
  },
  dailyClicks: [
    {
      date: "2026-11-19",
      clicks: 4,
    },
  ],
  referrers: [
    {
      referrer: "https://google.com",
      clicks: 3,
    },
    {
      referrer: "Direct / Unknown",
      clicks: 1,
    },
  ],
  period: {
    days: 30,
    startDate: "2026-10-21",
    timezone: "UTC",
  },
};

describe("Analytics API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAnalyticsOverview.mockResolvedValue(overviewResponse);
    getLinkAnalytics.mockResolvedValue(linkAnalyticsResponse);
  });

  describe("GET /api/v1/analytics/overview", () => {
    it("returns analytics overview for the authenticated user", async () => {
      const response = await authenticatedRequest(
        "get",
        "/api/v1/analytics/overview",
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data.summary).toEqual({
        totalLinks: 5,
        activeLinks: 3,
        totalClicks: 42,
      });

      expect(response.body.data.topLinks).toHaveLength(1);

      expect(getAnalyticsOverview).toHaveBeenCalledWith({
        userId: "user-123",
      });
    });

    it("rejects requests without authentication", async () => {
      const response = await request(app).get(
        "/api/v1/analytics/overview",
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");

      expect(getAnalyticsOverview).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/analytics/links/:id", () => {
    it("returns analytics for an owned short URL", async () => {
      const response = await authenticatedRequest(
        "get",
        `/api/v1/analytics/links/${validUrlId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data.link.id).toBe(validUrlId);

      expect(response.body.data.summary).toEqual({
        totalClicks: 10,
        clicksLast30Days: 4,
      });

      expect(response.body.data.referrers).toHaveLength(2);

      expect(getLinkAnalytics).toHaveBeenCalledWith({
        userId: "user-123",
        id: validUrlId,
      });
    });

    it("rejects requests without authentication", async () => {
      const response = await request(app).get(
        `/api/v1/analytics/links/${validUrlId}`,
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");

      expect(getLinkAnalytics).not.toHaveBeenCalled();
    });

    it("rejects an invalid URL ID", async () => {
      const response = await authenticatedRequest(
        "get",
        "/api/v1/analytics/links/invalid-id",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");

      expect(getLinkAnalytics).not.toHaveBeenCalled();
    });

    it("returns 404 when the URL does not belong to the user", async () => {
      getLinkAnalytics.mockResolvedValue(null);

      const response = await authenticatedRequest(
        "get",
        `/api/v1/analytics/links/${validUrlId}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");
    });
  });
});
