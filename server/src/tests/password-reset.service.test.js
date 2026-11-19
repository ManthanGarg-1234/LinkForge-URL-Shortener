
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  transactionMock,
  hashPasswordMock,
} = vi.hoisted(() => {
  const transaction = {
    passwordResetToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    session: {
      updateMany: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn(),
    },
  };

  return {
    prismaMock: {
      user: {
        findUnique: vi.fn(),
      },
      passwordResetToken: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    transactionMock: transaction,
    hashPasswordMock: vi.fn(),
  };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../utils/password.utils.js", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    hashPassword: hashPasswordMock,
  };
});

import {
  requestPasswordReset,
  resetPassword,
} from "../services/password-reset.service.js";

const rawToken = "password-reset-token-12345678901234567890";

const activeUser = {
  id: "user-123",
  email: "user@example.com",
  name: "Test User",
  status: "ACTIVE",
};

const validTokenRecord = {
  id: "reset-token-123",
  userId: "user-123",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  usedAt: null,
};

describe("Password reset service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(transactionMock)
    );

    prismaMock.user.findUnique.mockResolvedValue(activeUser);

    transactionMock.passwordResetToken.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionMock.passwordResetToken.create.mockResolvedValue({
      id: "reset-token-123",
    });

    prismaMock.passwordResetToken.findUnique.mockResolvedValue(
      validTokenRecord
    );

    transactionMock.passwordResetToken.findUnique.mockResolvedValue(
      validTokenRecord
    );

    transactionMock.passwordResetToken.updateMany.mockResolvedValue({
      count: 1,
    });

    transactionMock.user.update.mockResolvedValue({
      id: "user-123",
    });

    transactionMock.session.updateMany.mockResolvedValue({
      count: 2,
    });

    transactionMock.refreshToken.updateMany.mockResolvedValue({
      count: 2,
    });

    hashPasswordMock.mockResolvedValue("argon2id-new-password-hash");
  });

  describe("requestPasswordReset", () => {
    it("should create a hashed reset token for an active user", async () => {
      const result = await requestPasswordReset("USER@example.com");

      expect(result.requested).toBe(true);
      expect(result.user).toEqual({
        id: "user-123",
        email: "user@example.com",
        name: "Test User",
      });

      expect(result.resetToken).toEqual(expect.any(String));
      expect(result.resetToken).not.toBe("");

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: {
          email: "user@example.com",
        },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      });

      expect(
        transactionMock.passwordResetToken.create
      ).toHaveBeenCalledTimes(1);

      const createArguments =
        transactionMock.passwordResetToken.create.mock.calls[0][0];

      expect(createArguments.data.userId).toBe("user-123");
      expect(createArguments.data.tokenHash).not.toBe(result.resetToken);
      expect(createArguments.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createArguments.data.expiresAt.getTime()).toBeGreaterThan(
        Date.now()
      );
    });

    it("should invalidate previous unused reset tokens", async () => {
      await requestPasswordReset("user@example.com");

      expect(
        transactionMock.passwordResetToken.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-123",
            usedAt: null,
          },
          data: {
            usedAt: expect.any(Date),
          },
        })
      );
    });

    it("should not create a token for an unknown user", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await requestPasswordReset("unknown@example.com");

      expect(result).toEqual({
        requested: false,
        resetToken: null,
        user: null,
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("should not create a token for a suspended user", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: "SUSPENDED",
      });

      const result = await requestPasswordReset("user@example.com");

      expect(result.requested).toBe(false);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("should reject an invalid email argument", async () => {
      await expect(requestPasswordReset("")).rejects.toThrow(
        "A valid email address is required."
      );

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("should update the password and revoke existing sessions", async () => {
      const result = await resetPassword(
        rawToken,
        "NewStrongPassword123!"
      );

      expect(result).toEqual({
        reset: true,
        reason: "PASSWORD_RESET",
      });

      expect(hashPasswordMock).toHaveBeenCalledWith(
        "NewStrongPassword123!"
      );

      expect(transactionMock.user.update).toHaveBeenCalledWith({
        where: {
          id: "user-123",
        },
        data: {
          passwordHash: "argon2id-new-password-hash",
        },
      });

      expect(
        transactionMock.session.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-123",
            revokedAt: null,
          },
          data: {
            revokedAt: expect.any(Date),
          },
        })
      );

      expect(
        transactionMock.refreshToken.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            session: {
              userId: "user-123",
            },
            revokedAt: null,
          },
          data: {
            revokedAt: expect.any(Date),
          },
        })
      );
    });

    it("should invalidate all other unused reset tokens", async () => {
      await resetPassword(rawToken, "NewStrongPassword123!");

      expect(
        transactionMock.passwordResetToken.updateMany
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-123",
            usedAt: null,
          },
          data: {
            usedAt: expect.any(Date),
          },
        })
      );
    });

    it("should reject a malformed token without querying the database", async () => {
      const result = await resetPassword("short", "NewStrongPassword123!");

      expect(result).toEqual({
        reset: false,
        reason: "INVALID_TOKEN",
      });

      expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled();
      expect(hashPasswordMock).not.toHaveBeenCalled();
    });

    it("should reject an unknown token without hashing the new password", async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

      const result = await resetPassword(
        rawToken,
        "NewStrongPassword123!"
      );

      expect(result).toEqual({
        reset: false,
        reason: "INVALID_TOKEN",
      });

      expect(hashPasswordMock).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("should reject an already-used token", async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        ...validTokenRecord,
        usedAt: new Date(),
      });

      const result = await resetPassword(
        rawToken,
        "NewStrongPassword123!"
      );

      expect(result).toEqual({
        reset: false,
        reason: "INVALID_TOKEN",
      });

      expect(hashPasswordMock).not.toHaveBeenCalled();
    });

    it("should reject an expired token", async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        ...validTokenRecord,
        expiresAt: new Date(Date.now() - 60_000),
      });

      const result = await resetPassword(
        rawToken,
        "NewStrongPassword123!"
      );

      expect(result).toEqual({
        reset: false,
        reason: "EXPIRED_TOKEN",
      });

      expect(hashPasswordMock).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("should reject a token consumed by another concurrent request", async () => {
      transactionMock.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await resetPassword(
        rawToken,
        "NewStrongPassword123!"
      );

      expect(result).toEqual({
        reset: false,
        reason: "INVALID_TOKEN",
      });

      expect(transactionMock.user.update).not.toHaveBeenCalled();
      expect(transactionMock.session.updateMany).not.toHaveBeenCalled();
      expect(
        transactionMock.refreshToken.updateMany
      ).not.toHaveBeenCalled();
    });
  });
});
