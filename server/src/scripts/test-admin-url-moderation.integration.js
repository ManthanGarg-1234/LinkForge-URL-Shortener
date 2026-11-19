
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.js";
import {
  connectRedis,
  disconnectRedis,
  redis,
} from "../lib/redis.js";

import {
  blockShortUrl,
  restoreShortUrl,
} from "../services/admin-url-moderation.service.js";

import { resolveShortCode } from "../services/url.service.js";

const TEST_DATABASE_NAME = "linkforge_admin_test";
const CACHE_PREFIX = "linkforge:short-url:";

const createdUrlIds = [];
const createdShortCodes = [];

let adminId;
let ownerId;

function verifyTestDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const databaseUrl = new URL(connectionString);
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "");

  if (
    !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) ||
    databaseName !== TEST_DATABASE_NAME
  ) {
    throw new Error(
      `Safety check failed. This script only runs against the local ${TEST_DATABASE_NAME} database.`,
    );
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Integration tests cannot run in production.");
  }

  console.log("Database safety check passed.");
  console.log(`Target database: ${databaseName}`);
}

function createShortCode() {
  return randomUUID().replaceAll("-", "").slice(0, 8);
}

async function createTestUrl({ isActive, label }) {
  const shortCode = createShortCode();

  const url = await prisma.shortUrl.create({
    data: {
      userId: ownerId,
      shortCode,
      originalUrl: `https://example.com/linkforge-integration-${label}`,
      isActive,
    },
    select: {
      id: true,
      shortCode: true,
      originalUrl: true,
      isActive: true,
      moderationStatus: true,
    },
  });

  createdUrlIds.push(url.id);
  createdShortCodes.push(shortCode);

  return url;
}

async function verifyAuditRecords(urlId, expectedActivationState) {
  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: "SHORT_URL",
      entityId: urlId,
      actorUserId: adminId,
      action: {
        in: ["SHORT_URL_BLOCKED", "SHORT_URL_RESTORED"],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      action: true,
      metadata: true,
      actorUserId: true,
      createdAt: true,
    },
  });

  assert.equal(logs.length, 2);
  assert.equal(logs[0].action, "SHORT_URL_BLOCKED");
  assert.equal(logs[1].action, "SHORT_URL_RESTORED");

  for (const log of logs) {
    assert.equal(log.actorUserId, adminId);
    assert.ok(log.createdAt instanceof Date);
    assert.equal(
      log.metadata.ownerActivationStatePreserved,
      expectedActivationState,
    );
  }

  return logs;
}

