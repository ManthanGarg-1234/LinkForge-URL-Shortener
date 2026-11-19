
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transactionMock,
  prismaMock,
  invalidateShortUrlCacheMock,
} = vi.hoisted(() => {
  const transactionMock = {
    shortUrl: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    transactionMock,
    prismaMock: {
      $transaction: vi.fn(),
    },
    invalidateShortUrlCacheMock: vi.fn(),
  };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../services/url.service.js", () => ({
  invalidateShortUrlCache: invalidateShortUrlCacheMock,
}));

import {
  blockShortUrl,
  restoreShortUrl,
} from "../services/admin-url-moderation.service.js";

const SHORT_CODE = "Ab12Cd34";
const URL_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const activeApprovedUrl = {
  id: URL_ID,
  shortCode: SHORT_CODE,
  moderationStatus: "APPROVED",
  isActive: true,
};

const blockedUrl = {
  id: URL_ID,
  shortCode: SHORT_CODE,
  moderationStatus: "BLOCKED",
  isActive: true,
  moderationReason: "Confirmed phishing destination.",
};

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.$transaction.mockImplementation(async (callback) => {
    return callback(transactionMock);
  });

  transactionMock.shortUrl.findUnique
    .mockResolvedValueOnce(activeApprovedUrl)
    .mockResolvedValueOnce({
      ...activeApprovedUrl,
      moderationStatus: "BLOCKED",
    });

  transactionMock.shortUrl.updateMany.mockResolvedValue({
    count: 1,
  });

  transactionMock.auditLog.create.mockResolvedValue({
    id: "audit-1",
  });

  invalidateShortUrlCacheMock.mockResolvedValue(undefined);
});

