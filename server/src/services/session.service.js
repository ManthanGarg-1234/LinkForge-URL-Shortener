
import { prisma } from "../lib/prisma.js";
import {
  createOpaqueToken,
  hashToken,
  createAccessToken,
} from "../utils/token.utils.js";
import {
  REFRESH_TOKEN_TTL_MS,
} from "../config/auth.js";

function getSafeMetadata(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }

  return value.slice(0, maxLength);
}

async function revokeSessionInTransaction(transaction, sessionId, now) {
  await transaction.session.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });

  await transaction.refreshToken.updateMany({
    where: {
      sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });
}

/**
 * Creates a new database-backed session.
 *
 * The raw refresh token is returned once to the caller.
 * Only its SHA-256 hash is persisted.
 */
export async function createSession({
  userId,
  userAgent,
  ipAddress,
}) {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("A valid userId is required.");
  }

  const now = new Date();
  const sessionExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

  const rawRefreshToken = createOpaqueToken();
  const refreshTokenHash = hashToken(rawRefreshToken);

  const session = await prisma.$transaction(async (transaction) => {
    const createdSession = await transaction.session.create({
      data: {
        userId,
        userAgent: getSafeMetadata(userAgent, 500),
        ipAddress: getSafeMetadata(ipAddress, 64),
        expiresAt: sessionExpiresAt,
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
      },
    });

    await transaction.refreshToken.create({
      data: {
        sessionId: createdSession.id,
        tokenHash: refreshTokenHash,
        expiresAt: sessionExpiresAt,
      },
    });

    return createdSession;
  });

  const accessToken = await createAccessToken({
    userId: session.userId,
    sessionId: session.id,
  });

  return {
    sessionId: session.id,
    accessToken,
    refreshToken: rawRefreshToken,
    expiresAt: session.expiresAt,
  };
}

/**
 * Rotates a refresh token.
 *
 * A successfully used refresh token is consumed exactly once.
 * Reuse of a consumed token revokes the entire session.
 */
export async function rotateRefreshToken(rawRefreshToken) {
  if (
    typeof rawRefreshToken !== "string" ||
    rawRefreshToken.length < 20 ||
    rawRefreshToken.length > 200
  ) {
    return {
      rotated: false,
      reason: "INVALID_TOKEN",
    };
  }

  const now = new Date();
  const oldTokenHash = hashToken(rawRefreshToken);

  const rotation = await prisma.$transaction(async (transaction) => {
    const tokenRecord = await transaction.refreshToken.findUnique({
      where: {
        tokenHash: oldTokenHash,
      },
      select: {
        id: true,
        sessionId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        session: {
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      return {
        rotated: false,
        reason: "INVALID_TOKEN",
      };
    }

    const session = tokenRecord.session;

    if (tokenRecord.usedAt) {
      await revokeSessionInTransaction(
        transaction,
        session.id,
        now
      );

      return {
        rotated: false,
        reason: "TOKEN_REUSE_DETECTED",
      };
    }

    if (
      tokenRecord.revokedAt ||
      session.revokedAt ||
      tokenRecord.expiresAt <= now ||
      session.expiresAt <= now
    ) {
      return {
        rotated: false,
        reason: "INVALID_TOKEN",
      };
    }

    const consumed = await transaction.refreshToken.updateMany({
      where: {
        id: tokenRecord.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        usedAt: now,
      },
    });

    if (consumed.count !== 1) {
      // Another request may have consumed this token concurrently.
      await revokeSessionInTransaction(
        transaction,
        session.id,
        now
      );

      return {
        rotated: false,
        reason: "TOKEN_REUSE_DETECTED",
      };
    }

    const nextRefreshExpiresAt = new Date(
      Math.min(
        now.getTime() + REFRESH_TOKEN_TTL_MS,
        session.expiresAt.getTime()
      )
    );

    if (nextRefreshExpiresAt <= now) {
      await revokeSessionInTransaction(
        transaction,
        session.id,
        now
      );

      return {
        rotated: false,
        reason: "INVALID_TOKEN",
      };
    }

    const nextRawRefreshToken = createOpaqueToken();

    await transaction.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: hashToken(nextRawRefreshToken),
        expiresAt: nextRefreshExpiresAt,
      },
    });

    await transaction.session.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: {
        lastSeenAt: now,
      },
    });

    return {
      rotated: true,
      userId: session.userId,
      sessionId: session.id,
      refreshToken: nextRawRefreshToken,
    };
  });

  if (!rotation.rotated) {
    return rotation;
  }

  const accessToken = await createAccessToken({
    userId: rotation.userId,
    sessionId: rotation.sessionId,
  });

  return {
    rotated: true,
    sessionId: rotation.sessionId,
    accessToken,
    refreshToken: rotation.refreshToken,
  };
}

/**
 * Revokes a session belonging to the specified user.
 */
export async function revokeSession({ sessionId, userId }) {
  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    typeof userId !== "string" ||
    userId.length === 0
  ) {
    throw new TypeError("Valid sessionId and userId are required.");
  }

  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const result = await transaction.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    if (result.count === 0) {
      return {
        revoked: false,
      };
    }

    await transaction.refreshToken.updateMany({
      where: {
        sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    return {
      revoked: true,
    };
  });
}
