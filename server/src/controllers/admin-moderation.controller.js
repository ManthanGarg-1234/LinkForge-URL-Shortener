
import {
  getAdminAbuseReports,
  getAdminAbuseReportById,
  reviewAdminAbuseReport,
} from "../services/admin-moderation.service.js";

import {
  adminAbuseReportIdSchema,
  adminAbuseReportListSchema,
  reviewAbuseReportSchema,
} from "../validators/admin-moderation.schemas.js";

function sendValidationError(res, parsed) {
  return res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
}

function handleModerationError(error, res, next) {
  if (
    Number.isInteger(error.statusCode) &&
    typeof error.code === "string"
  ) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  return next(error);
}

export async function listAdminAbuseReports(req, res, next) {
  const parsed = adminAbuseReportListSchema.safeParse(req.query);

  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const result = await getAdminAbuseReports(parsed.data);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleModerationError(error, res, next);
  }
}

export async function getAdminAbuseReport(req, res, next) {
  const parsed = adminAbuseReportIdSchema.safeParse(req.params);

  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const report = await getAdminAbuseReportById(parsed.data.id);

    return res.status(200).json({
      success: true,
      data: {
        report,
      },
    });
  } catch (error) {
    return handleModerationError(error, res, next);
  }
}

export async function reviewAbuseReport(req, res, next) {
  const params = adminAbuseReportIdSchema.safeParse(req.params);
  const body = reviewAbuseReportSchema.safeParse(req.body);

  if (!params.success) {
    return sendValidationError(res, params);
  }

  if (!body.success) {
    return sendValidationError(res, body);
  }

  try {
    const report = await reviewAdminAbuseReport({
      reportId: params.data.id,
      adminUserId: req.user.id,
      status: body.data.status,
      resolutionNote: body.data.resolutionNote,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
    });

    return res.status(200).json({
      success: true,
      message: "Abuse report reviewed successfully.",
      data: {
        report,
      },
    });
  } catch (error) {
    return handleModerationError(error, res, next);
  }
}
