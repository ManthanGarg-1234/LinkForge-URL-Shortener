
import { prisma } from "../lib/prisma.js";
import { invalidateShortUrlCache } from "./url.service.js";

const MODERATED_URL_SELECT = {
  id: true,
  shortCode: true,
  originalUrl: true,
  isActive: true,
  expiresAt: true,
  moderationStatus: true,
  moderatedAt: true,
  moderationReason: true,
  moderatedByAdminId: true,
  updatedAt: true,
};

function createModerationError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function blockShortUrl({
  shortCode,
  adminUserId,
  reason,
  ipAddress,
  userAgent,
}) {
  if (!shortCode || !adminUserId || !reason) {
    throw new TypeError(
      "Short code, administrator ID, and blocking reason are required.",
    );
  }

  const blockedUrl = await prisma.$transaction(async (transaction) => {
    const existingUrl = await transaction.shortUrl.findUnique({
      where: { shortCode },
      select: {
        id: true,
        shortCode: true,
        moderationStatus: true,
        isActive: true,
      },
    });

    if (!existingUrl) {
      throw createModerationError(
        404,
        "SHORT_URL_NOT_FOUND",
        "The requested short URL does not exist.",
      );
    }

    if (existingUrl.moderationStatus === "BLOCKED") {
      throw createModerationError(
        409,
        "SHORT_URL_ALREADY_BLOCKED",
        "This short URL is already blocked.",
      );
    }

    const updateResult = await transaction.shortUrl.updateMany({
      where: {
        id: existingUrl.id,
        moderationStatus: "APPROVED",
      },
      data: {
        moderationStatus: "BLOCKED",
        moderatedAt: new Date(),
        moderationReason: reason,
        moderatedByAdminId: adminUserId,
      },
    });

    if (updateResult.count !== 1) {
      throw createModerationError(
        409,
        "SHORT_URL_MODERATION_CONFLICT",
        "The URL moderation state changed. Refresh and try again.",
      );
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: "SHORT_URL_BLOCKED",
        entityType: "SHORT_URL",
        entityId: existingUrl.id,
        metadata: {
          shortCode,
          reason,
          previousModerationStatus: "APPROVED",
          newModerationStatus: "BLOCKED",
          ownerActivationStatePreserved: existingUrl.isActive,
        },
        ipAddress: ipAddress?.slice(0, 64) || null,
        userAgent: userAgent?.slice(0, 500) || null,
      },
    });

    return transaction.shortUrl.findUnique({
      where: { id: existingUrl.id },
      select: MODERATED_URL_SELECT,
    });
  });

  // Run only after the database transaction commits.
  // The redirect resolver independently verifies PostgreSQL state
  // if Redis invalidation is unavailable or fails.
  await invalidateShortUrlCache(shortCode);

  return blockedUrl;
}

export async function restoreShortUrl({
  shortCode,
  adminUserId,
  ipAddress,
  userAgent,
}) {
  if (!shortCode || !adminUserId) {
    throw new TypeError(
      "Short code and administrator ID are required.",
    );
  }

  const restoredUrl = await prisma.$transaction(async (transaction) => {
    const existingUrl = await transaction.shortUrl.findUnique({
      where: { shortCode },
      select: {
        id: true,
        shortCode: true,
        moderationStatus: true,
        isActive: true,
        moderationReason: true,
      },
    });

    if (!existingUrl) {
      throw createModerationError(
        404,
        "SHORT_URL_NOT_FOUND",
        "The requested short URL does not exist.",
      );
    }

    if (existingUrl.moderationStatus !== "BLOCKED") {
      throw createModerationError(
        409,
        "SHORT_URL_NOT_BLOCKED",
        "This short URL is not currently blocked.",
      );
    }

    const updateResult = await transaction.shortUrl.updateMany({
      where: {
        id: existingUrl.id,
        moderationStatus: "BLOCKED",
      },
      data: {
        moderationStatus: "APPROVED",
        moderatedAt: null,
        moderationReason: null,
        moderatedByAdminId: null,
      },
    });

    if (updateResult.count !== 1) {
      throw createModerationError(
        409,
        "SHORT_URL_MODERATION_CONFLICT",
        "The URL moderation state changed. Refresh and try again.",
      );
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: "SHORT_URL_RESTORED",
        entityType: "SHORT_URL",
        entityId: existingUrl.id,
        metadata: {
          shortCode,
          previousModerationStatus: "BLOCKED",
          newModerationStatus: "APPROVED",
          previousModerationReason: existingUrl.moderationReason,
          ownerActivationStatePreserved: existingUrl.isActive,
        },
        ipAddress: ipAddress?.slice(0, 64) || null,
        userAgent: userAgent?.slice(0, 500) || null,
      },
    });

    return transaction.shortUrl.findUnique({
      where: { id: existingUrl.id },
      select: MODERATED_URL_SELECT,
    });
  });

  await invalidateShortUrlCache(shortCode);

  return restoredUrl;
}
