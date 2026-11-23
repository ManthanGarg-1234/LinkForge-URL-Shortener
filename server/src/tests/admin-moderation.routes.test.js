import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { env } from "../config/env.js";
const {
  getAdminAbuseReports,
  getAdminAbuseReportById,
  reviewAdminAbuseReport,
} = vi.hoisted(() => ({
  getAdminAbuseReports: vi.fn(),
  getAdminAbuseReportById: vi.fn(),
  reviewAdminAbuseReport: vi.fn(),
}));

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

vi.mock("../services/admin-moderation.service.js", () => ({
  getAdminAbuseReports,
  getAdminAbuseReportById,
  reviewAdminAbuseReport,
}));

import app from "../app.js";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";

const reportResponse = {
  id: REPORT_ID,
  shortCode: "Ab12Cd34",
  reason: "PHISHING",
  description: "This destination appears to be a phishing page.",
  status: "PENDING",
};

function adminRequest(method, path) {
  return request(app)
    [method](path)
    .set("Cookie", "lf_test_auth=admin")
    .set("Origin", env.CORS_ORIGIN);
}

describe("Admin moderation API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAdminAbuseReports.mockResolvedValue({
      items: [reportResponse],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });

    getAdminAbuseReportById.mockResolvedValue(reportResponse);

    reviewAdminAbuseReport.mockResolvedValue({
      ...reportResponse,
      status: "CONFIRMED",
    });
  });

  describe("GET /api/v1/admin/abuse-reports", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await request(app).get("/api/v1/admin/abuse-reports");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(getAdminAbuseReports).not.toHaveBeenCalled();
    });

    it("rejects authenticated non-admin users", async () => {
      const response = await request(app)
        .get("/api/v1/admin/abuse-reports")
        .set("Cookie", "lf_test_auth=user");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(getAdminAbuseReports).not.toHaveBeenCalled();
    });

    it("returns paginated reports to an administrator", async () => {
      const response = await adminRequest("get", "/api/v1/admin/abuse-reports");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toEqual([reportResponse]);

      expect(getAdminAbuseReports).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
    });

    it("passes valid filters to the service", async () => {
      const response = await adminRequest(
        "get",
        "/api/v1/admin/abuse-reports?page=2&limit=10&status=PENDING&reason=PHISHING&search=Ab12",
      );

      expect(response.status).toBe(200);

      expect(getAdminAbuseReports).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        status: "PENDING",
        reason: "PHISHING",
        search: "Ab12",
      });
    });

    it("rejects invalid pagination and filter values", async () => {
      const response = await adminRequest(
        "get",
        "/api/v1/admin/abuse-reports?page=0&limit=500&status=INVALID",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(getAdminAbuseReports).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/admin/abuse-reports/:id", () => {
    it("returns report details to an administrator", async () => {
      const response = await adminRequest(
        "get",
        `/api/v1/admin/abuse-reports/${REPORT_ID}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.report).toEqual(reportResponse);

      expect(getAdminAbuseReportById).toHaveBeenCalledWith(REPORT_ID);
    });

    it("rejects invalid report IDs", async () => {
      const response = await adminRequest(
        "get",
        "/api/v1/admin/abuse-reports/not-a-uuid",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(getAdminAbuseReportById).not.toHaveBeenCalled();
    });

    it("returns 404 when the report does not exist", async () => {
      getAdminAbuseReportById.mockRejectedValue(
        Object.assign(new Error("The requested abuse report does not exist."), {
          statusCode: 404,
          code: "ABUSE_REPORT_NOT_FOUND",
        }),
      );

      const response = await adminRequest(
        "get",
        `/api/v1/admin/abuse-reports/${REPORT_ID}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("ABUSE_REPORT_NOT_FOUND");
    });
  });

  describe("POST /api/v1/admin/abuse-reports/:id/review", () => {
    it("rejects unauthenticated review requests", async () => {
      const response = await request(app)
        .post(`/api/v1/admin/abuse-reports/${REPORT_ID}/review`)
        .send({ status: "CONFIRMED" });

      expect(response.status).toBe(401);
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("rejects non-admin review requests", async () => {
      const response = await request(app)
        .post(`/api/v1/admin/abuse-reports/${REPORT_ID}/review`)
        .set("Cookie", "lf_test_auth=user")
        .send({ status: "CONFIRMED" });

      expect(response.status).toBe(403);
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("rejects admin review requests from an untrusted origin", async () => {
      const response = await request(app)
        .post(`/api/v1/admin/abuse-reports/${REPORT_ID}/review`)
        .set("Cookie", "lf_test_auth=admin")
        .set("Origin", "https://attacker.example")
        .send({ status: "CONFIRMED" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("UNTRUSTED_ORIGIN");
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("confirms a report with a valid review request", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/abuse-reports/${REPORT_ID}/review`,
      ).send({
        status: "CONFIRMED",
        resolutionNote: "The destination was verified as phishing.",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.report.status).toBe("CONFIRMED");

      expect(reviewAdminAbuseReport).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: REPORT_ID,
          adminUserId: ADMIN_ID,
          status: "CONFIRMED",
          resolutionNote: "The destination was verified as phishing.",
          ipAddress: expect.any(String),
        }),
      );
    });

    it("dismisses a report with a valid review request", async () => {
      reviewAdminAbuseReport.mockResolvedValue({
        ...reportResponse,
        status: "DISMISSED",
      });

      const response = await adminRequest(
        "post",
        `/api/v1/admin/abuse-reports/${REPORT_ID}/review`,
      ).send({
        status: "DISMISSED",
        resolutionNote: "The report could not be substantiated.",
      });

      expect(response.status).toBe(200);
      expect(response.body.data.report.status).toBe("DISMISSED");

      expect(reviewAdminAbuseReport).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: REPORT_ID,
          adminUserId: ADMIN_ID,
          status: "DISMISSED",
        }),
      );
    });

    it("rejects an invalid review status", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/abuse-reports/${REPORT_ID}/review`,
      ).send({
        status: "PENDING",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("rejects a missing review status", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/abuse-reports/${REPORT_ID}/review`,
      ).send({
        resolutionNote: "Reviewed.",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("rejects resolution notes exceeding 1000 characters", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/abuse-reports/${REPORT_ID}/review`,
      ).send({
        status: "CONFIRMED",
        resolutionNote: "A".repeat(1001),
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("rejects unexpected request properties", async () => {
      const response = await adminRequest(
        "post",
        `/api/v1/admin/abuse-reports/${REPORT_ID}/review`,
      ).send({
        status: "CONFIRMED",
        adminUserId: "attacker-controlled-id",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("rejects invalid report IDs", async () => {
      const response = await adminRequest(
        "post",
        "/api/v1/admin/abuse-reports/invalid-id/review",
      ).send({
        status: "CONFIRMED",
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(reviewAdminAbuseReport).not.toHaveBeenCalled();
    });

    it("returns a conflict when the report was already reviewed", async () => {
      reviewAdminAbuseReport.mockRejectedValue(
        Object.assign(
          new Error("This abuse report has already been reviewed."),
          {
            statusCode: 409,
            code: "ABUSE_REPORT_ALREADY_REVIEWED",
          },
        ),
      );

      const response = await adminRequest(
        "post",
        `/api/v1/admin/abuse-reports/${REPORT_ID}/review`,
      ).send({
        status: "CONFIRMED",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("ABUSE_REPORT_ALREADY_REVIEWED");
    });
  });
});
