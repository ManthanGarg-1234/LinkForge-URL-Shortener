import { prisma } from "../lib/prisma.js";

const MAX_TRANSACTION_ATTEMPTS = 3;

function createReportError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * Creates an abuse report.
 *
 * Serializable isolation prevents concurrent requests from both passing
 * the pending-report check and inserting duplicate pending reports.
 */
export async function createAbuseReport({
  shortCode,
  reporterUserId,
  reason,
  description,
}) {
  for (
    let attempt = 1;
    attempt <= MAX_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const shortUrl = await transaction.shortUrl.findUnique({
            where: { shortCode },
            select: {
              id: true,
              shortCode: true,
            },
          });

          if (!shortUrl) {
            throw createReportError(
              404,
              "SHORT_URL_NOT_FOUND",
              "The requested short URL does not exist.",
            );
          }

          const existingPendingReport =
            await transaction.abuseReport.findFirst({
              where: {
                shortUrlId: shortUrl.id,
                reporterUserId,
                status: "PENDING",
              },
              select: {
                id: true,
              },
            });

          if (existingPendingReport) {
            throw createReportError(
              409,
              "DUPLICATE_PENDING_REPORT",
              "You already have a pending report for this URL.",
            );
          }

          const report = await transaction.abuseReport.create({
            data: {
              shortUrlId: shortUrl.id,
              shortCode: shortUrl.shortCode,
              reporterUserId,
              reason,
              description: description || null,
            },
            select: {
              id: true,
              shortCode: true,
              reason: true,
              description: true,
              status: true,
              createdAt: true,
            },
          });

          return report;
        },
        {
          isolationLevel: "Serializable",
        },
      );
    } catch (error) {
      // PostgreSQL serialization conflict / Prisma transaction conflict.
      if (error.code === "P2034") {
        if (attempt < MAX_TRANSACTION_ATTEMPTS) {
          continue;
        }

        throw createReportError(
          503,
          "REPORT_CREATION_CONFLICT",
          "The report could not be processed due to concurrent activity. Please try again.",
        );
      }

      throw error;
    }
  }

  throw createReportError(
    503,
    "REPORT_CREATION_FAILED",
    "The report could not be created. Please try again.",
  );
}