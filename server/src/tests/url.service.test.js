
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    shortUrl: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    clickEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../lib/redis.js", () => ({
  redis: {
    status: "ready",
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("../utils/short-code.utils.js", () => ({
  generateShortCode: vi.fn(),
}));

import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { generateShortCode } from "../utils/short-code.utils.js";

import {
  createShortUrl,
  getUserShortUrls,
  updateShortUrlStatus,
  deleteShortUrl,
  resolveShortCode,
  recordClick,
} from "../services/url.service.js";

describe("URL service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    generateShortCode.mockReturnValue("Ab12Cd34");

    redis.status = "ready";
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);
  });

  describe("createShortUrl", () => {
    it("creates a URL for the supplied user", async () => {
      const record = {
        id: "url-id",
        shortCode: "Ab12Cd34",
        originalUrl: "https://example.com",
      };

      prisma.shortUrl.create.mockResolvedValue(record);

      const result = await createShortUrl({
        userId: "user-id",
        originalUrl: "https://example.com",
      });

      expect(result).toEqual(record);

      expect(prisma.shortUrl.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId: "user-id",
            shortCode: "Ab12Cd34",
            originalUrl: "https://example.com",
            expiresAt: null,
          },
        }),
      );
    });

    it("retries when a short-code collision occurs", async () => {
      const collision = Object.assign(
        new Error("Unique constraint failed"),
        {
          code: "P2002",
          meta: { target: ["shortCode"] },
        },
      );

      prisma.shortUrl.create
        .mockRejectedValueOnce(collision)
        .mockResolvedValueOnce({
          id: "url-id",
          shortCode: "Ef56Gh78",
        });

      generateShortCode
        .mockReturnValueOnce("Ab12Cd34")
        .mockReturnValueOnce("Ef56Gh78");

      await createShortUrl({
        userId: "user-id",
        originalUrl: "https://example.com",
      });

      expect(prisma.shortUrl.create).toHaveBeenCalledTimes(2);
    });

    it("fails after five collisions", async () => {
      const collision = Object.assign(
        new Error("Unique constraint failed"),
        {
          code: "P2002",
          meta: { target: ["shortCode"] },
        },
      );

      prisma.shortUrl.create.mockRejectedValue(collision);

      await expect(
        createShortUrl({
          userId: "user-id",
          originalUrl: "https://example.com",
        }),
      ).rejects.toMatchObject({
        statusCode: 503,
      });

      expect(prisma.shortUrl.create).toHaveBeenCalledTimes(5);
    });

    it("does not retry unrelated database errors", async () => {
      prisma.shortUrl.create.mockRejectedValue(
        new Error("Database unavailable"),
      );

      await expect(
        createShortUrl({
          userId: "user-id",
          originalUrl: "https://example.com",
        }),
      ).rejects.toThrow("Database unavailable");

      expect(prisma.shortUrl.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("getUserShortUrls", () => {
    it("returns paginated records belonging only to the user", async () => {
      const items = [{ id: "url-1", shortCode: "Ab12Cd34" }];

      prisma.$transaction.mockResolvedValue([items, 1]);

      const result = await getUserShortUrls({
        userId: "user-id",
        page: 2,
        limit: 10,
      });

      expect(result.items).toEqual(items);

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      });

      expect(prisma.shortUrl.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-id" },
          skip: 10,
          take: 10,
        }),
      );

      expect(prisma.shortUrl.count).toHaveBeenCalledWith({
        where: { userId: "user-id" },
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateShortUrlStatus", () => {
    it("updates status and invalidates the cached short URL", async () => {
      const updatedRecord = {
        id: "url-id",
        shortCode: "Ab12Cd34",
        isActive: false,
      };

      prisma.shortUrl.findFirst
        .mockResolvedValueOnce({ shortCode: "Ab12Cd34" })
        .mockResolvedValueOnce(updatedRecord);

      prisma.shortUrl.updateMany.mockResolvedValue({ count: 1 });

      const result = await updateShortUrlStatus({
        userId: "user-id",
        id: "url-id",
        isActive: false,
      });

      expect(result).toEqual(updatedRecord);

      expect(prisma.shortUrl.updateMany).toHaveBeenCalledWith({
        where: {
          id: "url-id",
          userId: "user-id",
        },
        data: {
          isActive: false,
        },
      });

      expect(redis.del).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );
    });

    it("returns null when the URL does not belong to the user", async () => {
      prisma.shortUrl.findFirst.mockResolvedValue(null);

      const result = await updateShortUrlStatus({
        userId: "user-id",
        id: "url-id",
        isActive: false,
      });

      expect(result).toBeNull();
      expect(prisma.shortUrl.updateMany).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it("does not fail the update when Redis invalidation fails", async () => {
      const updatedRecord = {
        id: "url-id",
        shortCode: "Ab12Cd34",
        isActive: false,
      };

      prisma.shortUrl.findFirst
        .mockResolvedValueOnce({ shortCode: "Ab12Cd34" })
        .mockResolvedValueOnce(updatedRecord);

      prisma.shortUrl.updateMany.mockResolvedValue({ count: 1 });
      redis.del.mockRejectedValue(new Error("Redis unavailable"));

      await expect(
        updateShortUrlStatus({
          userId: "user-id",
          id: "url-id",
          isActive: false,
        }),
      ).resolves.toEqual(updatedRecord);
    });
  });

  describe("deleteShortUrl", () => {
    it("deletes the owned URL and invalidates its cache", async () => {
      prisma.shortUrl.findFirst.mockResolvedValue({
        shortCode: "Ab12Cd34",
      });

      prisma.shortUrl.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        deleteShortUrl({
          userId: "user-id",
          id: "url-id",
        }),
      ).resolves.toBe(true);

      expect(prisma.shortUrl.deleteMany).toHaveBeenCalledWith({
        where: {
          id: "url-id",
          userId: "user-id",
        },
      });

      expect(redis.del).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );
    });

    it("returns false when the URL does not belong to the user", async () => {
      prisma.shortUrl.findFirst.mockResolvedValue(null);

      await expect(
        deleteShortUrl({
          userId: "user-id",
          id: "url-id",
        }),
      ).resolves.toBe(false);

      expect(prisma.shortUrl.deleteMany).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe("resolveShortCode", () => {
    const activeRecord = {
      id: "url-id",
      originalUrl: "https://example.com",
      isActive: true,
      expiresAt: null,
    };

    it("returns the complete record for an active link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(activeRecord);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledWith({
        where: { shortCode: "Ab12Cd34" },
        select: {
          id: true,
          originalUrl: true,
          isActive: true,
          expiresAt: true,
        },
      });

      expect(redis.set).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
        JSON.stringify({
          id: "url-id",
          originalUrl: "https://example.com",
          isActive: true,
          expiresAt: null,
        }),
        "EX",
        60,
      );
    });

    it("returns a cached record without querying PostgreSQL", async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          id: "url-id",
          originalUrl: "https://example.com",
          isActive: true,
          expiresAt: null,
        }),
      );

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(activeRecord);

      expect(redis.get).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );

      expect(prisma.shortUrl.findUnique).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("falls back to PostgreSQL when Redis is unavailable", async () => {
      redis.status = "end";
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(activeRecord);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledTimes(1);
      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("falls back to PostgreSQL when Redis read fails", async () => {
      redis.get.mockRejectedValue(new Error("Redis read failed"));
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(activeRecord);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledTimes(1);
    });

    it("still resolves the URL when Redis cache writing fails", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);
      redis.set.mockRejectedValue(new Error("Redis write failed"));

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(activeRecord);
    });

    it("returns null for a missing link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue(null);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.set).not.toHaveBeenCalled();
    });

    it("returns null for a disabled link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue({
        ...activeRecord,
        isActive: false,
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.set).not.toHaveBeenCalled();
    });

    it("returns null for an expired link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue({
        ...activeRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.set).not.toHaveBeenCalled();
    });

    it("does not serve a cached link after its expiry time", async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({
          id: "url-id",
          originalUrl: "https://example.com",
          isActive: true,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      );

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );

      expect(prisma.shortUrl.findUnique).not.toHaveBeenCalled();
    });

    it("removes malformed cache data and falls back to PostgreSQL", async () => {
      redis.get.mockResolvedValue("{invalid-json");
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(activeRecord);

      expect(redis.del).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledTimes(1);
    });

    it("does not query Redis or PostgreSQL for an empty short code", async () => {
      await expect(resolveShortCode("")).resolves.toBeNull();

      expect(redis.get).not.toHaveBeenCalled();
      expect(prisma.shortUrl.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("recordClick", () => {
    it("creates a click event with the supplied link and referrer origin", async () => {
      const event = {
        id: "click-id",
        shortUrlId: "url-id",
        clickedAt: new Date("2026-11-19T10:00:00.000Z"),
      };

      prisma.clickEvent.create.mockResolvedValue(event);

      const result = await recordClick({
        shortUrlId: "url-id",
        referrerOrigin: "https://google.com",
      });

      expect(result).toEqual(event);

      expect(prisma.clickEvent.create).toHaveBeenCalledWith({
        data: {
          shortUrlId: "url-id",
          referrerOrigin: "https://google.com",
        },
        select: {
          id: true,
          shortUrlId: true,
          clickedAt: true,
        },
      });
    });

    it("allows a missing referrer", async () => {
      prisma.clickEvent.create.mockResolvedValue({
        id: "click-id",
        shortUrlId: "url-id",
        clickedAt: new Date(),
      });

      await recordClick({
        shortUrlId: "url-id",
      });

      expect(prisma.clickEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            shortUrlId: "url-id",
            referrerOrigin: null,
          },
        }),
      );
    });

    it("rejects a missing short URL ID", async () => {
      await expect(
        recordClick({}),
      ).rejects.toThrow("Short URL ID is required.");

      expect(prisma.clickEvent.create).not.toHaveBeenCalled();
    });
  });
});
