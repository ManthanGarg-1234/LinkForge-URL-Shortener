import { prisma } from "../lib/prisma.js";

const RECENT_ITEMS_LIMIT = 8;

function createAdminError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getSevenDaysAgo() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return date;
}

function getSafeUserSelect() {
  return {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    emailVerifiedAt: true,
    suspendedAt: true,
    suspensionReason: true,
    createdAt: true,
    updatedAt: true,
  };
}

export async function getAdminDashboardOverview() {
  const sevenDaysAgo = getSevenDaysAgo();

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    verifiedUsers,
    newUsersLast7Days,
    totalShortUrls,
    activeShortUrls,
    blockedShortUrls,
    totalClicks,
    pendingReports,
    openSecurityEvents,
    recentUsers,
    recentReports,
    recentSecurityEvents,
  ] = await Promise.all([
    prisma.user.count(),

    prisma.user.count({
      where: { status: "ACTIVE" },
    }),

    prisma.user.count({
      where: { status: "SUSPENDED" },
    }),

    prisma.user.count({
      where: {
        emailVerifiedAt: { not: null },
      },
    }),

    prisma.user.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    }),

    prisma.shortUrl.count(),

    prisma.shortUrl.count({
      where: {
        isActive: true,
        moderationStatus: "APPROVED",
      },
    }),

    prisma.shortUrl.count({
      where: { moderationStatus: "BLOCKED" },
    }),

    prisma.clickEvent.count(),

    prisma.abuseReport.count({
      where: { status: "PENDING" },
    }),

    prisma.securityEvent.count({
      where: { status: "OPEN" },
    }),

    prisma.user.findMany({
      take: RECENT_ITEMS_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    }),

    prisma.abuseReport.findMany({
      take: RECENT_ITEMS_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        shortCode: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    }),

    prisma.securityEvent.findMany({
      take: RECENT_ITEMS_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        eventType: true,
        severity: true,
        status: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    summary: {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        verified: verifiedUsers,
        newLast7Days: newUsersLast7Days,
      },
      urls: {
        total: totalShortUrls,
        active: activeShortUrls,
        blocked: blockedShortUrls,
      },
      clicks: {
        total: totalClicks,
      },
      moderation: {
        pendingReports,
      },
      security: {
        openEvents: openSecurityEvents,
      },
    },
    recentUsers,
    recentReports,
    recentSecurityEvents,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Lists users with pagination and optional filters.
 */
export async function getAdminUsers({
  page,
  limit,
  role,
  status,
  search,
}) {
  const where = {};

  if (role) {
    where.role = role;
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const skip = (page - 1) * limit;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),

    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
      select: getSafeUserSelect(),
    }),
  ]);

  return {
    items: users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Retrieves one user without exposing credentials or tokens.
 */
export async function getAdminUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...getSafeUserSelect(),
      _count: {
        select: {
          sessions: true,
          shortUrls: true,
        },
      },
    },
  });

  if (!user) {
    throw createAdminError(
      404,
      "USER_NOT_FOUND",
      "The requested user does not exist.",
    );
  }

  return user;
}

/**
 * Suspends a normal user and revokes all of their sessions
 * and refresh tokens atomically.
 */