async function verifyActiveUrlModeration() {
  console.log("\n========== ACTIVE URL MODERATION ==========");

  const url = await createTestUrl({
    isActive: true,
    label: "active",
  });

  assert.equal(url.isActive, true);
  assert.equal(url.moderationStatus, "APPROVED");

  // Resolve once to populate the real Redis cache.
  const initialResolution = await resolveShortCode(url.shortCode);

  assert.ok(initialResolution);
  assert.equal(initialResolution.id, url.id);
  assert.equal(initialResolution.originalUrl, url.originalUrl);

  const cacheKey = `${CACHE_PREFIX}${url.shortCode}`;

  const initialCacheValue = await redis.get(cacheKey);

  assert.ok(initialCacheValue, "Initial Redis cache entry was not created.");

  console.log("PASS: Approved URL resolves successfully.");
  console.log("PASS: Redis cache entry created.");

  // Block the URL using the actual moderation service.
  const blocked = await blockShortUrl({
    shortCode: url.shortCode,
    adminUserId: adminId,
    reason: "Integration test confirmed malicious destination.",
    ipAddress: "127.0.0.1",
    userAgent: "LinkForge moderation integration test",
  });

  assert.equal(blocked.moderationStatus, "BLOCKED");
  assert.equal(blocked.isActive, true);
  assert.equal(blocked.moderatedByAdminId, adminId);
  assert.ok(blocked.moderatedAt);
  assert.equal(
    blocked.moderationReason,
    "Integration test confirmed malicious destination.",
  );

  const blockedDatabaseRecord = await prisma.shortUrl.findUnique({
    where: {
      id: url.id,
    },
    select: {
      moderationStatus: true,
      isActive: true,
      moderatedByAdminId: true,
    },
  });

  assert.equal(blockedDatabaseRecord.moderationStatus, "BLOCKED");
  assert.equal(blockedDatabaseRecord.isActive, true);
  assert.equal(blockedDatabaseRecord.moderatedByAdminId, adminId);

  console.log("PASS: PostgreSQL URL moderation state committed.");
  console.log("PASS: Blocking preserved owner activation state.");

  // The normal invalidation path should remove the cache entry.
  const cacheAfterBlock = await redis.get(cacheKey);

  assert.equal(cacheAfterBlock, null);

  console.log("PASS: Blocking invalidated the Redis cache.");

  // Deliberately reinsert a stale cached record.
  // This simulates failed or missed cache invalidation.
  await redis.set(
    cacheKey,
    JSON.stringify({
      id: url.id,
      originalUrl: url.originalUrl,
      isActive: true,
      expiresAt: null,
    }),
    "EX",
    60,
  );

  assert.ok(await redis.get(cacheKey));

  // PostgreSQL must reject the stale cached redirect.
  const blockedResolution = await resolveShortCode(url.shortCode);

  assert.equal(blockedResolution, null);

  const cacheAfterStaleCheck = await redis.get(cacheKey);

  assert.equal(cacheAfterStaleCheck, null);

  console.log("PASS: Stale Redis cache cannot bypass URL blocking.");
  console.log("PASS: Blocked URL does not resolve.");

  // Restore the URL.
  const restored = await restoreShortUrl({
    shortCode: url.shortCode,
    adminUserId: adminId,
    ipAddress: "127.0.0.1",
    userAgent: "LinkForge moderation integration test",
  });

  assert.equal(restored.moderationStatus, "APPROVED");
  assert.equal(restored.isActive, true);
  assert.equal(restored.moderatedAt, null);
  assert.equal(restored.moderationReason, null);
  assert.equal(restored.moderatedByAdminId, null);

  console.log("PASS: URL restored and moderation metadata cleared.");

  // A restored, owner-active URL must resolve again.
  const restoredResolution = await resolveShortCode(url.shortCode);

  assert.ok(restoredResolution);
  assert.equal(restoredResolution.id, url.id);
  assert.equal(restoredResolution.originalUrl, url.originalUrl);

  console.log("PASS: Restored active URL resolves successfully.");

  const auditLogs = await verifyAuditRecords(url.id, true);

  assert.equal(
    auditLogs[0].metadata.reason,
    "Integration test confirmed malicious destination.",
  );

  console.log("PASS: Block and restore audit records verified.");
}

async function verifyOwnerDisabledUrlModeration() {
  console.log("\n========== OWNER-DISABLED URL MODERATION ==========");

  const url = await createTestUrl({
    isActive: false,
    label: "owner-disabled",
  });

  assert.equal(url.isActive, false);
  assert.equal(url.moderationStatus, "APPROVED");

  // Owner-disabled URLs must not resolve before moderation.
  const initialResolution = await resolveShortCode(url.shortCode);

  assert.equal(initialResolution, null);

  console.log("PASS: Owner-disabled URL does not resolve.");

  const blocked = await blockShortUrl({
    shortCode: url.shortCode,
    adminUserId: adminId,
    reason: "Integration test disabled URL moderation.",
    ipAddress: "127.0.0.1",
    userAgent: "LinkForge moderation integration test",
  });

  assert.equal(blocked.moderationStatus, "BLOCKED");
  assert.equal(blocked.isActive, false);

  console.log("PASS: Blocking preserved the disabled state.");

  const restored = await restoreShortUrl({
    shortCode: url.shortCode,
    adminUserId: adminId,
    ipAddress: "127.0.0.1",
    userAgent: "LinkForge moderation integration test",
  });

  assert.equal(restored.moderationStatus, "APPROVED");
  assert.equal(restored.isActive, false);

  const databaseRecord = await prisma.shortUrl.findUnique({
    where: {
      id: url.id,
    },
    select: {
      moderationStatus: true,
      isActive: true,
      moderatedAt: true,
      moderationReason: true,
      moderatedByAdminId: true,
    },
  });

  assert.equal(databaseRecord.moderationStatus, "APPROVED");
  assert.equal(databaseRecord.isActive, false);
  assert.equal(databaseRecord.moderatedAt, null);
  assert.equal(databaseRecord.moderationReason, null);
  assert.equal(databaseRecord.moderatedByAdminId, null);

  // Restoration must not override the owner's disabled state.
  const finalResolution = await resolveShortCode(url.shortCode);

  assert.equal(finalResolution, null);

  console.log("PASS: Restoration did not reactivate the owner's URL.");
  console.log("PASS: Restored owner-disabled URL still does not resolve.");

  await verifyAuditRecords(url.id, false);

  console.log("PASS: Owner-disabled URL audit records verified.");
}

