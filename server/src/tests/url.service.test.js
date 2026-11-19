
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    shortUrl: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    clickEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../utils/short-code.utils.js", () => ({
  generateShortCode: vi.fn(),
}));

import { prisma } from "../lib/prisma.js";
import { generateShortCode } from "../utils/short-code.utils.js";

import {
  createShortUrl,
  getUserShortUrls,
  resolveShortCode,
  recordClick,
} from "../services/url.service.js";

describe("URL service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateShortCode.mockReturnValue("Ab12Cd34");
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

  describe("resolveShortCode", () => {
    it("returns the complete record for an active link", async () => {
      const record = {
        id: "url-id",
        originalUrl: "https://example.com",
        isActive: true,
        expiresAt: null,
      };

      prisma.shortUrl.findUnique.mockResolvedValue(record);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toEqual(record);

      expect(prisma.shortUrl.findUnique).toHaveBeenCalledWith({
        where: { shortCode: "Ab12Cd34" },
        select: {
          id: true,
          originalUrl: true,
          isActive: true,
          expiresAt: true,
        },
      });
    });

    it("returns null for a missing link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue(null);

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();
    });

    it("returns null for a disabled link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue({
        id: "url-id",
        originalUrl: "https://example.com",
        isActive: false,
        expiresAt: null,
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();
    });

    it("returns null for an expired link", async () => {
      prisma.shortUrl.findUnique.mockResolvedValue({
        id: "url-id",
        originalUrl: "https://example.com",
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        resolveShortCode("Ab12Cd34"),
      ).resolves.toBeNull();
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
