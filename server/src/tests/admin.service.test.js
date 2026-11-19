
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock } = vi.hoisted(() => {
  const transaction = {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    session: {
      updateMany: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    transactionMock: transaction,
    prismaMock: {
      $transaction: vi.fn(),
      user: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      shortUrl: {
        count: vi.fn(),
      },
      clickEvent: {
        count: vi.fn(),
      },
      abuseReport: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      securityEvent: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  getAdminDashboardOverview,
  getAdminUsers,
  getAdminUserById,
  suspendAdminManagedUser,
  reactivateAdminManagedUser,
} from "../services/admin.service.js";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function configureDashboardMocks() {
  prismaMock.user.count
    .mockResolvedValueOnce(100)
    .mockResolvedValueOnce(90)
    .mockResolvedValueOnce(10)
    .mockResolvedValueOnce(80)
    .mockResolvedValueOnce(12);

  prismaMock.shortUrl.count
    .mockResolvedValueOnce(200)
    .mockResolvedValueOnce(150)
    .mockResolvedValueOnce(5);

  prismaMock.clickEvent.count.mockResolvedValue(5000);
  prismaMock.abuseReport.count.mockResolvedValue(12);
  prismaMock.securityEvent.count.mockResolvedValue(3);

  prismaMock.user.findMany.mockResolvedValue([
    {
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      role: "USER",
      status: "ACTIVE",
      createdAt: new Date("2026-11-19T10:00:00.000Z"),
    },
  ]);

  prismaMock.abuseReport.findMany.mockResolvedValue([
    {
      id: "report-1",
      shortCode: "Ab12Cd34",
      reason: "PHISHING",
      status: "PENDING",
      createdAt: new Date("2026-11-19T10:00:00.000Z"),
    },
  ]);

  prismaMock.securityEvent.findMany.mockResolvedValue([
    {
      id: "event-1",
      eventType: "SUSPICIOUS_ACTIVITY",
      severity: "HIGH",
      status: "OPEN",
      ipAddress: "192.0.2.10",
      createdAt: new Date("2026-11-19T10:00:00.000Z"),
    },
  ]);
}

function configureTransaction() {
  prismaMock.$transaction.mockImplementation(async (callback) => {
    return callback(transactionMock);
  });

  transactionMock.user.findUnique.mockResolvedValue({
    id: USER_ID,
    role: "USER",
    status: "ACTIVE",
  });

  transactionMock.user.updateMany.mockResolvedValue({ count: 1 });
  transactionMock.session.updateMany.mockResolvedValue({ count: 2 });
  transactionMock.refreshToken.updateMany.mockResolvedValue({ count: 3 });
  transactionMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
}

describe("Admin dashboard service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureDashboardMocks();
  });

  it("aggregates platform-wide dashboard metrics correctly", async () => {
    const result = await getAdminDashboardOverview();

    expect(result.summary).toEqual({
      users: {
        total: 100,
        active: 90,
        suspended: 10,
        verified: 80,
        newLast7Days: 12,
      },
      urls: {
        total: 200,
        active: 150,
        blocked: 5,
      },
      clicks: {
        total: 5000,
      },
      moderation: {
        pendingReports: 12,
      },
      security: {
        openEvents: 3,
      },
    });

    expect(result.generatedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });

  it("uses the correct database filters for dashboard metrics", async () => {
    await getAdminDashboardOverview();

    expect(prismaMock.user.count).toHaveBeenCalledTimes(5);

    expect(prismaMock.user.count).toHaveBeenNthCalledWith(2, {
      where: { status: "ACTIVE" },
    });

    expect(prismaMock.user.count).toHaveBeenNthCalledWith(3, {
      where: { status: "SUSPENDED" },
    });

    expect(prismaMock.user.count).toHaveBeenNthCalledWith(4, {
      where: {
        emailVerifiedAt: { not: null },
      },
    });

    expect(
      prismaMock.user.count.mock.calls[4][0].where.createdAt.gte,
    ).toBeInstanceOf(Date);

    expect(prismaMock.shortUrl.count).toHaveBeenNthCalledWith(2, {
      where: {
        isActive: true,
        moderationStatus: "APPROVED",
      },
    });

    expect(prismaMock.shortUrl.count).toHaveBeenNthCalledWith(3, {
      where: { moderationStatus: "BLOCKED" },
    });

    expect(prismaMock.abuseReport.count).toHaveBeenCalledWith({
      where: { status: "PENDING" },
    });

    expect(prismaMock.securityEvent.count).toHaveBeenCalledWith({
      where: { status: "OPEN" },
    });
  });

  it("limits recent records and selects only required fields", async () => {
    const result = await getAdminDashboardOverview();

    expect(result.recentUsers).toHaveLength(1);
    expect(result.recentReports).toHaveLength(1);
    expect(result.recentSecurityEvents).toHaveLength(1);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    expect(prismaMock.abuseReport.findMany).toHaveBeenCalledWith({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        shortCode: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });

    expect(prismaMock.securityEvent.findMany).toHaveBeenCalledWith({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        eventType: true,
        severity: true,
        status: true,
        ipAddress: true,
        createdAt: true,
      },
    });
  });
});

describe("Admin user management service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAdminUsers", () => {
    it("applies pagination, role, status, and search filters", async () => {
      prismaMock.user.count.mockResolvedValue(1);
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: USER_ID,
          name: "Test User",
          email: "test@example.com",
          role: "USER",
          status: "ACTIVE",
        },
      ]);

      const result = await getAdminUsers({
        page: 2,
        limit: 10,
        role: "USER",
        status: "ACTIVE",
        search: "test",
      });

      expect(prismaMock.user.count).toHaveBeenCalledWith({
        where: {
          role: "USER",
          status: "ACTIVE",
          OR: [
            {
              email: {
                contains: "test",
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: "test",
                mode: "insensitive",
              },
            },
          ],
        },
      });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: {
          role: "USER",
          status: "ACTIVE",
          OR: [
            {
              email: {
                contains: "test",
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: "test",
                mode: "insensitive",
              },
            },
          ],
        },
        skip: 10,
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
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
        },
      });

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it("does not request credential or token fields", async () => {
      prismaMock.user.count.mockResolvedValue(0);
      prismaMock.user.findMany.mockResolvedValue([]);

      await getAdminUsers({
        page: 1,
        limit: 20,
      });

      const select = prismaMock.user.findMany.mock.calls[0][0].select;

      expect(select).not.toHaveProperty("passwordHash");
      expect(select).not.toHaveProperty("sessions");
      expect(select).not.toHaveProperty("refreshTokens");
    });
  });

  describe("getAdminUserById", () => {
    it("returns a safe user projection with account counts", async () => {
      const expectedUser = {
        id: USER_ID,
        name: "Test User",
        email: "test@example.com",
        role: "USER",
        status: "ACTIVE",
        _count: {
          sessions: 2,
          shortUrls: 4,
        },
      };

      prismaMock.user.findUnique.mockResolvedValue(expectedUser);

      const result = await getAdminUserById(USER_ID);

      expect(result).toEqual(expectedUser);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: {
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
          _count: {
            select: {
              sessions: true,
              shortUrls: true,
            },
          },
        },
      });
    });

    it("returns a 404 error when the user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(getAdminUserById(USER_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: "USER_NOT_FOUND",
      });
    });
  });

  describe("suspendAdminManagedUser", () => {
    it("suspends a user, revokes sessions and refresh tokens, and writes an audit log", async () => {
      configureTransaction();

      const result = await suspendAdminManagedUser({
        targetUserId: USER_ID,
        adminUserId: ADMIN_ID,
        reason: "Repeated abuse reports confirmed by review.",
        ipAddress: "192.0.2.10",
        userAgent: "Test browser",
      });

      expect(prismaMock.$transaction).toHaveBeenCalledOnce();

      expect(transactionMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: USER_ID,
          role: "USER",
          status: "ACTIVE",
        },
        data: {
          status: "SUSPENDED",
          suspendedAt: expect.any(Date),
          suspensionReason: "Repeated abuse reports confirmed by review.",
          suspendedByAdminId: ADMIN_ID,
        },
      });

      expect(transactionMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      expect(transactionMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          session: {
            is: {
              userId: USER_ID,
            },
          },
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorUserId: ADMIN_ID,
          action: "USER_SUSPENDED",
          entityType: "USER",
          entityId: USER_ID,
          metadata: {
            reason: "Repeated abuse reports confirmed by review.",
            revokedSessions: 2,
            revokedRefreshTokens: 3,
          },
          ipAddress: "192.0.2.10",
          userAgent: "Test browser",
        },
      });

      expect(result).toMatchObject({
        id: USER_ID,
        status: "SUSPENDED",
        suspensionReason: "Repeated abuse reports confirmed by review.",
        revokedSessions: 2,
        revokedRefreshTokens: 3,
      });
    });

    it("rejects self-suspension before starting a transaction", async () => {
      await expect(
        suspendAdminManagedUser({
          targetUserId: ADMIN_ID,
          adminUserId: ADMIN_ID,
          reason: "Self suspension attempt.",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SELF_SUSPENSION_NOT_ALLOWED",
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("protects administrator accounts", async () => {
      configureTransaction();

      transactionMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: "ADMIN",
        status: "ACTIVE",
      });

      await expect(
        suspendAdminManagedUser({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
          reason: "Attempt to suspend administrator.",
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "ADMIN_ACCOUNT_PROTECTED",
      });

      expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.session.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
    });

    it("rejects an account that is already suspended", async () => {
      configureTransaction();

      transactionMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: "USER",
        status: "SUSPENDED",
      });

      await expect(
        suspendAdminManagedUser({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
          reason: "Repeated abuse reports confirmed by review.",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "USER_ALREADY_SUSPENDED",
      });

      expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
    });

    it("does not continue when the account state changes before update", async () => {
      configureTransaction();
      transactionMock.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        suspendAdminManagedUser({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
          reason: "Repeated abuse reports confirmed by review.",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "USER_STATE_CHANGED",
      });

      expect(transactionMock.session.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
    });

    it("does not write an audit log if session revocation fails", async () => {
      configureTransaction();

      transactionMock.session.updateMany.mockRejectedValue(
        new Error("Session database failure"),
      );

      await expect(
        suspendAdminManagedUser({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
          reason: "Repeated abuse reports confirmed by review.",
        }),
      ).rejects.toThrow("Session database failure");

      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
    });

    it("does not write an audit log if refresh-token revocation fails", async () => {
      configureTransaction();

      transactionMock.refreshToken.updateMany.mockRejectedValue(
        new Error("Refresh-token database failure"),
      );

      await expect(
        suspendAdminManagedUser({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
          reason: "Repeated abuse reports confirmed by review.",
        }),
      ).rejects.toThrow("Refresh-token database failure");

      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("reactivateAdminManagedUser", () => {
    it("reactivates a suspended user and records an audit log", async () => {
      configureTransaction();

      transactionMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: "USER",
        status: "SUSPENDED",
      });

      const result = await reactivateAdminManagedUser({
        targetUserId: USER_ID,
        adminUserId: ADMIN_ID,
        ipAddress: "192.0.2.10",
        userAgent: "Test browser",
      });

      expect(transactionMock.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: USER_ID,
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

      expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorUserId: ADMIN_ID,
          action: "USER_REACTIVATED",
          entityType: "USER",
          entityId: USER_ID,
          metadata: {
            previousStatus: "SUSPENDED",
            newStatus: "ACTIVE",
            sessionsRestored: false,
          },
          ipAddress: "192.0.2.10",
          userAgent: "Test browser",
        },
      });

      expect(transactionMock.session.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.refreshToken.updateMany).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        id: USER_ID,
        status: "ACTIVE",
        sessionsRestored: false,
      });
    });

    it("rejects reactivation of an already active account", async () => {
      configureTransaction();

      transactionMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: "USER",
        status: "ACTIVE",
      });

      await expect(
        reactivateAdminManagedUser({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "USER_ALREADY_ACTIVE",
      });

      expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
    });

    it("protects administrator accounts from reactivation through this endpoint", async () => {
      configureTransaction();

      transactionMock.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: "ADMIN",
        status: "SUSPENDED",
      });

      await expect(
        reactivateAdminManagedUser({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "ADMIN_ACCOUNT_PROTECTED",
      });

      expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
      expect(transactionMock.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
