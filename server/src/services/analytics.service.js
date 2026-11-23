
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
    const bucket = {
      date: key,
      clicks: 0,
    };

    buckets.push(bucket);
    counts.set(key, bucket);
  }

  return { buckets, counts };
}

function applyDailyAggregates(counts, dailyRows) {
  for (const row of dailyRows) {
    const bucket = counts.get(row.date);

    if (bucket) {
      bucket.clicks = Number(row.clicks);
    }
  }
}

function mapReferrerAggregates(rows) {
  return rows
    .map((row) => ({
      referrer: row.referrer,
      clicks: Number(row.clicks),
    }))
    .sort(
      (a, b) =>
        b.clicks - a.clicks ||
        a.referrer.localeCompare(b.referrer),
    );
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
    dailyRows,
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

    prisma.$queryRaw`
      SELECT
        TO_CHAR(
          DATE_TRUNC(
            'day',
            ce."clickedAt" AT TIME ZONE 'UTC'
          ),
          'YYYY-MM-DD'
        ) AS date,
        COUNT(*) AS clicks
      FROM "click_events" AS ce
      INNER JOIN "short_urls" AS su
        ON su."id" = ce."shortUrlId"
      WHERE
        su."userId" = ${userId}
        AND ce."clickedAt" >= ${startDate}
      GROUP BY
        DATE_TRUNC(
          'day',
          ce."clickedAt" AT TIME ZONE 'UTC'
        )
      ORDER BY
        DATE_TRUNC(
          'day',
          ce."clickedAt" AT TIME ZONE 'UTC'
        ) ASC
    `,

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

  applyDailyAggregates(counts, dailyRows);

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

  const [totalClicks, dailyRows, referrerRows] = await Promise.all([
    prisma.clickEvent.count({
      where: {
        shortUrlId: id,
      },
    }),

    prisma.$queryRaw`
      SELECT
        TO_CHAR(
          DATE_TRUNC(
            'day',
            "clickedAt" AT TIME ZONE 'UTC'
          ),
          'YYYY-MM-DD'
        ) AS date,
        COUNT(*) AS clicks
      FROM "click_events"
      WHERE
        "shortUrlId" = ${id}
        AND "clickedAt" >= ${startDate}
      GROUP BY
        DATE_TRUNC(
          'day',
          "clickedAt" AT TIME ZONE 'UTC'
        )
      ORDER BY
        DATE_TRUNC(
          'day',
          "clickedAt" AT TIME ZONE 'UTC'
        ) ASC
    `,

    prisma.$queryRaw`
      SELECT
        COALESCE(
          NULLIF("referrerOrigin", ''),
          'Direct / Unknown'
        ) AS referrer,
        COUNT(*) AS clicks
      FROM "click_events"
      WHERE
        "shortUrlId" = ${id}
        AND "clickedAt" >= ${startDate}
      GROUP BY
        COALESCE(
          NULLIF("referrerOrigin", ''),
          'Direct / Unknown'
        )
    `,
  ]);

  const { buckets, counts } = createDailyBuckets(startDate);

  applyDailyAggregates(counts, dailyRows);

  const referrers = mapReferrerAggregates(referrerRows);

  const clicksLast30Days = dailyRows.reduce(
    (total, row) => total + Number(row.clicks),
    0,
  );

  return {
    link,
    summary: {
      totalClicks,
      clicksLast30Days,
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
