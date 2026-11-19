
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("../middleware/auth.middleware.js", () => ({
  authenticate(req, res, next) {
    const cookie = req.headers.cookie ?? "";

    if (cookie.includes("lf_test_auth=admin")) {
      req.user = {
        id: "11111111-1111-4111-8111-111111111111",
        email: "admin@example.com",
        role: "ADMIN",
        sessionId: "admin-session-123",
      };

      return next();
    }

    if (cookie.includes("lf_test_auth=user")) {
      req.user = {
        id: "22222222-2222-4222-8222-222222222222",
        email: "user@example.com",
        role: "USER",
        sessionId: "user-session-123",
      };

      return next();
    }

    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
  },
}));

vi.mock("../services/admin.service.js", () => ({
  getAdminDashboardOverview: vi.fn(),
  getAdminUsers: vi.fn(),
  getAdminUserById: vi.fn(),
  suspendAdminManagedUser: vi.fn(),
  reactivateAdminManagedUser: vi.fn(),
}));

import app from "../app.js";

import {
  getAdminDashboardOverview,
  getAdminUsers,
  getAdminUserById,
  suspendAdminManagedUser,
  reactivateAdminManagedUser,
} from "../services/admin.service.js";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const dashboardResponse = {
  summary: {
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
  },
  recentUsers: [],
  recentReports: [],
  recentSecurityEvents: [],
  generatedAt: "2026-11-19T10:00:00.000Z",
};

function authenticatedRequest(role) {
  return request(app)
    .get("/api/v1/admin/dashboard/overview")
    .set("Cookie", `lf_test_auth=${role}`);
}

function adminRequest(method, path) {
  return request(app)[method](path)
    .set("Cookie", "lf_test_auth=admin");
}

