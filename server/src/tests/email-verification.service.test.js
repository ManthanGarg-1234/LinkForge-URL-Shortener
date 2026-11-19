
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpaqueToken, hashToken } from "../utils/token.utils.js";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import { verifyEmailAddress } from "../services/email-verification.service.js";

const token = createOpaqueToken();

const tokenRecord = {
  id: "verification-123",
  userId: "user-123",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  usedAt: null,
  user: {
    emailVerifiedAt: null,
  },
};

const transactionMock = {
  emailVerificationToken: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    updateMany: vi.fn(),
  },
};

describe("Email verification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transactionMock.emailVerificationToken.findUnique.mockResolvedValue({
      ...tokenRecord,
      user: { ...tokenRecord.user },
    });

    transactionMock.emailVerificationToken.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionMock.user.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.$transaction.mockImplementation(async (callback) => {
      return callback(transactionMock);
    });
  });

  it("should verify an unverified account", async () => {
    const result = await verifyEmailAddress(token);

    expect(result).toEqual({
      verified: true,
      reason: "EMAIL_VERIFIED",
    });

    expect(transactionMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-123",
          emailVerifiedAt: null,
        },
      })
    );
  });

  it("should look up the token using its SHA-256 hash", async () => {
    await verifyEmailAddress(token);

    expect(
      transactionMock.emailVerificationToken.findUnique
    ).toHaveBeenCalledWith({
      where: {
        tokenHash: hashToken(token),
      },
      select: expect.any(Object),
    });
  });

  it("should reject an invalid token", async () => {
    transactionMock.emailVerificationToken.findUnique.mockResolvedValue(null);

    const result = await verifyEmailAddress(token);

    expect(result).toEqual({
      verified: false,
      reason: "INVALID_TOKEN",
    });

    expect(
      transactionMock.emailVerificationToken.updateMany
    ).not.toHaveBeenCalled();
  });

  it("should reject an already-used token", async () => {
    transactionMock.emailVerificationToken.findUnique.mockResolvedValue({
      ...tokenRecord,
      usedAt: new Date(),
    });

    const result = await verifyEmailAddress(token);

    expect(result).toEqual({
      verified: false,
      reason: "INVALID_TOKEN",
    });
  });

  it("should reject an expired token", async () => {
    transactionMock.emailVerificationToken.findUnique.mockResolvedValue({
      ...tokenRecord,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await verifyEmailAddress(token);

    expect(result).toEqual({
      verified: false,
      reason: "EXPIRED_TOKEN",
    });

    expect(
      transactionMock.emailVerificationToken.updateMany
    ).not.toHaveBeenCalled();
  });

  it("should reject malformed token input", async () => {
    const result = await verifyEmailAddress("");

    expect(result).toEqual({
      verified: false,
      reason: "INVALID_TOKEN",
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("should reject a token consumed by a concurrent request", async () => {
    transactionMock.emailVerificationToken.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await verifyEmailAddress(token);

    expect(result).toEqual({
      verified: false,
      reason: "INVALID_TOKEN",
    });

    expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("should not re-verify an already-verified account", async () => {
    transactionMock.emailVerificationToken.findUnique.mockResolvedValue({
      ...tokenRecord,
      user: {
        emailVerifiedAt: new Date(),
      },
    });

    const result = await verifyEmailAddress(token);

    expect(result).toEqual({
      verified: true,
      reason: "ALREADY_VERIFIED",
    });

    expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("should propagate unexpected database errors", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Error("Database unavailable")
    );

    await expect(verifyEmailAddress(token)).rejects.toThrow(
      "Database unavailable"
    );
  });
});
