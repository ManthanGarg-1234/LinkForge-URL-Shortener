
import { prisma } from "../lib/prisma.js";

const REPORT_SELECT = {
  id: true,
  shortCode: true,
  reason: true,
  description: true,
  status: true,
  resolutionNote: true,
  createdAt: true,
  reviewedAt: true,
  shortUrl: {
    select: {
      id: true,
      shortCode: true,
      originalUrl: true,
      isActive: true,
      moderationStatus: true,
      createdAt: true,
    },
  },
  reporter: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  reviewedByAdmin: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
};

function createModerationError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getAuditMetadata({ report, status, resolutionNote }) {
  return {
    shortCode: report.shortCode,
    reason: report.reason,
    previousStatus: "PENDING",
    newStatus: status,
    resolutionNote: resolutionNote || null,
  };
}

export async function getAdminAbuseReports({
  page = 1,
  limit = 20,
  status,
  reason,
  search,
} = {}) {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (reason) {
    where.reason = reason;
  }

  if (search) {
    where.OR = [
      {
        shortCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.abuseReport.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
      select: REPORT_SELECT,
    }),

    prisma.abuseReport.count({
      where,
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getAdminAbuseReportById(id) {
  const report = await prisma.abuseReport.findUnique({
    where: { id },
    select: REPORT_SELECT,
  });

  if (!report) {
    throw createModerationError(
      404,
      "ABUSE_REPORT_NOT_FOUND",
      "The requested abuse report does not exist.",
    );
  }

  return report;
}

export async function reviewAdminAbuseReport({
  reportId,
  adminUserId,
  status,
  resolutionNote,
  ipAddress,
  userAgent,
}) {
  if (!["DISMISSED", "CONFIRMED"].includes(status)) {
    throw createModerationError(
      400,
      "INVALID_REVIEW_STATUS",
      "The review status must be DISMISSED or CONFIRMED.",
    );
  }

  return prisma.$transaction(async (transaction) => {
    const existingReport = await transaction.abuseReport.findUnique({
      where: {
        id: reportId,
      },
      select: {
        id: true,
        shortCode: true,
        reason: true,
        status: true,
      },
    });

    if (!existingReport) {
      throw createModerationError(
        404,
        "ABUSE_REPORT_NOT_FOUND",
        "The requested abuse report does not exist.",
      );
    }

    if (existingReport.status !== "PENDING") {
      throw createModerationError(
        409,
        "ABUSE_REPORT_ALREADY_REVIEWED",
        "This abuse report has already been reviewed.",
      );
    }

    // Conditional update prevents two administrators from reviewing
    // the same pending report successfully.
    const updateResult = await transaction.abuseReport.updateMany({
      where: {
        id: reportId,
        status: "PENDING",
      },
      data: {
        status,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
        resolutionNote: resolutionNote || null,
      },
    });

    if (updateResult.count !== 1) {
      throw createModerationError(
        409,
        "ABUSE_REPORT_REVIEW_CONFLICT",
        "The report was reviewed by another administrator. Refresh and try again.",
      );
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action:
          status === "DISMISSED"
            ? "ABUSE_REPORT_DISMISSED"
            : "ABUSE_REPORT_CONFIRMED",
        entityType: "ABUSE_REPORT",
        entityId: reportId,
        metadata: getAuditMetadata({
          report: existingReport,
          status,
          resolutionNote,
        }),
        ipAddress: ipAddress?.slice(0, 64) || null,
        userAgent: userAgent?.slice(0, 500) || null,
      },
    });

    const reviewedReport = await transaction.abuseReport.findUnique({
      where: {
        id: reportId,
      },
      select: REPORT_SELECT,
    });

    return reviewedReport;
  });
}
