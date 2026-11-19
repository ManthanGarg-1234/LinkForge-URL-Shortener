
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../utils/password.utils.js";
import {
  createOpaqueToken,
  hashToken,
} from "../utils/token.utils.js";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function requestPasswordReset(email) {
  if (typeof email !== "string" || email.length === 0) {
    throw new TypeError("A valid email address is required.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
    },
  });

  // Do not reveal account existence to the HTTP caller.
  if (!user || user.status !== "ACTIVE") {
    return {
      requested: false,
      resetToken: null,
      user: null,
    };
  }

  const rawToken = createOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);

  await prisma.$transaction(async (transaction) => {
    // Invalidate any earlier outstanding reset links.
    await transaction.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    await transaction.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  return {
    requested: true,
    resetToken: rawToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
}

export async function resetPassword(rawToken, newPassword) {
  if (
    typeof rawToken !== "string" ||
    rawToken.length < 20 ||
    rawToken.length > 200
  ) {
    return {
      reset: false,
      reason: "INVALID_TOKEN",
    };
  }

  // Validate and hash before opening the transaction.
  // The token is consumed atomically inside the transaction.
    const tokenHash = hashToken(rawToken);
  const now = new Date();

  const existingToken =
    await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        usedAt: true,
      },
    });

  if (!existingToken || existingToken.usedAt) {
    return {
      reset: false,
      reason: "INVALID_TOKEN",
    };
  }

  if (existingToken.expiresAt <= now) {
    return {
      reset: false,
      reason: "EXPIRED_TOKEN",
    };
  }

  const newPasswordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (transaction) => {
    const tokenRecord =
      await transaction.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
        },
      });

    if (!tokenRecord || tokenRecord.usedAt) {
      return {
        reset: false,
        reason: "INVALID_TOKEN",
      };
    }

    if (tokenRecord.expiresAt <= now) {
      return {
        reset: false,
        reason: "EXPIRED_TOKEN",
      };
    }

    const consumed =
      await transaction.passwordResetToken.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          usedAt: now,
        },
      });

    if (consumed.count !== 1) {
      return {
        reset: false,
        reason: "INVALID_TOKEN",
      };
    }

    await transaction.user.update({
      where: {
        id: tokenRecord.userId,
      },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    // Revoke every active session belonging to this user.
    await transaction.session.updateMany({
      where: {
        userId: tokenRecord.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    // Also revoke all outstanding refresh tokens for those sessions.
    await transaction.refreshToken.updateMany({
      where: {
        session: {
          userId: tokenRecord.userId,
        },
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    // Invalidate every other outstanding reset token for this user.
    await transaction.passwordResetToken.updateMany({
      where: {
        userId: tokenRecord.userId,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    return {
      reset: true,
      reason: "PASSWORD_RESET",
    };
  });
}
