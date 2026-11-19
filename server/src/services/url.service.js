import { prisma } from "../lib/prisma.js";
import { generateShortCode } from "../utils/short-code.utils.js";

const MAX_CODE_GENERATION_ATTEMPTS = 5;

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

  const result = await prisma.shortUrl.deleteMany({
    where: {
      id,
      userId,
    },
  });

  return result.count > 0;
}

export async function resolveShortCode(shortCode) {
  const record = await prisma.shortUrl.findUnique({
    where: { shortCode },
    select: {
      id: true,
      originalUrl: true,
      isActive: true,
      expiresAt: true,
    },
  });

  if (!record || !record.isActive) {
    return null;
  }

  if (record.expiresAt && record.expiresAt <= new Date()) {
    return null;
  }

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
