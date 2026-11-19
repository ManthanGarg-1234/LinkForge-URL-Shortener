
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { generateShortCode } from "../utils/short-code.utils.js";

const MAX_CODE_GENERATION_ATTEMPTS = 5;

const SHORT_URL_CACHE_TTL_SECONDS = 60;
const SHORT_URL_CACHE_PREFIX = "linkforge:short-url:";

function isShortCodeCollision(error) {
  if (error?.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("shortCode");
  }

  return (
    typeof target === "string" && target.toLowerCase().includes("shortcode")
  );
}

const shortUrlSelect = {
  id: true,
  shortCode: true,
  originalUrl: true,
  isActive: true,
  expiresAt: true,
  createdAt: true,
};

const redirectSelect = {
  id: true,
  originalUrl: true,
  isActive: true,
  expiresAt: true,
  moderationStatus: true,
};

const redirectStateSelect = {
  id: true,
  isActive: true,
  expiresAt: true,
  moderationStatus: true,
};

function getCacheKey(shortCode) {
  return `${SHORT_URL_CACHE_PREFIX}${shortCode}`;
}

function isRedisReady() {
  return redis.status === "ready";
}

/**
 * Deletes a cached short URL.
 *
 * Cache invalidation must never cause a successful database
 * operation to fail. Redirect resolution independently verifies
 * moderation state against PostgreSQL.
 */
export async function invalidateShortUrlCache(shortCode) {
  if (!shortCode || !isRedisReady()) {
    return;
  }

  try {
    await redis.del(getCacheKey(shortCode));
  } catch (error) {
    console.warn(
      "Short URL cache invalidation failed:",
      error.message,
    );
  }
}

/**
 * Converts a cached JSON record into the expected redirect shape.
 */
function parseCachedRecord(value) {
  try {
    const record = JSON.parse(value);

    if (
      !record ||
      typeof record.id !== "string" ||
      typeof record.originalUrl !== "string" ||
      record.isActive !== true
    ) {
      return null;
    }

    let expiresAt = null;

    if (record.expiresAt !== null) {
      expiresAt = new Date(record.expiresAt);

      if (Number.isNaN(expiresAt.getTime())) {
        return null;
      }
    }

    return {
      id: record.id,
      originalUrl: record.originalUrl,
      isActive: true,
      expiresAt,
    };
  } catch {
    return null;
  }
}

async function cacheResolvedShortUrl(shortCode, record) {
  if (!isRedisReady()) {
    return;
  }

  let ttl = SHORT_URL_CACHE_TTL_SECONDS;

  if (record.expiresAt) {
    const remainingSeconds = Math.floor(
      (record.expiresAt.getTime() - Date.now()) / 1000,
    );

    if (remainingSeconds <= 0) {
      return;
    }

    ttl = Math.min(ttl, remainingSeconds);
  }

  try {
    await redis.set(
      getCacheKey(shortCode),
      JSON.stringify({
        id: record.id,
        originalUrl: record.originalUrl,
        isActive: record.isActive,
        expiresAt: record.expiresAt
          ? record.expiresAt.toISOString()
          : null,
      }),
      "EX",
      ttl,
    );
  } catch (error) {
    console.warn(
      "Short URL cache write failed:",
      error.message,
    );
  }
}

function isUsableRedirectRecord(record) {
  if (
    !record ||
    record.isActive !== true ||
    record.moderationStatus !== "APPROVED"
  ) {
    return false;
  }

  if (record.expiresAt && record.expiresAt <= new Date()) {
    return false;
  }

  return true;
}

export async function createShortUrl({ userId, originalUrl, expiresAt }) {
  if (!userId || !originalUrl) {
    throw new TypeError("User ID and original URL are required.");
  }

  for (let attempt = 1; attempt <= MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.shortUrl.create({
        data: {
          userId,
          shortCode: generateShortCode(),
          originalUrl,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        select: shortUrlSelect,
      });
    } catch (error) {
      if (isShortCodeCollision(error)) {
        continue;
      }

      throw error;
    }
  }

  const error = new Error(
    "Unable to generate a unique short code. Please try again.",
  );
  error.statusCode = 503;

  throw error;
}