describe("Admin API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAdminDashboardOverview.mockResolvedValue(dashboardResponse);

    getAdminUsers.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });

    getAdminUserById.mockResolvedValue({
      id: USER_ID,
      email: "user@example.com",
      role: "USER",
      status: "ACTIVE",
    });

    suspendAdminManagedUser.mockResolvedValue({
      id: USER_ID,
      status: "SUSPENDED",
      revokedSessions: 2,
      revokedRefreshTokens: 3,
    });

    reactivateAdminManagedUser.mockResolvedValue({
      id: USER_ID,
      status: "ACTIVE",
      sessionsRestored: false,
    });
  });

  describe("GET /api/v1/admin/dashboard/overview", () => {
    it("rejects requests without authentication", async () => {
      const response = await request(app).get(
        "/api/v1/admin/dashboard/overview",
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(getAdminDashboardOverview).not.toHaveBeenCalled();
    });

    it("rejects authenticated users without the ADMIN role", async () => {
      const response = await authenticatedRequest("user");

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(getAdminDashboardOverview).not.toHaveBeenCalled();
    });

    it("returns dashboard data to an administrator", async () => {
      const response = await authenticatedRequest("admin");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(dashboardResponse);
      expect(getAdminDashboardOverview).toHaveBeenCalledOnce();
    });

    it("does not expose dashboard data when the service fails", async () => {
      getAdminDashboardOverview.mockRejectedValue(
        new Error("Database unavailable"),
      );

      const response = await authenticatedRequest("admin");

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Internal server error");
    });
  });

  describe("GET /api/v1/admin/users", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await request(app).get("/api/v1/admin/users");

      expect(response.status).toBe(401);
      expect(getAdminUsers).not.toHaveBeenCalled();
    });

    it("rejects non-admin users", async () => {
      const response = await request(app)
        .get("/api/v1/admin/users")
        .set("Cookie", "lf_test_auth=user");

      expect(response.status).toBe(403);
      expect(getAdminUsers).not.toHaveBeenCalled();
    });

    it("returns paginated users to an administrator", async () => {
      const response = await adminRequest("get", "/api/v1/admin/users");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });

      expect(getAdminUsers).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
    });

    it("passes valid filters to the service", async () => {
      const response = await adminRequest(
        "get",
        "/api/v1/admin/users?page=2&limit=10&role=USER&status=ACTIVE&search=test",
      );

      expect(response.status).toBe(200);

      expect(getAdminUsers).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        role: "USER",
        status: "ACTIVE",
        search: "test",
      });
    });

    it("rejects invalid pagination and filter values", async () => {
      const response = await adminRequest(
        "get",
        "/api/v1/admin/users?page=0&limit=500&role=INVALID",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(getAdminUsers).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/admin/users/:id", () => {
    it("returns user details to an administrator", async () => {
      const response = await adminRequest(
        "get",
        `/api/v1/admin/users/${USER_ID}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(USER_ID);

      expect(getAdminUserById).toHaveBeenCalledWith(USER_ID);
    });

    it("rejects an invalid user ID", async () => {
      const response = await adminRequest(
        "get",
        "/api/v1/admin/users/not-a-uuid",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(getAdminUserById).not.toHaveBeenCalled();
    });

    it("returns 404 when the user does not exist", async () => {
      getAdminUserById.mockRejectedValue(
        Object.assign(new Error("The requested user does not exist."), {
          statusCode: 404,
          code: "USER_NOT_FOUND",
        }),
      );

      const response = await adminRequest(
        "get",
        `/api/v1/admin/users/${USER_ID}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("USER_NOT_FOUND");
    });
  });

  describe("POST /api/v1/admin/users/:id/suspend", () => {
    it("suspends a user with a valid reason", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/users/${USER_ID}/suspend`,
      ).send({
        reason: "Repeated abuse reports confirmed by review.",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.status).toBe("SUSPENDED");

      expect(suspendAdminManagedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
          reason: "Repeated abuse reports confirmed by review.",
          ipAddress: expect.any(String),
        }),
      );
    });

    it("rejects a missing suspension reason", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/users/${USER_ID}/suspend`,
      ).send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(suspendAdminManagedUser).not.toHaveBeenCalled();
    });

    it("rejects a reason that is too short", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/users/${USER_ID}/suspend`,
      ).send({
        reason: "Spam",
      });

      expect(response.status).toBe(400);
      expect(suspendAdminManagedUser).not.toHaveBeenCalled();
    });

    it("rejects invalid target IDs", async () => {
      const response = await adminRequest(
        "post",
        "/api/v1/admin/users/invalid-id/suspend",
      ).send({
        reason: "Repeated abuse reports confirmed by review.",
      });

      expect(response.status).toBe(400);
      expect(suspendAdminManagedUser).not.toHaveBeenCalled();
    });

    it("rejects non-admin users", async () => {
      const response = await request(app)
        .post(`/api/v1/admin/users/${USER_ID}/suspend`)
        .set("Cookie", "lf_test_auth=user")
        .send({
          reason: "Repeated abuse reports confirmed by review.",
        });

      expect(response.status).toBe(403);
      expect(suspendAdminManagedUser).not.toHaveBeenCalled();
    });

    it("returns a conflict when the account is already suspended", async () => {
      suspendAdminManagedUser.mockRejectedValue(
        Object.assign(new Error("This account is already suspended."), {
          statusCode: 409,
          code: "USER_ALREADY_SUSPENDED",
        }),
      );

      const response = await adminRequest(
        "post",
        `/api/v1/admin/users/${USER_ID}/suspend`,
      ).send({
        reason: "Repeated abuse reports confirmed by review.",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("USER_ALREADY_SUSPENDED");
    });
  });

  describe("POST /api/v1/admin/users/:id/reactivate", () => {
    it("reactivates a suspended user", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/users/${USER_ID}/reactivate`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.status).toBe("ACTIVE");
      expect(response.body.data.user.sessionsRestored).toBe(false);

      expect(reactivateAdminManagedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: USER_ID,
          adminUserId: ADMIN_ID,
          ipAddress: expect.any(String),
        }),
      );
    });

    it("rejects invalid target IDs", async () => {
      const response = await adminRequest(
        "post",
        "/api/v1/admin/users/invalid-id/reactivate",
      );

      expect(response.status).toBe(400);
      expect(reactivateAdminManagedUser).not.toHaveBeenCalled();
    });

    it("rejects non-admin users", async () => {
      const response = await request(app)
        .post(`/api/v1/admin/users/${USER_ID}/reactivate`)
        .set("Cookie", "lf_test_auth=user");

      expect(response.status).toBe(403);
      expect(reactivateAdminManagedUser).not.toHaveBeenCalled();
    });

    it("returns a conflict when the account is already active", async () => {
      reactivateAdminManagedUser.mockRejectedValue(
        Object.assign(new Error("This account is already active."), {
          statusCode: 409,
          code: "USER_ALREADY_ACTIVE",
        }),
      );

      const response = await adminRequest(
        "post",
        `/api/v1/admin/users/${USER_ID}/reactivate`,
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("USER_ALREADY_ACTIVE");
    });
  });
});