async function cleanup() {
  console.log("\nCleaning up temporary integration-test records...");

  try {
    if (redis.status === "ready" && createdShortCodes.length > 0) {
      await redis.del(
        ...createdShortCodes.map(
          (shortCode) => `${CACHE_PREFIX}${shortCode}`,
        ),
      );
    }

    const temporaryUserIds = [ownerId, adminId].filter(Boolean);

    // Delete only audit records belonging to these test URLs
    // or created by this temporary administrator.
    if (temporaryUserIds.length > 0 || createdUrlIds.length > 0) {
      const conditions = [];

      if (createdUrlIds.length > 0) {
        conditions.push({
          entityType: "SHORT_URL",
          entityId: {
            in: createdUrlIds,
          },
        });
      }

      if (adminId) {
        conditions.push({
          actorUserId: adminId,
        });
      }

      if (conditions.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: conditions,
          },
        });
      }
    }

    if (createdUrlIds.length > 0) {
      await prisma.shortUrl.deleteMany({
        where: {
          id: {
            in: createdUrlIds,
          },
        },
      });
    }

    if (temporaryUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: temporaryUserIds,
          },
        },
      });
    }

    console.log("PASS: Temporary integration-test records cleaned up.");
  } catch (error) {
    console.error("WARNING: Integration-test cleanup failed:", error);
    throw error;
  }
}

async function main() {
  let testPassed = false;

  try {
    // Check the target database before opening any connections.
    verifyTestDatabase();

    await prisma.$connect();

    const redisConnected = await connectRedis();

    if (!redisConnected || redis.status !== "ready") {
      throw new Error(
        "Redis is required for this integration test but is unavailable.",
      );
    }

    console.log("PostgreSQL connection established.");
    console.log("Redis connection established.");

    const uniqueId = randomUUID();

    const admin = await prisma.user.create({
      data: {
        email: `url-moderation-admin-${uniqueId}@linkforge.test`,
        name: "URL Moderation Integration Admin",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    adminId = admin.id;

    const owner = await prisma.user.create({
      data: {
        email: `url-moderation-owner-${uniqueId}@linkforge.test`,
        name: "URL Moderation Integration Owner",
        role: "USER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    ownerId = owner.id;

    console.log("Temporary administrator and URL owner created.");

    await verifyActiveUrlModeration();
    await verifyOwnerDisabledUrlModeration();

    testPassed = true;
  } finally {
    try {
      await cleanup();
    } finally {
      await disconnectRedis();
      await prisma.$disconnect();
    }
  }

  if (testPassed) {
    console.log("\n==============================================");
    console.log(" ADMIN URL MODERATION INTEGRATION TEST");
    console.log(" RESULT: ALL CHECKS PASSED");
    console.log("==============================================");
  }
}

main().catch((error) => {
  console.error("\nINTEGRATION TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});

