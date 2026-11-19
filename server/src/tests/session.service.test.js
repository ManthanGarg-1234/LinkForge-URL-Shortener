
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  createSession,
  rotateRefreshToken,
  revokeSession,
} from "../services/session.service.js";

import { hashToken } from "../utils/token.utils.js";

const sessionRecord = {
  id: "session-123",
  userId: "user-123",
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
};

const validRefreshToken = "valid-refresh-token-for-testing-123456";

const refreshTokenRecord = {
  id: "refresh-123",
  sessionId: sessionRecord.id,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  usedAt: null,
  revokedAt: null,
  session: {
    id: sessionRecord.id,
    userId: sessionRecord.userId,
    expiresAt: sessionRecord.expiresAt,
    revokedAt: null,
  },
};

const transactionMock = {
  session: {
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
};

describe("Authentication session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transactionMock.session.create.mockResolvedValue(sessionRecord);
    transactionMock.session.updateMany.mockResolvedValue({ count: 1 });

    transactionMock.refreshToken.create.mockResolvedValue({
      id: "refresh-new",
    });

    transactionMock.refreshToken.findUnique.mockResolvedValue({
      ...refreshTokenRecord,
      session: { ...refreshTokenRecord.session },
    });

    transactionMock.refreshToken.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.$transaction.mockImplementation(async (callback) => {
      return callback(transactionMock);
    });
  });

  describe("createSession", () => {
    it("should create a session and return authentication tokens", async () => {
      const result = await createSession({
        userId: "user-123",
        userAgent: "Test browser",
        ipAddress: "127.0.0.1",
      });

      expect(result.sessionId).toBe("session-123");
      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBeGreaterThan(20);
    });

    it("should store only the refresh-token hash", async () => {
      const result = await createSession({
        userId: "user-123",
      });

      const storedToken =
        transactionMock.refreshToken.create.mock.calls[0][0];

      expect(storedToken.data.tokenHash).toBe(
        hashToken(result.refreshToken)
      );

      expect(storedToken.data.tokenHash).not.toBe(result.refreshToken);
    });

    it("should reject an invalid user ID", async () => {
      await expect(
        createSession({
          userId: "",
        })
      ).rejects.toThrow("A valid userId is required.");

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("rotateRefreshToken", () => {
    it("should rotate a valid refresh token", async () => {
      const result = await rotateRefreshToken(validRefreshToken);

      expect(result.rotated).toBe(true);
      expect(result.sessionId).toBe("session-123");
      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");

      expect(result.refreshToken).not.toBe(validRefreshToken);
    });

    it("should look up refresh tokens by their SHA-256 hash", async () => {
      await rotateRefreshToken(validRefreshToken);

      expect(
        transactionMock.refreshToken.findUnique
      ).toHaveBeenCalledWith({
        where: {
          tokenHash: hashToken(validRefreshToken),
        },
        select: expect.any(Object),
      });
    });

    it("should reject an unknown refresh token", async () => {
      transactionMock.refreshToken.findUnique.mockResolvedValue(null);

      const result = await rotateRefreshToken(validRefreshToken);

      expect(result).toEqual({
        rotated: false,
        reason: "INVALID_TOKEN",
      });
    });

    it("should revoke the session when a used token is reused", async () => {
      transactionMock.refreshToken.findUnique.mockResolvedValue({
        ...refreshTokenRecord,
        usedAt: new Date(),
      });

      const result = await rotateRefreshToken(validRefreshToken);

      expect(result).toEqual({
        rotated: false,
        reason: "TOKEN_REUSE_DETECTED",
      });

      expect(transactionMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "session-123",
            revokedAt: null,
          },
        })
      );

      expect(transactionMock.refreshToken.updateMany).toHaveBeenCalled();
    });

    it("should reject a revoked session", async () => {
      transactionMock.refreshToken.findUnique.mockResolvedValue({
        ...refreshTokenRecord,
        session: {
          ...refreshTokenRecord.session,
          revokedAt: new Date(),
        },
      });

      const result = await rotateRefreshToken(validRefreshToken);

      expect(result).toEqual({
        rotated: false,
        reason: "INVALID_TOKEN",
      });

      expect(
        transactionMock.refreshToken.create
      ).not.toHaveBeenCalled();
    });

    it("should reject an expired refresh token", async () => {
      transactionMock.refreshToken.findUnique.mockResolvedValue({
        ...refreshTokenRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await rotateRefreshToken(validRefreshToken);

      expect(result).toEqual({
        rotated: false,
        reason: "INVALID_TOKEN",
      });
    });

    it("should reject malformed refresh-token input", async () => {
      const result = await rotateRefreshToken("");

      expect(result).toEqual({
        rotated: false,
        reason: "INVALID_TOKEN",
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("should detect a token consumed by a concurrent request", async () => {
      transactionMock.refreshToken.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await rotateRefreshToken(validRefreshToken);

      expect(result).toEqual({
        rotated: false,
        reason: "TOKEN_REUSE_DETECTED",
      });

      expect(transactionMock.session.updateMany).toHaveBeenCalled();
    });
  });

  describe("revokeSession", () => {
    it("should revoke a session and its refresh tokens", async () => {
      const result = await revokeSession({
        sessionId: "session-123",
        userId: "user-123",
      });

      expect(result).toEqual({
        revoked: true,
      });

      expect(transactionMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "session-123",
            userId: "user-123",
            revokedAt: null,
          },
        })
      );

      expect(transactionMock.refreshToken.updateMany).toHaveBeenCalled();
    });

    it("should return false when the session does not belong to the user or is already revoked", async () => {
      transactionMock.session.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await revokeSession({
        sessionId: "session-123",
        userId: "another-user",
      });

      expect(result).toEqual({
        revoked: false,
      });

      expect(
        transactionMock.refreshToken.updateMany
      ).not.toHaveBeenCalled();
    });

    it("should reject missing session or user identifiers", async () => {
      await expect(
        revokeSession({
          sessionId: "",
          userId: "user-123",
        })
      ).rejects.toThrow(
        "Valid sessionId and userId are required."
      );
    });
  });
});