export async function getUserShortUrls({ userId, page = 1, limit = 20 }) {
  if (!userId) {
    throw new TypeError("User ID is required.");
  }

  const [items, total] = await prisma.$transaction([
    prisma.shortUrl.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: shortUrlSelect,
    }),
    prisma.shortUrl.count({
      where: { userId },
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateShortUrlStatus({ userId, id, isActive }) {
  if (!userId || !id || typeof isActive !== "boolean") {
    throw new TypeError("User ID, URL ID, and valid status are required.");
  }

  const existingUrl = await prisma.shortUrl.findFirst({
    where: {
      id,
      userId,
    },
    select: {
      shortCode: true,
    },
  });

  if (!existingUrl) {
    return null;
  }

  const result = await prisma.shortUrl.updateMany({
    where: {
      id,
      userId,
    },
    data: {
      isActive,
    },
  });

  if (result.count === 0) {
    return null;
  }

  await invalidateShortUrlCache(existingUrl.shortCode);

  return prisma.shortUrl.findFirst({
    where: {
      id,
      userId,
    },
    select: shortUrlSelect,
  });
}

export async function deleteShortUrl({ userId, id }) {
  if (!userId || !id) {
    throw new TypeError("User ID and URL ID are required.");
  }

  const existingUrl = await prisma.shortUrl.findFirst({
    where: {
      id,
      userId,
    },
    select: {
      shortCode: true,
    },
  });

  if (!existingUrl) {
    return false;
  }

  const result = await prisma.shortUrl.deleteMany({
    where: {
      id,
      userId,
    },
  });

  if (result.count > 0) {
    await invalidateShortUrlCache(existingUrl.shortCode);
    return true;
  }

  return false;
}

/**
 * Resolves a short code while treating PostgreSQL as the authority
 * for activation, moderation, and expiry state.
 *
 * Redis may supply the cached destination, but a cache hit is never
 * trusted until PostgreSQL confirms that the URL is still usable.
 *
 * A PostgreSQL verification failure propagates to the error handler.
 * It must never result in a redirect based only on cached data.
 */
export async function resolveShortCode(shortCode) {
  if (!shortCode) {
    return null;
  }

  const cacheKey = getCacheKey(shortCode);
  let cachedValue = null;

  // 1. Attempt Redis lookup. Redis failures fall back to PostgreSQL.
  if (isRedisReady()) {
    try {
      cachedValue = await redis.get(cacheKey);
    } catch (error) {
      console.warn(
        "Short URL cache read failed. Falling back to PostgreSQL:",
        error.message,
      );
    }
  }

  // 2. Validate and verify a cached record.
  if (cachedValue !== null) {
    const cachedRecord = parseCachedRecord(cachedValue);

    if (!cachedRecord) {
      await invalidateShortUrlCache(shortCode);
    } else {
      // Reject expired cached records without redirecting.
      if (
        cachedRecord.expiresAt &&
        cachedRecord.expiresAt <= new Date()
      ) {
        await invalidateShortUrlCache(shortCode);
        return null;
      }

      /*
       * Critical security check:
       * Never serve a cached URL without verifying its current
       * activation and moderation state in PostgreSQL.
       *
       * This query intentionally sits outside the Redis error
       * handler. A database failure must not be mistaken for a
       * Redis failure and must not permit a cached redirect.
       */
      const currentState = await prisma.shortUrl.findUnique({
        where: { shortCode },
        select: redirectStateSelect,
      });

      if (
        !currentState ||
        currentState.id !== cachedRecord.id ||
        !isUsableRedirectRecord(currentState)
      ) {
        await invalidateShortUrlCache(shortCode);
        return null;
      }

      return cachedRecord;
    }
  }

  // 3. Cache miss or invalid cache: resolve from PostgreSQL.
  const record = await prisma.shortUrl.findUnique({
    where: { shortCode },
    select: redirectSelect,
  });

  if (!isUsableRedirectRecord(record)) {
    return null;
  }

  // 4. Cache only approved, active, non-expired links.
  const resolvedRecord = {
    id: record.id,
    originalUrl: record.originalUrl,
    isActive: record.isActive,
    expiresAt: record.expiresAt,
  };

  await cacheResolvedShortUrl(shortCode, resolvedRecord);

  return resolvedRecord;
}

export async function recordClick({ shortUrlId, referrerOrigin = null }) {
  if (!shortUrlId) {
    throw new TypeError("Short URL ID is required.");
  }

  return prisma.clickEvent.create({
    data: {
      shortUrlId,
      referrerOrigin,
    },
    select: {
      id: true,
      shortUrlId: true,
      clickedAt: true,
    },
  });
}