describe("Admin URL moderation service", () => {
  describe("blockShortUrl", () => {
    it("blocks an approved URL and records an audit log", async () => {
      const blockedRecord = {
        id: URL_ID,
        shortCode: SHORT_CODE,
        originalUrl: "https://example.com",
        isActive: true,
        moderationStatus: "BLOCKED",
        moderatedAt: new Date(),
        moderationReason: "Confirmed phishing destination.",
        moderatedByAdminId: ADMIN_ID,
      };

      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(activeApprovedUrl)
        .mockResolvedValueOnce(blockedRecord);

      const result = await blockShortUrl({
        shortCode: SHORT_CODE,
        adminUserId: ADMIN_ID,
        reason: "Confirmed phishing destination.",
        ipAddress: "192.0.2.10",
        userAgent: "Test browser",
      });

      expect(result).toEqual(blockedRecord);

      expect(transactionMock.shortUrl.updateMany).toHaveBeenCalledWith({
        where: {
          id: URL_ID,
          moderationStatus: "APPROVED",
        },
        data: expect.objectContaining({
          moderationStatus: "BLOCKED",
          moderatedAt: expect.any(Date),
          moderationReason: "Confirmed phishing destination.",
          moderatedByAdminId: ADMIN_ID,
        }),
      });

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: ADMIN_ID,
          action: "SHORT_URL_BLOCKED",
          entityType: "SHORT_URL",
          entityId: URL_ID,
          metadata: {
            shortCode: SHORT_CODE,
            reason: "Confirmed phishing destination.",
            previousModerationStatus: "APPROVED",
            newModerationStatus: "BLOCKED",
            ownerActivationStatePreserved: true,
          },
          ipAddress: "192.0.2.10",
          userAgent: "Test browser",
        }),
      });

      expect(invalidateShortUrlCacheMock).toHaveBeenCalledWith(
        SHORT_CODE,
      );
    });

    it("preserves an owner-disabled URL while blocking it", async () => {
      const ownerDisabledUrl = {
        ...activeApprovedUrl,
        isActive: false,
      };

      const blockedRecord = {
        ...ownerDisabledUrl,
        moderationStatus: "BLOCKED",
      };

      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(ownerDisabledUrl)
        .mockResolvedValueOnce(blockedRecord);

      const result = await blockShortUrl({
        shortCode: SHORT_CODE,
        adminUserId: ADMIN_ID,
        reason: "Malicious destination confirmed.",
      });

      expect(result.isActive).toBe(false);
      expect(result.moderationStatus).toBe("BLOCKED");

      expect(transactionMock.shortUrl.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            isActive: expect.anything(),
          }),
        }),
      );

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              ownerActivationStatePreserved: false,
            }),
          }),
        }),
      );
    });

    it("returns 404 when the short URL does not exist", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValue(null);

      await expect(
        blockShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
          reason: "Confirmed malicious destination.",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "SHORT_URL_NOT_FOUND",
      });

      expect(transactionMock.shortUrl.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("rejects an URL that is already blocked", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValue({
          ...activeApprovedUrl,
          moderationStatus: "BLOCKED",
        });

      await expect(
        blockShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
          reason: "Confirmed malicious destination.",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "SHORT_URL_ALREADY_BLOCKED",
      });

      expect(transactionMock.shortUrl.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("rejects a concurrent moderation state change", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(activeApprovedUrl);

      transactionMock.shortUrl.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        blockShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
          reason: "Confirmed malicious destination.",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "SHORT_URL_MODERATION_CONFLICT",
      });

      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("does not invalidate cache if the audit log fails", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(activeApprovedUrl);

      const auditError = new Error("Audit database failure");

      transactionMock.auditLog.create.mockRejectedValue(auditError);

      await expect(
        blockShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
          reason: "Confirmed malicious destination.",
        }),
      ).rejects.toBe(auditError);

      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("rejects missing required arguments", async () => {
      await expect(
        blockShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toThrow(
        "Short code, administrator ID, and blocking reason are required.",
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("restoreShortUrl", () => {
    it("restores a blocked URL and records an audit log", async () => {
      const restoredRecord = {
        id: URL_ID,
        shortCode: SHORT_CODE,
        originalUrl: "https://example.com",
        isActive: true,
        moderationStatus: "APPROVED",
        moderatedAt: null,
        moderationReason: null,
        moderatedByAdminId: null,
      };

      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(blockedUrl)
        .mockResolvedValueOnce(restoredRecord);

      const result = await restoreShortUrl({
        shortCode: SHORT_CODE,
        adminUserId: ADMIN_ID,
        ipAddress: "192.0.2.10",
        userAgent: "Test browser",
      });

      expect(result).toEqual(restoredRecord);

      expect(transactionMock.shortUrl.updateMany).toHaveBeenCalledWith({
        where: {
          id: URL_ID,
          moderationStatus: "BLOCKED",
        },
        data: {
          moderationStatus: "APPROVED",
          moderatedAt: null,
          moderationReason: null,
          moderatedByAdminId: null,
        },
      });

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: ADMIN_ID,
          action: "SHORT_URL_RESTORED",
          entityType: "SHORT_URL",
          entityId: URL_ID,
          metadata: {
            shortCode: SHORT_CODE,
            previousModerationStatus: "BLOCKED",
            newModerationStatus: "APPROVED",
            previousModerationReason:
              "Confirmed phishing destination.",
            ownerActivationStatePreserved: true,
          },
          ipAddress: "192.0.2.10",
          userAgent: "Test browser",
        }),
      });

      expect(invalidateShortUrlCacheMock).toHaveBeenCalledWith(
        SHORT_CODE,
      );
    });

    it("does not reactivate a URL disabled by its owner", async () => {
      const ownerDisabledBlockedUrl = {
        ...blockedUrl,
        isActive: false,
      };

      const restoredRecord = {
        ...ownerDisabledBlockedUrl,
        moderationStatus: "APPROVED",
        moderatedAt: null,
        moderationReason: null,
        moderatedByAdminId: null,
      };

      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(ownerDisabledBlockedUrl)
        .mockResolvedValueOnce(restoredRecord);

      const result = await restoreShortUrl({
        shortCode: SHORT_CODE,
        adminUserId: ADMIN_ID,
      });

      expect(result.isActive).toBe(false);
      expect(result.moderationStatus).toBe("APPROVED");

      expect(transactionMock.shortUrl.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            isActive: expect.anything(),
          }),
        }),
      );

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              ownerActivationStatePreserved: false,
            }),
          }),
        }),
      );
    });

    it("returns 404 when the short URL does not exist", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValue(null);

      await expect(
        restoreShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "SHORT_URL_NOT_FOUND",
      });

      expect(transactionMock.shortUrl.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("rejects restoring a URL that is not blocked", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValue(activeApprovedUrl);

      await expect(
        restoreShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "SHORT_URL_NOT_BLOCKED",
      });

      expect(transactionMock.shortUrl.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("rejects a concurrent moderation state change", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(blockedUrl);

      transactionMock.shortUrl.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        restoreShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "SHORT_URL_MODERATION_CONFLICT",
      });

      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("does not invalidate cache if the audit log fails", async () => {
      transactionMock.shortUrl.findUnique
        .mockReset()
        .mockResolvedValueOnce(blockedUrl);

      const auditError = new Error("Audit database failure");

      transactionMock.auditLog.create.mockRejectedValue(auditError);

      await expect(
        restoreShortUrl({
          shortCode: SHORT_CODE,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toBe(auditError);

      expect(invalidateShortUrlCacheMock).not.toHaveBeenCalled();
    });

    it("rejects missing required arguments", async () => {
      await expect(
        restoreShortUrl({
          shortCode: SHORT_CODE,
        }),
      ).rejects.toThrow(
        "Short code and administrator ID are required.",
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
