
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
 * operation to fail.
 */
async function invalidateShortUrlCache(shortCode) {
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
 * Converts a cached JSON record into the same shape returned
 * by the PostgreSQL query.
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

  // Fetch the owner's short code before changing its status.
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

  // Invalidate cached redirect data after the database update.
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

  // Retrieve the short code while enforcing ownership.
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

export async function resolveShortCode(shortCode) {
  if (!shortCode) {
    return null;
  }

  const cacheKey = getCacheKey(shortCode);

  // 1. Attempt Redis cache lookup.
  if (isRedisReady()) {
    try {
      const cachedValue = await redis.get(cacheKey);

      if (cachedValue !== null) {
        const cachedRecord = parseCachedRecord(cachedValue);

        if (cachedRecord) {
          // Check expiry again before serving cached data.
          if (
            cachedRecord.expiresAt &&
            cachedRecord.expiresAt <= new Date()
          ) {
            await redis.del(cacheKey);
            return null;
          }

          return cachedRecord;
        }

        // Invalid cache data: remove it and use PostgreSQL.
        await redis.del(cacheKey);
      }
    } catch (error) {
      console.warn(
        "Short URL cache read failed. Falling back to PostgreSQL:",
        error.message,
      );
    }
  }

  // 2. PostgreSQL remains the source of truth.
  const record = await prisma.shortUrl.findUnique({
    where: { shortCode },
    select: redirectSelect,
  });

  if (!record || !record.isActive) {
    return null;
  }

  if (record.expiresAt && record.expiresAt <= new Date()) {
    return null;
  }

  // 3. Cache only successfully resolved active links.
  await cacheResolvedShortUrl(shortCode, record);

  return record;
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
