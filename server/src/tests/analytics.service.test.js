
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    shortUrl: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    clickEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma.js";

import {
  getAnalyticsOverview,
  getLinkAnalytics,
} from "../services/analytics.service.js";

describe("Analytics service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAnalyticsOverview", () => {
    it("returns account totals, daily clicks, and top links", async () => {
      prisma.shortUrl.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      prisma.clickEvent.count.mockResolvedValue(42);

      prisma.clickEvent.findMany.mockResolvedValue([
        { clickedAt: new Date() },
        { clickedAt: new Date() },
      ]);

      prisma.clickEvent.groupBy.mockResolvedValue([
        {
          shortUrlId: "url-1",
          _count: { shortUrlId: 20 },
        },
        {
          shortUrlId: "url-2",
          _count: { shortUrlId: 15 },
        },
      ]);

      prisma.shortUrl.findMany.mockResolvedValue([
        {
          id: "url-1",
          shortCode: "Ab12Cd34",
          originalUrl: "https://example.com",
          isActive: true,
        },
        {
          id: "url-2",
          shortCode: "Ef56Gh78",
          originalUrl: "https://google.com",
          isActive: true,
        },
      ]);

      const result = await getAnalyticsOverview({
        userId: "user-123",
      });

      expect(result.summary).toEqual({
        totalLinks: 5,
        activeLinks: 3,
        totalClicks: 42,
      });

      expect(result.dailyClicks).toHaveLength(30);
      expect(
        result.dailyClicks.reduce(
          (total, day) => total + day.clicks,
          0,
        ),
      ).toBe(2);

      expect(result.topLinks).toHaveLength(2);
      expect(result.topLinks[0].clicks).toBe(20);
      expect(result.topLinks[1].clicks).toBe(15);

      expect(result.period.days).toBe(30);
      expect(result.period.timezone).toBe("UTC");

      expect(prisma.shortUrl.count).toHaveBeenNthCalledWith(1, {
        where: { userId: "user-123" },
      });

      expect(prisma.shortUrl.count).toHaveBeenNthCalledWith(2, {
        where: {
          userId: "user-123",
          isActive: true,
        },
      });

      expect(prisma.clickEvent.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["shortUrlId"],
          take: 5,
        }),
      );
    });

    it("returns empty top links when the account has no clicks", async () => {
      prisma.shortUrl.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      prisma.clickEvent.count.mockResolvedValue(0);
      prisma.clickEvent.findMany.mockResolvedValue([]);
      prisma.clickEvent.groupBy.mockResolvedValue([]);

      const result = await getAnalyticsOverview({
        userId: "user-123",
      });

      expect(result.summary).toEqual({
        totalLinks: 0,
        activeLinks: 0,
        totalClicks: 0,
      });

      expect(result.topLinks).toEqual([]);
      expect(result.dailyClicks).toHaveLength(30);

      expect(prisma.shortUrl.findMany).not.toHaveBeenCalled();
    });

    it("rejects a missing user ID", async () => {
      await expect(
        getAnalyticsOverview({}),
      ).rejects.toThrow("User ID is required.");
    });
  });

  describe("getLinkAnalytics", () => {
    it("returns link statistics and referrer breakdown", async () => {
      prisma.shortUrl.findFirst.mockResolvedValue({
        id: "url-1",
        shortCode: "Ab12Cd34",
        originalUrl: "https://example.com",
        isActive: true,
        createdAt: new Date(),
      });

      prisma.clickEvent.count.mockResolvedValue(10);

      prisma.clickEvent.findMany.mockResolvedValue([
        {
          clickedAt: new Date(),
          referrerOrigin: "https://google.com",
        },
        {
          clickedAt: new Date(),
          referrerOrigin: "https://google.com",
        },
        {
          clickedAt: new Date(),
          referrerOrigin: "https://bing.com",
        },
        {
          clickedAt: new Date(),
          referrerOrigin: null,
        },
      ]);

      const result = await getLinkAnalytics({
        userId: "user-123",
        id: "url-1",
      });

      expect(result.link.id).toBe("url-1");

      expect(result.summary).toEqual({
        totalClicks: 10,
        clicksLast30Days: 4,
      });

      expect(result.dailyClicks).toHaveLength(30);

      expect(result.referrers).toEqual([
        {
          referrer: "https://google.com",
          clicks: 2,
        },
        {
          referrer: "Direct / Unknown",
          clicks: 1,
        },
        {
          referrer: "https://bing.com",
          clicks: 1,
        },
      ]);

      expect(prisma.shortUrl.findFirst).toHaveBeenCalledWith({
        where: {
          id: "url-1",
          userId: "user-123",
        },
        select: {
          id: true,
          shortCode: true,
          originalUrl: true,
          isActive: true,
          createdAt: true,
        },
      });
    });

    it("returns null when the link does not belong to the user", async () => {
      prisma.shortUrl.findFirst.mockResolvedValue(null);

      const result = await getLinkAnalytics({
        userId: "user-123",
        id: "another-users-url",
      });

      expect(result).toBeNull();
      expect(prisma.clickEvent.count).not.toHaveBeenCalled();
      expect(prisma.clickEvent.findMany).not.toHaveBeenCalled();
    });

    it("rejects missing user or URL IDs", async () => {
      await expect(
        getLinkAnalytics({
          userId: "user-123",
        }),
      ).rejects.toThrow("User ID and URL ID are required.");

      await expect(
        getLinkAnalytics({
          id: "url-1",
        }),
      ).rejects.toThrow("User ID and URL ID are required.");
    });
  });
});
