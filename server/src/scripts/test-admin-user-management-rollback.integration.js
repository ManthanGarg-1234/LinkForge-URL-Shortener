
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.js";

import {
  suspendAdminManagedUser,
} from "../services/admin.service.js";

function verifyTestDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const databaseUrl = new URL(connectionString);
  const databaseName = databaseUrl.pathname.replace(/^\/+/, "");

  if (
    !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) ||
    databaseName !== "linkforge_admin_test"
  ) {
    throw new Error(
      "Safety check failed. This script only runs against the local linkforge_admin_test database."
    );
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Integration tests cannot run in production.");
  }

  console.log("Database safety check passed.");
  console.log(`Target database: ${databaseName}`);
}

async function main() {
  let targetUserId;
  let sessionId;

  try {
    verifyTestDatabase();

    await prisma.$connect();

    const uniqueId = randomUUID();

    const targetUser = await prisma.user.create({
      data: {
        email: `rollback-user-${uniqueId}@linkforge.test`,
        name: "Rollback Integration User",
        role: "USER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    targetUserId = targetUser.id;

    const session = await prisma.session.create({
      data: {
        userId: targetUserId,
        userAgent: "Rollback Integration Test",
        ipAddress: "127.0.0.1",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
      },
    });

    sessionId = session.id;

    await prisma.refreshToken.create({
      data: {
        sessionId,
        tokenHash: createHash("sha256")
          .update(randomUUID())
          .digest("hex"),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    console.log("\nTemporary user, session and refresh token created.");

    // This UUID deliberately does not belong to an existing administrator.
    // The audit-log foreign key should reject it.
    const nonexistentAdminId = randomUUID();

    let suspensionError = null;

    try {
      await suspendAdminManagedUser({
        targetUserId,
        adminUserId: nonexistentAdminId,
        reason: "Rollback integration test verification.",
        ipAddress: "127.0.0.1",
        userAgent: "LinkForge rollback integration test",
      });
    } catch (error) {
      suspensionError = error;
    }

    assert.ok(
      suspensionError,
      "Expected suspension transaction to fail when audit actor does not exist."
    );

    console.log("\nSuspension transaction failed as expected.");
    console.log("Database error code:", suspensionError.code ?? "Unavailable");

    // Verify the user update was rolled back.
    const userAfterFailure = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        status: true,
        suspendedAt: true,
        suspensionReason: true,
        suspendedByAdminId: true,
      },
    });

    assert.equal(userAfterFailure.status, "ACTIVE");
    assert.equal(userAfterFailure.suspendedAt, null);
    assert.equal(userAfterFailure.suspensionReason, null);
    assert.equal(userAfterFailure.suspendedByAdminId, null);

    console.log("PASS: User status update rolled back.");

    // Verify the session revocation was rolled back.
    const sessionAfterFailure = await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        revokedAt: true,
      },
    });

    assert.equal(sessionAfterFailure.revokedAt, null);

    console.log("PASS: Session revocation rolled back.");

    // Verify the refresh-token revocation was rolled back.
    const refreshTokenAfterFailure = await prisma.refreshToken.findFirst({
      where: {
        sessionId,
      },
      select: {
        revokedAt: true,
      },
    });

    assert.ok(refreshTokenAfterFailure);
    assert.equal(refreshTokenAfterFailure.revokedAt, null);

    console.log("PASS: Refresh-token revocation rolled back.");

    // No suspension audit record should have been committed.
    const auditCount = await prisma.auditLog.count({
      where: {
        entityType: "USER",
        entityId: targetUserId,
        action: "USER_SUSPENDED",
      },
    });

    assert.equal(auditCount, 0);

    console.log("PASS: No partial suspension audit record exists.");

    console.log("\n========================================");
    console.log(" ADMIN SUSPENSION ROLLBACK TEST");
    console.log(" RESULT: ALL CHECKS PASSED");
    console.log("========================================");
  } finally {
    console.log("\nCleaning up temporary integration-test records...");

    if (targetUserId) {
      await prisma.auditLog.deleteMany({
        where: {
          entityId: targetUserId,
          entityType: "USER",
        },
      });

      if (sessionId) {
        await prisma.refreshToken.deleteMany({
          where: {
            sessionId,
          },
        });

        await prisma.session.deleteMany({
          where: {
            id: sessionId,
            userId: targetUserId,
          },
        });
      }

      await prisma.user.deleteMany({
        where: {
          id: targetUserId,
        },
      });
    }

    console.log("Temporary records cleaned up.");

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nROLLBACK INTEGRATION TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});
