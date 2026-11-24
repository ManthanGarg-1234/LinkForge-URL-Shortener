
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
  updateShortUrl,
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

  describe("updateShortUrl", () => {
    const existingRecord = {
      id: "url-id",
      shortCode: "Ab12Cd34",
      originalUrl: "https://example.com",
      isActive: true,
      expiresAt: null,
      createdAt: new Date("2026-11-19T10:00:00.000Z"),
    };

    it("updates the destination URL and invalidates its cached short URL", async () => {
      const updatedRecord = {
        ...existingRecord,
        originalUrl: "https://updated-example.com",
      };

      prisma.shortUrl.findFirst
        .mockResolvedValueOnce({ shortCode: "Ab12Cd34" })
        .mockResolvedValueOnce(updatedRecord);

      prisma.shortUrl.updateMany.mockResolvedValue({ count: 1 });

      const result = await updateShortUrl({
        userId: "user-id",
        id: "url-id",
        updates: {
          originalUrl: "https://updated-example.com",
        },
      });

      expect(result).toEqual(updatedRecord);

      expect(prisma.shortUrl.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          id: "url-id",
          userId: "user-id",
        },
        select: {
          shortCode: true,
        },
      });

      expect(prisma.shortUrl.updateMany).toHaveBeenCalledWith({
        where: {
          id: "url-id",
          userId: "user-id",
        },
        data: {
          originalUrl: "https://updated-example.com",
        },
      });

      expect(prisma.shortUrl.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            id: "url-id",
            userId: "user-id",
          },
          select: expect.any(Object),
        }),
      );

      expect(result.shortCode).toBe("Ab12Cd34");

      expect(redis.del).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );
    });

    it("sets an expiration date using a Date value", async () => {
      const expiration = "2027-12-31T23:59:59.000Z";
      const updatedRecord = {
        ...existingRecord,
        expiresAt: new Date(expiration),
      };

      prisma.shortUrl.findFirst
        .mockResolvedValueOnce({ shortCode: "Ab12Cd34" })
        .mockResolvedValueOnce(updatedRecord);

      prisma.shortUrl.updateMany.mockResolvedValue({ count: 1 });

      const result = await updateShortUrl({
        userId: "user-id",
        id: "url-id",
        updates: {
          expiresAt: expiration,
        },
      });

      expect(result).toEqual(updatedRecord);

      expect(prisma.shortUrl.updateMany).toHaveBeenCalledWith({
        where: {
          id: "url-id",
          userId: "user-id",
        },
        data: {
          expiresAt: new Date(expiration),
        },
      });

      expect(redis.del).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );
    });

    it("clears the expiration date when expiresAt is null", async () => {
      const updatedRecord = {
        ...existingRecord,
        expiresAt: null,
      };

      prisma.shortUrl.findFirst
        .mockResolvedValueOnce({ shortCode: "Ab12Cd34" })
        .mockResolvedValueOnce(updatedRecord);

      prisma.shortUrl.updateMany.mockResolvedValue({ count: 1 });

      const result = await updateShortUrl({
        userId: "user-id",
        id: "url-id",
        updates: {
          expiresAt: null,
        },
      });

      expect(result.expiresAt).toBeNull();

      expect(prisma.shortUrl.updateMany).toHaveBeenCalledWith({
        where: {
          id: "url-id",
          userId: "user-id",
        },
        data: {
          expiresAt: null,
        },
      });

      expect(redis.del).toHaveBeenCalledWith(
        "linkforge:short-url:Ab12Cd34",
      );
    });

    it("returns null when the URL does not belong to the user", async () => {
      prisma.shortUrl.findFirst.mockResolvedValue(null);

      const result = await updateShortUrl({
        userId: "another-user",
        id: "url-id",
        updates: {
          originalUrl: "https://updated-example.com",
        },
      });

      expect(result).toBeNull();
      expect(prisma.shortUrl.updateMany).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it("returns null when the database update affects no records", async () => {
      prisma.shortUrl.findFirst.mockResolvedValue({
        shortCode: "Ab12Cd34",
      });

      prisma.shortUrl.updateMany.mockResolvedValue({ count: 0 });

      const result = await updateShortUrl({
        userId: "user-id",
        id: "url-id",
        updates: {
          originalUrl: "https://updated-example.com",
        },
      });

      expect(result).toBeNull();
      expect(prisma.shortUrl.findFirst).toHaveBeenCalledTimes(1);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it("does not fail the update when Redis invalidation fails", async () => {
      const updatedRecord = {
        ...existingRecord,
        originalUrl: "https://updated-example.com",
      };

      prisma.shortUrl.findFirst
        .mockResolvedValueOnce({ shortCode: "Ab12Cd34" })
        .mockResolvedValueOnce(updatedRecord);

      prisma.shortUrl.updateMany.mockResolvedValue({ count: 1 });
      redis.del.mockRejectedValue(new Error("Redis unavailable"));

      await expect(
        updateShortUrl({
          userId: "user-id",
          id: "url-id",
          updates: {
            originalUrl: "https://updated-example.com",
          },
        }),
      ).resolves.toEqual(updatedRecord);
    });

    it("rejects an empty update", async () => {
      await expect(
        updateShortUrl({
          userId: "user-id",
          id: "url-id",
          updates: {},
        }),
      ).rejects.toThrow("At least one editable field is required.");

      expect(prisma.shortUrl.findFirst).not.toHaveBeenCalled();
      expect(prisma.shortUrl.updateMany).not.toHaveBeenCalled();
    });

    it("rejects an invalid expiration date", async () => {
      await expect(
        updateShortUrl({
          userId: "user-id",
          id: "url-id",
          updates: {
            expiresAt: "not-a-date",
          },
        }),
      ).rejects.toThrow("A valid expiration date is required.");

      expect(prisma.shortUrl.findFirst).not.toHaveBeenCalled();
      expect(prisma.shortUrl.updateMany).not.toHaveBeenCalled();
    });

    it("rejects an expiration date in the past", async () => {
      await expect(
        updateShortUrl({
          userId: "user-id",
          id: "url-id",
          updates: {
            expiresAt: "2020-01-01T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow("Expiration date must be in the future.");

      expect(prisma.shortUrl.findFirst).not.toHaveBeenCalled();
      expect(prisma.shortUrl.updateMany).not.toHaveBeenCalled();
    });

    it("rejects a missing user ID", async () => {
      await expect(
        updateShortUrl({
          id: "url-id",
          updates: {
            originalUrl: "https://updated-example.com",
          },
        }),
      ).rejects.toThrow(
        "User ID, URL ID, and update data are required.",
      );

      expect(prisma.shortUrl.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a missing URL ID", async () => {
      await expect(
        updateShortUrl({
          userId: "user-id",
          updates: {
            originalUrl: "https://updated-example.com",
          },
        }),
      ).rejects.toThrow(
        "User ID, URL ID, and update data are required.",
      );

      expect(prisma.shortUrl.findFirst).not.toHaveBeenCalled();
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
      moderationStatus: "APPROVED",
      expiresAt: null,
    };

    const cachedRecord = {
      id: "url-id",
      originalUrl: "https://example.com",
      isActive: true,
      expiresAt: null,
    };

    const resolvedRecord = {
      id: "url-id",
      originalUrl: "https://example.com",
      isActive: true,
      expiresAt: null,
    };

    const cacheKey = "linkforge:short-url:Ab12Cd34";

    it("returns the redirect-safe record for an active approved link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(resolvedRecord);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledWith({
        where: { shortCode: "Ab12Cd34" },
        select: {
          id: true,
          originalUrl: true,
          isActive: true,
          moderationStatus: true,
          expiresAt: true,
        },
      });

      expect(redis.set).toHaveBeenCalledWith(
        cacheKey,
        JSON.stringify(cachedRecord),
        "EX",
        60,
      );
    });

    it("verifies a cached record against PostgreSQL before returning it", async () => {
      redis.get.mockResolvedValue(JSON.stringify(cachedRecord));
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(resolvedRecord);

      expect(redis.get).toHaveBeenCalledWith(cacheKey);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledWith({
        where: { shortCode: "Ab12Cd34" },
        select: {
          id: true,
          isActive: true,
          expiresAt: true,
          moderationStatus: true,
        },
      });

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledTimes(1);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("rejects a cached URL when PostgreSQL reports it as blocked", async () => {
      redis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      prisma.shortUrl.findUnique.mockResolvedValue({
        ...activeRecord,
        moderationStatus: "BLOCKED",
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith(cacheKey);
    });

    it("rejects a cached URL when PostgreSQL reports it as inactive", async () => {
      redis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      prisma.shortUrl.findUnique.mockResolvedValue({
        ...activeRecord,
        isActive: false,
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith(cacheKey);
    });

    it("rejects a cached URL when PostgreSQL reports it as expired", async () => {
      redis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      prisma.shortUrl.findUnique.mockResolvedValue({
        ...activeRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith(cacheKey);
    });

    it("rejects a cached URL when its database record no longer exists", async () => {
      redis.get.mockResolvedValue(JSON.stringify(cachedRecord));
      prisma.shortUrl.findUnique.mockResolvedValue(null);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith(cacheKey);
    });

    it("rejects a cached URL when its database ID does not match", async () => {
      redis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      prisma.shortUrl.findUnique.mockResolvedValue({
        ...activeRecord,
        id: "different-url-id",
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith(cacheKey);
    });

    it("fails closed when PostgreSQL cannot verify a cached URL", async () => {
      redis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      prisma.shortUrl.findUnique.mockRejectedValue(
        new Error("Database unavailable"),
      );

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).rejects.toThrow("Database unavailable");

      expect(redis.del).not.toHaveBeenCalled();
    });

    it("falls back to PostgreSQL when Redis is unavailable", async () => {
      redis.status = "end";
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(resolvedRecord);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledWith({
        where: { shortCode: "Ab12Cd34" },
        select: {
          id: true,
          originalUrl: true,
          isActive: true,
          expiresAt: true,
          moderationStatus: true,
        },
      });

      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("falls back to PostgreSQL when Redis read fails", async () => {
      redis.get.mockRejectedValue(new Error("Redis read failed"));
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(resolvedRecord);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledTimes(1);
    });

    it("still resolves the URL when Redis cache writing fails", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);
      redis.set.mockRejectedValue(new Error("Redis write failed"));

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(resolvedRecord);
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

    it("returns null for a blocked link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue({
        ...activeRecord,
        moderationStatus: "BLOCKED",
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
          ...cachedRecord,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      );

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith(cacheKey);
      expect(prisma.shortUrl.findUnique).not.toHaveBeenCalled();
    });

    it("removes malformed cache data and falls back to PostgreSQL", async () => {
      redis.get.mockResolvedValue("{invalid-json");
      prisma.shortUrl.findUnique.mockResolvedValue(activeRecord);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(resolvedRecord);

      expect(redis.del).toHaveBeenCalledWith(cacheKey);
      expect(prisma.shortUrl.findUnique).toHaveBeenCalledTimes(1);
    });

    it("does not query Redis or PostgreSQL for an empty short code", async () => {
      await expect(resolveShortCode("")).resolves.toBeNull();

      expect(redis.get).not.toHaveBeenCalled();
      expect(prisma.shortUrl.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("recordClick", () => {
    const clickedAt = new Date("2026-11-19T10:00:00.000Z");

    it("persists the supplied click timestamp and referrer origin", async () => {
      const event = {
        id: "click-id",
        shortUrlId: "url-id",
        clickedAt,
      };

      prisma.clickEvent.create.mockResolvedValue(event);

      const result = await recordClick({
        shortUrlId: "url-id",
        referrerOrigin: "https://google.com",
        clickedAt,
      });

      expect(result).toEqual(event);

      expect(prisma.clickEvent.create).toHaveBeenCalledWith({
        data: {
          shortUrlId: "url-id",
          referrerOrigin: "https://google.com",
          clickedAt,
        },
        select: {
          id: true,
          shortUrlId: true,
          clickedAt: true,
        },
      });
    });

    it("allows a missing referrer while preserving the timestamp", async () => {
      prisma.clickEvent.create.mockResolvedValue({
        id: "click-id",
        shortUrlId: "url-id",
        clickedAt,
      });

      await recordClick({
        shortUrlId: "url-id",
        clickedAt,
      });

      expect(prisma.clickEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            shortUrlId: "url-id",
            referrerOrigin: null,
            clickedAt,
          },
        }),
      );
    });

    it("rejects a missing short URL ID", async () => {
      await expect(
        recordClick({
          clickedAt,
        }),
      ).rejects.toThrow("Short URL ID is required.");

      expect(prisma.clickEvent.create).not.toHaveBeenCalled();
    });

    it("rejects a missing click timestamp", async () => {
      await expect(
        recordClick({
          shortUrlId: "url-id",
        }),
      ).rejects.toThrow("A valid click timestamp is required.");

      expect(prisma.clickEvent.create).not.toHaveBeenCalled();
    });

    it("rejects an invalid click timestamp", async () => {
      await expect(
        recordClick({
          shortUrlId: "url-id",
          clickedAt: new Date("invalid"),
        }),
      ).rejects.toThrow("A valid click timestamp is required.");

      expect(prisma.clickEvent.create).not.toHaveBeenCalled();
    });

    it("rejects a timestamp supplied as a string", async () => {
      await expect(
        recordClick({
          shortUrlId: "url-id",
          clickedAt: "2026-11-19T10:00:00.000Z",
        }),
      ).rejects.toThrow("A valid click timestamp is required.");

      expect(prisma.clickEvent.create).not.toHaveBeenCalled();
    });
  });
});