export async function suspendAdminManagedUser({
  targetUserId,
  adminUserId,
  reason,
  ipAddress,
  userAgent,
}) {
  if (targetUserId === adminUserId) {
    throw createAdminError(
      400,
      "SELF_SUSPENSION_NOT_ALLOWED",
      "Administrators cannot suspend their own account.",
    );
  }

  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const targetUser = await transaction.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!targetUser) {
      throw createAdminError(
        404,
        "USER_NOT_FOUND",
        "The requested user does not exist.",
      );
    }

    if (targetUser.role !== "USER") {
      throw createAdminError(
        403,
        "ADMIN_ACCOUNT_PROTECTED",
        "Administrator accounts cannot be suspended through user management.",
      );
    }

    if (targetUser.status === "SUSPENDED") {
      throw createAdminError(
        409,
        "USER_ALREADY_SUSPENDED",
        "This account is already suspended.",
      );
    }

    const updateResult = await transaction.user.updateMany({
      where: {
        id: targetUserId,
        role: "USER",
        status: "ACTIVE",
      },
      data: {
        status: "SUSPENDED",
        suspendedAt: now,
        suspensionReason: reason,
        suspendedByAdminId: adminUserId,
      },
    });

    if (updateResult.count !== 1) {
      throw createAdminError(
        409,
        "USER_STATE_CHANGED",
        "The account state changed. Refresh the user record and try again.",
      );
    }

    // Revoke every active session belonging to the target user.
    const revokedSessions =
      await transaction.session.updateMany({
        where: {
          userId: targetUserId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

    // Revoke all refresh tokens associated with those sessions.
    const revokedRefreshTokens =
      await transaction.refreshToken.updateMany({
        where: {
          session: {
            is: {
              userId: targetUserId,
            },
          },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

    await transaction.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: "USER_SUSPENDED",
        entityType: "USER",
        entityId: targetUserId,
        metadata: {
          reason,
          revokedSessions: revokedSessions.count,
          revokedRefreshTokens: revokedRefreshTokens.count,
        },
        ipAddress:
          typeof ipAddress === "string"
            ? ipAddress.slice(0, 64)
            : null,
        userAgent:
          typeof userAgent === "string"
            ? userAgent.slice(0, 500)
            : null,
      },
    });

    return {
      id: targetUserId,
      status: "SUSPENDED",
      suspendedAt: now,
      suspensionReason: reason,
      revokedSessions: revokedSessions.count,
      revokedRefreshTokens: revokedRefreshTokens.count,
    };
  });
}

/**
 * Reactivates a suspended normal user.
 * Previously revoked sessions are never restored.
 */
export async function reactivateAdminManagedUser({
  targetUserId,
  adminUserId,
  ipAddress,
  userAgent,
}) {
  if (targetUserId === adminUserId) {
    throw createAdminError(
      400,
      "SELF_REACTIVATION_NOT_ALLOWED",
      "This operation is not available for your own account.",
    );
  }

  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const targetUser = await transaction.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!targetUser) {
      throw createAdminError(
        404,
        "USER_NOT_FOUND",
        "The requested user does not exist.",
      );
    }

    if (targetUser.role !== "USER") {
      throw createAdminError(
        403,
        "ADMIN_ACCOUNT_PROTECTED",
        "Administrator accounts cannot be changed through user management.",
      );
    }

    if (targetUser.status === "ACTIVE") {
      throw createAdminError(
        409,
        "USER_ALREADY_ACTIVE",
        "This account is already active.",
      );
    }

    const updateResult = await transaction.user.updateMany({
      where: {
        id: targetUserId,
        role: "USER",
        status: "SUSPENDED",
      },
      data: {
        status: "ACTIVE",
        suspendedAt: null,
        suspensionReason: null,
        suspendedByAdminId: null,
      },
    });

    if (updateResult.count !== 1) {
      throw createAdminError(
        409,
        "USER_STATE_CHANGED",
        "The account state changed. Refresh the user record and try again.",
      );
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: "USER_REACTIVATED",
        entityType: "USER",
        entityId: targetUserId,
        metadata: {
          previousStatus: "SUSPENDED",
          newStatus: "ACTIVE",
          sessionsRestored: false,
        },
        ipAddress:
          typeof ipAddress === "string"
            ? ipAddress.slice(0, 64)
            : null,
        userAgent:
          typeof userAgent === "string"
            ? userAgent.slice(0, 500)
            : null,
      },
    });

    return {
      id: targetUserId,
      status: "ACTIVE",
      reactivatedAt: now,
      sessionsRestored: false,
    };
  });
}