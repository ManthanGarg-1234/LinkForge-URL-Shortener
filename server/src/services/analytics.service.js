
import { prisma } from "../lib/prisma.js";

const ANALYTICS_DAYS = 30;
const TOP_LINKS_LIMIT = 5;

function getAnalyticsStartDate() {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );

  start.setUTCDate(start.getUTCDate() - (ANALYTICS_DAYS - 1));

  return start;
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function createDailyBuckets(startDate) {
  const buckets = [];
  const counts = new Map();

  for (let index = 0; index < ANALYTICS_DAYS; index += 1) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + index);

    const key = formatUtcDate(date);

    buckets.push({
      date: key,
      clicks: 0,
    });

    counts.set(key, buckets[buckets.length - 1]);
  }

  return { buckets, counts };
}

function incrementDailyCount(counts, clickedAt) {
  const key = formatUtcDate(clickedAt);
  const bucket = counts.get(key);

  if (bucket) {
    bucket.clicks += 1;
  }
}

export async function getAnalyticsOverview({ userId }) {
  if (!userId) {
    throw new TypeError("User ID is required.");
  }

  const startDate = getAnalyticsStartDate();

  const [
    totalLinks,
    activeLinks,
    totalClicks,
    dailyEvents,
    topLinkGroups,
  ] = await Promise.all([
    prisma.shortUrl.count({
      where: { userId },
    }),

    prisma.shortUrl.count({
      where: {
        userId,
        isActive: true,
      },
    }),

    prisma.clickEvent.count({
      where: {
        shortUrl: {
          is: { userId },
        },
      },
    }),

    prisma.clickEvent.findMany({
      where: {
        shortUrl: {
          is: { userId },
        },
        clickedAt: {
          gte: startDate,
        },
      },
      select: {
        clickedAt: true,
      },
    }),

    prisma.clickEvent.groupBy({
      by: ["shortUrlId"],
      where: {
        shortUrl: {
          is: { userId },
        },
      },
      _count: {
        shortUrlId: true,
      },
      orderBy: {
        _count: {
          shortUrlId: "desc",
        },
      },
      take: TOP_LINKS_LIMIT,
    }),
  ]);

  const { buckets, counts } = createDailyBuckets(startDate);

  for (const event of dailyEvents) {
    incrementDailyCount(counts, event.clickedAt);
  }

  const topLinkIds = topLinkGroups.map(
    (group) => group.shortUrlId,
  );

  const topLinkRecords = topLinkIds.length
    ? await prisma.shortUrl.findMany({
        where: {
          userId,
          id: {
            in: topLinkIds,
          },
        },
        select: {
          id: true,
          shortCode: true,
          originalUrl: true,
          isActive: true,
        },
      })
    : [];

  const topLinkMap = new Map(
    topLinkRecords.map((record) => [record.id, record]),
  );

  const topLinks = topLinkGroups
    .map((group) => {
      const record = topLinkMap.get(group.shortUrlId);

      if (!record) {
        return null;
      }

      return {
        ...record,
        clicks: group._count.shortUrlId,
      };
    })
    .filter(Boolean);

  return {
    summary: {
      totalLinks,
      activeLinks,
      totalClicks,
    },
    dailyClicks: buckets,
    topLinks,
    period: {
      days: ANALYTICS_DAYS,
      startDate: formatUtcDate(startDate),
      endDate: formatUtcDate(
        new Date(
          Date.UTC(
            startDate.getUTCFullYear(),
            startDate.getUTCMonth(),
            startDate.getUTCDate() + ANALYTICS_DAYS - 1,
          ),
        ),
      ),
      timezone: "UTC",
    },
  };
}

export async function getLinkAnalytics({ userId, id }) {
  if (!userId || !id) {
    throw new TypeError("User ID and URL ID are required.");
  }

  const link = await prisma.shortUrl.findFirst({
    where: {
      id,
      userId,
    },
    select: {
      id: true,
      shortCode: true,
      originalUrl: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!link) {
    return null;
  }

  const startDate = getAnalyticsStartDate();

  const [totalClicks, recentEvents] = await Promise.all([
    prisma.clickEvent.count({
      where: {
        shortUrlId: id,
      },
    }),

    prisma.clickEvent.findMany({
      where: {
        shortUrlId: id,
        clickedAt: {
          gte: startDate,
        },
      },
      select: {
        clickedAt: true,
        referrerOrigin: true,
      },
      orderBy: {
        clickedAt: "desc",
      },
    }),
  ]);

  const { buckets, counts } = createDailyBuckets(startDate);

  const referrerCounts = new Map();

  for (const event of recentEvents) {
    incrementDailyCount(counts, event.clickedAt);

    const referrer = event.referrerOrigin || "Direct / Unknown";

    referrerCounts.set(
      referrer,
      (referrerCounts.get(referrer) || 0) + 1,
    );
  }

  const referrers = [...referrerCounts.entries()]
    .map(([referrer, clicks]) => ({
      referrer,
      clicks,
    }))
    .sort(
      (a, b) =>
        b.clicks - a.clicks ||
        a.referrer.localeCompare(b.referrer),
    );

  return {
    link,
    summary: {
      totalClicks,
      clicksLast30Days: recentEvents.length,
    },
    dailyClicks: buckets,
    referrers,
    period: {
      days: ANALYTICS_DAYS,
      startDate: formatUtcDate(startDate),
      timezone: "UTC",
    },
  };
}
