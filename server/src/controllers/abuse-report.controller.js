import { createAbuseReport } from "../services/abuse-report.service.js";
import { createAbuseReportSchema } from "../validators/abuse-report.schemas.js";

export async function submitAbuseReport(req, res, next) {
  const parsed = createAbuseReportSchema.safeParse(req.body);

  if (!parsed.success) {
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

  try {
    const report = await createAbuseReport({
      ...parsed.data,
      reporterUserId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: "Abuse report submitted successfully.",
      data: {
        report,
      },
    });
  } catch (error) {
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
}