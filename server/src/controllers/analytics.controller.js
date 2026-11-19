
import { analyticsLinkIdSchema } from "../validators/analytics.schemas.js";

import {
  getAnalyticsOverview,
  getLinkAnalytics,
} from "../services/analytics.service.js";

export async function getOverview(req, res) {
  const analytics = await getAnalyticsOverview({
    userId: req.user.id,
  });

  return res.status(200).json({
    success: true,
    data: analytics,
  });
}

export async function getLinkDetails(req, res) {
  const parsed = analyticsLinkIdSchema.safeParse(req.params);

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

  const analytics = await getLinkAnalytics({
    userId: req.user.id,
    id: parsed.data.id,
  });

  if (!analytics) {
    return res.status(404).json({
      success: false,
      error: {
        code: "SHORT_URL_NOT_FOUND",
        message: "This short URL does not exist or is unavailable.",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: analytics,
  });
}
