
import { env } from "../config/env.js";

import { enqueueClick } from "../lib/click-queue.js";

import {
  createShortUrlSchema,
  listShortUrlsSchema,
  shortUrlIdSchema,
  updateShortUrlStatusSchema,
} from "../validators/url.schemas.js";

import {
  createShortUrl,
  getUserShortUrls,
  updateShortUrlStatus,
  deleteShortUrl,
  resolveShortCode,
  recordClick,
} from "../services/url.service.js";

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
}

function createShortUrlResponse(record) {
  return {
    ...record,
    shortUrl: new URL(`/${record.shortCode}`, env.APP_BASE_URL).toString(),
  };
}

function getReferrerOrigin(referrer) {
  if (typeof referrer !== "string" || !referrer.trim()) {
    return null;
  }

  try {
    const parsed = new URL(referrer);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.origin.slice(0, 255);
  } catch {
    return null;
  }
}

export async function createUrl(req, res) {
  const parsed = createShortUrlSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const record = await createShortUrl({
    userId: req.user.id,
    originalUrl: parsed.data.originalUrl,
    expiresAt: parsed.data.expiresAt,
  });

  return res.status(201).json({
    success: true,
    message: "Short URL created successfully.",
    data: {
      url: createShortUrlResponse(record),
    },
  });
}

export async function listUrls(req, res) {
  const parsed = listShortUrlsSchema.safeParse(req.query);

  if (!parsed.success) {
    return validationError(res, parsed.error);
  }

  const result = await getUserShortUrls({
    userId: req.user.id,
    page: parsed.data.page,
    limit: parsed.data.limit,
  });

  return res.status(200).json({
    success: true,
    data: {
      urls: result.items.map(createShortUrlResponse),
      pagination: result.pagination,
    },
  });
}

export async function updateUrlStatus(req, res) {
  const params = shortUrlIdSchema.safeParse(req.params);

  if (!params.success) {
    return validationError(res, params.error);
  }

  const body = updateShortUrlStatusSchema.safeParse(req.body);

  if (!body.success) {
    return validationError(res, body.error);
  }

  const record = await updateShortUrlStatus({
    userId: req.user.id,
    id: params.data.id,
    isActive: body.data.isActive,
  });

  if (!record) {
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
    message: `Short URL ${record.isActive ? "activated" : "deactivated"} successfully.`,
    data: {
      url: createShortUrlResponse(record),
    },
  });
}

export async function deleteUrl(req, res) {
  const params = shortUrlIdSchema.safeParse(req.params);

  if (!params.success) {
    return validationError(res, params.error);
  }

  const deleted = await deleteShortUrl({
    userId: req.user.id,
    id: params.data.id,
  });

  if (!deleted) {
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
    message: "Short URL deleted successfully.",
  });
}

export async function redirectShortUrl(req, res) {
  const { shortCode } = req.params;

  if (!/^[0-9A-Za-z]{8}$/.test(shortCode)) {
    return res.status(404).json({
      success: false,
      error: {
        code: "SHORT_URL_NOT_FOUND",
        message: "This short URL does not exist or is unavailable.",
      },
    });
  }

  const record = await resolveShortCode(shortCode);

  if (!record) {
    return res.status(404).json({
      success: false,
      error: {
        code: "SHORT_URL_NOT_FOUND",
        message: "This short URL does not exist or is unavailable.",
      },
    });
  }

  const clickEvent = {
    shortUrlId: record.id,
    referrerOrigin: getReferrerOrigin(req.get("referer")),
  };

  try {
    // Queue submission is awaited, but click processing is asynchronous.
    await enqueueClick(clickEvent);
  } catch (queueError) {
    console.error(
      "Click queue submission failed. Falling back to PostgreSQL:",
      queueError.message,
    );

    // Preserve click tracking when Redis or BullMQ is unavailable.
    try {
      await recordClick(clickEvent);
    } catch (databaseError) {
      console.error(
        "Click analytics fallback failed:",
        databaseError.message,
      );
    }
  }

  res.set("Cache-Control", "no-store");

  return res.redirect(302, record.originalUrl);
}
