

import {
  blockShortUrl,
  restoreShortUrl,
} from "../services/admin-url-moderation.service.js";

import {
  adminShortCodeSchema,
  blockShortUrlSchema,
} from "../validators/admin-url-moderation.schemas.js";

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

export async function blockAdminShortUrl(req, res, next) {
  const params = adminShortCodeSchema.safeParse(req.params);
  const body = blockShortUrlSchema.safeParse(req.body);

  if (!params.success) return sendValidationError(res, params);
  if (!body.success) return sendValidationError(res, body);

  try {
    const url = await blockShortUrl({
      shortCode: params.data.shortCode,
      adminUserId: req.user.id,
      reason: body.data.reason,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
    });

    return res.status(200).json({
      success: true,
      message: "Short URL blocked successfully.",
      data: { url },
    });
  } catch (error) {
    return handleModerationError(error, res, next);
  }
}

export async function restoreAdminShortUrl(req, res, next) {
  const params = adminShortCodeSchema.safeParse(req.params);

  if (!params.success) return sendValidationError(res, params);

  try {
    const url = await restoreShortUrl({
      shortCode: params.data.shortCode,
      adminUserId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
    });

    return res.status(200).json({
      success: true,
      message: "Short URL restored successfully.",
      data: { url },
    });
  } catch (error) {
    return handleModerationError(error, res, next);
  }
}
