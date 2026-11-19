
import { prisma } from "../lib/prisma.js";
import { hashToken } from "../utils/token.utils.js";

/**
 * Verifies an account using a single-use email verification token.
 *
 * Only the SHA-256 hash of the supplied token is queried.
 * The token is consumed atomically with the account verification update.
 */
export async function verifyEmailAddress(rawToken) {
  if (
    typeof rawToken !== "string" ||
    rawToken.length < 20 ||
    rawToken.length > 200
  ) {
    return { verified: false, reason: "INVALID_TOKEN" };
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const tokenRecord =
      await transaction.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
          user: {
            select: {
              emailVerifiedAt: true,
            },
          },
        },
      });

    if (!tokenRecord || tokenRecord.usedAt) {
      return { verified: false, reason: "INVALID_TOKEN" };
    }

    if (tokenRecord.expiresAt <= now) {
      return { verified: false, reason: "EXPIRED_TOKEN" };
    }

    const consumed =
      await transaction.emailVerificationToken.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          usedAt: now,
        },
      });

    // A concurrent request may already have consumed this token.
    if (consumed.count !== 1) {
      return { verified: false, reason: "INVALID_TOKEN" };
    }

    if (tokenRecord.user.emailVerifiedAt) {
      return {
        verified: true,
        reason: "ALREADY_VERIFIED",
      };
    }

    const updatedUser = await transaction.user.updateMany({
      where: {
        id: tokenRecord.userId,
        emailVerifiedAt: null,
      },
      data: {
        emailVerifiedAt: now,
      },
    });

    if (updatedUser.count !== 1) {
      return {
        verified: true,
        reason: "ALREADY_VERIFIED",
      };
    }

    return {
      verified: true,
      reason: "EMAIL_VERIFIED",
    };
  });
}
