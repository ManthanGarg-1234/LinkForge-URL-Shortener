
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transactionMock,
  prismaMock,
} = vi.hoisted(() => {
  const transactionMock = {
    abuseReport: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    transactionMock,
    prismaMock: {
      abuseReport: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  getAdminAbuseReports,
  getAdminAbuseReportById,
  reviewAdminAbuseReport,
} from "../services/admin-moderation.service.js";

const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const pendingReport = {
  id: REPORT_ID,
  shortCode: "Ab12Cd34",
  reason: "PHISHING",
  status: "PENDING",
};

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.$transaction.mockImplementation(async (operation) => {
    if (Array.isArray(operation)) {
      return Promise.all(operation);
    }

    return operation(transactionMock);
  });

  prismaMock.abuseReport.findMany.mockResolvedValue([]);
  prismaMock.abuseReport.count.mockResolvedValue(0);
  prismaMock.abuseReport.findUnique.mockResolvedValue(pendingReport);

  transactionMock.abuseReport.findMany.mockResolvedValue([]);
  transactionMock.abuseReport.count.mockResolvedValue(0);
  transactionMock.abuseReport.findUnique.mockResolvedValue(pendingReport);
  transactionMock.abuseReport.updateMany.mockResolvedValue({ count: 1 });
  transactionMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
});

describe("Admin moderation service", () => {
  describe("getAdminAbuseReports", () => {
    it("should return paginated abuse reports", async () => {
      const reports = [
        pendingReport,
        { ...pendingReport, id: "33333333-3333-4333-8333-333333333333" },
      ];

      prismaMock.abuseReport.findMany.mockResolvedValue(reports);
      prismaMock.abuseReport.count.mockResolvedValue(12);

      const result = await getAdminAbuseReports({
        page: 2,
        limit: 5,
      });

      expect(result.items).toEqual(reports);
      expect(result.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3,
      });

      expect(prismaMock.abuseReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("should apply status, reason and search filters", async () => {
      await getAdminAbuseReports({
        page: 1,
        limit: 20,
        status: "PENDING",
        reason: "PHISHING",
        search: "Ab12",
      });

      expect(prismaMock.abuseReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: "PENDING",
            reason: "PHISHING",
            OR: [
              {
                shortCode: {
                  contains: "Ab12",
                  mode: "insensitive",
                },
              },
              {
                description: {
                  contains: "Ab12",
                  mode: "insensitive",
                },
              },
            ],
          },
        }),
      );
    });
  });

  describe("getAdminAbuseReportById", () => {
    it("should return the requested report", async () => {
      prismaMock.abuseReport.findUnique.mockResolvedValue(pendingReport);

      const result = await getAdminAbuseReportById(REPORT_ID);

      expect(result).toEqual(pendingReport);
      expect(prismaMock.abuseReport.findUnique).toHaveBeenCalledWith({
        where: { id: REPORT_ID },
        select: expect.any(Object),
      });
    });

    it("should return a 404 error when the report does not exist", async () => {
      prismaMock.abuseReport.findUnique.mockResolvedValue(null);

      await expect(
        getAdminAbuseReportById(REPORT_ID),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "ABUSE_REPORT_NOT_FOUND",
      });
    });
  });

  describe("reviewAdminAbuseReport", () => {
    it("should dismiss a pending report and create an audit log", async () => {
      transactionMock.abuseReport.findUnique
        .mockResolvedValueOnce(pendingReport)
        .mockResolvedValueOnce({
          ...pendingReport,
          status: "DISMISSED",
        });

      transactionMock.abuseReport.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await reviewAdminAbuseReport({
        reportId: REPORT_ID,
        adminUserId: ADMIN_ID,
        status: "DISMISSED",
        resolutionNote: "The report was reviewed and found invalid.",
        ipAddress: "192.0.2.10",
        userAgent: "Test browser",
      });

      expect(result.status).toBe("DISMISSED");

      expect(transactionMock.abuseReport.updateMany).toHaveBeenCalledWith({
        where: {
          id: REPORT_ID,
          status: "PENDING",
        },
        data: expect.objectContaining({
          status: "DISMISSED",
          reviewedByAdminId: ADMIN_ID,
          resolutionNote: "The report was reviewed and found invalid.",
          reviewedAt: expect.any(Date),
        }),
      });

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: ADMIN_ID,
          action: "ABUSE_REPORT_DISMISSED",
          entityType: "ABUSE_REPORT",
          entityId: REPORT_ID,
          ipAddress: "192.0.2.10",
          userAgent: "Test browser",
        }),
      });
    });

    it("should confirm a pending report and create the correct audit action", async () => {
      transactionMock.abuseReport.findUnique
        .mockResolvedValueOnce(pendingReport)
        .mockResolvedValueOnce({
          ...pendingReport,
          status: "CONFIRMED",
        });

      const result = await reviewAdminAbuseReport({
        reportId: REPORT_ID,
        adminUserId: ADMIN_ID,
        status: "CONFIRMED",
      });

      expect(result.status).toBe("CONFIRMED");

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "ABUSE_REPORT_CONFIRMED",
          entityType: "ABUSE_REPORT",
          entityId: REPORT_ID,
        }),
      });
    });

    it("should reject an invalid review status", async () => {
      await expect(
        reviewAdminAbuseReport({
          reportId: REPORT_ID,
          adminUserId: ADMIN_ID,
          status: "PENDING",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_REVIEW_STATUS",
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("should return 404 when the report does not exist", async () => {
      transactionMock.abuseReport.findUnique.mockResolvedValue(null);

      await expect(
        reviewAdminAbuseReport({
          reportId: REPORT_ID,
          adminUserId: ADMIN_ID,
          status: "CONFIRMED",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "ABUSE_REPORT_NOT_FOUND",
      });

      expect(transactionMock.abuseReport.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
    });

    it("should reject a report that has already been reviewed", async () => {
      transactionMock.abuseReport.findUnique.mockResolvedValue({
        ...pendingReport,
        status: "DISMISSED",
      });

      await expect(
        reviewAdminAbuseReport({
          reportId: REPORT_ID,
          adminUserId: ADMIN_ID,
          status: "CONFIRMED",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "ABUSE_REPORT_ALREADY_REVIEWED",
      });

      expect(transactionMock.abuseReport.updateMany).not.toHaveBeenCalled();
    });

    it("should reject a concurrent review when the pending-state update affects no rows", async () => {
      transactionMock.abuseReport.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        reviewAdminAbuseReport({
          reportId: REPORT_ID,
          adminUserId: ADMIN_ID,
          status: "CONFIRMED",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "ABUSE_REPORT_REVIEW_CONFLICT",
      });

      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
    });

    it("should propagate audit-log failures so the transaction can roll back", async () => {
      const databaseError = new Error("Audit database failure");
      transactionMock.auditLog.create.mockRejectedValue(databaseError);

      await expect(
        reviewAdminAbuseReport({
          reportId: REPORT_ID,
          adminUserId: ADMIN_ID,
          status: "CONFIRMED",
        }),
      ).rejects.toBe(databaseError);
    });
  });
});
