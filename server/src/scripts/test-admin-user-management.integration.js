
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.js";

import {
  suspendAdminManagedUser,
  reactivateAdminManagedUser,
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
  let adminId;
  let targetUserId;
  const sessionIds = [];

  try {
    verifyTestDatabase();

    await prisma.$connect();

    const uniqueId = randomUUID();

    // Create a temporary administrator exclusively for this test.
    const admin = await prisma.user.create({
      data: {
        email: `integration-admin-${uniqueId}@linkforge.test`,
        name: "Integration Test Admin",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    adminId = admin.id;

    // Create a temporary regular user.
    const targetUser = await prisma.user.create({
      data: {
        email: `integration-user-${uniqueId}@linkforge.test`,
        name: "Integration Test User",
        role: "USER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    targetUserId = targetUser.id;

    console.log("\nTemporary accounts created.");

    // Create two active sessions and one refresh token per session.
    for (let index = 0; index < 2; index += 1) {
      const session = await prisma.session.create({
        data: {
          userId: targetUserId,
          userAgent: `Integration Test Browser ${index + 1}`,
          ipAddress: "127.0.0.1",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        select: {
          id: true,
        },
      });

      sessionIds.push(session.id);

      const tokenHash = createHash("sha256")
        .update(randomUUID())
        .digest("hex");

      await prisma.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    console.log("Created two active sessions and two refresh tokens.");

    // Verify initial fixture state.
    const initialSessions = await prisma.session.count({
      where: {
        userId: targetUserId,
        revokedAt: null,
      },
    });

    const initialTokens = await prisma.refreshToken.count({
      where: {
        sessionId: {
          in: sessionIds,
        },
        revokedAt: null,
      },
    });

    assert.equal(initialSessions, 2);
    assert.equal(initialTokens, 2);

    // Suspend the test user through the actual admin service.
    await suspendAdminManagedUser({
      targetUserId,
      adminUserId: adminId,
      reason: "Integration test suspension verification.",
      ipAddress: "127.0.0.1",
      userAgent: "LinkForge integration test",
    });

    console.log("\nSuspension service executed.");

    // Verify user status and suspension metadata.
    const suspendedUser = await prisma.user.findUnique({
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

    assert.equal(suspendedUser.status, "SUSPENDED");
    assert.ok(suspendedUser.suspendedAt);
    assert.equal(
      suspendedUser.suspensionReason,
      "Integration test suspension verification."
    );
    assert.equal(suspendedUser.suspendedByAdminId, adminId);

    // Verify all sessions were revoked.
    const revokedSessions = await prisma.session.count({
      where: {
        userId: targetUserId,
        revokedAt: {
          not: null,
        },
      },
    });

    assert.equal(revokedSessions, 2);

    // Verify all refresh tokens were revoked.
    const revokedTokens = await prisma.refreshToken.count({
      where: {
        sessionId: {
          in: sessionIds,
        },
        revokedAt: {
          not: null,
        },
      },
    });

    assert.equal(revokedTokens, 2);

    // Verify the suspension audit record.
    const suspensionAudit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: adminId,
        entityType: "USER",
        entityId: targetUserId,
        action: "USER_SUSPENDED",
      },
    });

    assert.ok(suspensionAudit, "Suspension audit log was not created.");

    console.log("PASS: User suspension and metadata.");
    console.log("PASS: All two sessions revoked.");
    console.log("PASS: All two refresh tokens revoked.");
    console.log("PASS: Suspension audit log created.");

    // Reactivate the test user.
    await reactivateAdminManagedUser({
      targetUserId,
      adminUserId: adminId,
      ipAddress: "127.0.0.1",
      userAgent: "LinkForge integration test",
    });

    console.log("\nReactivation service executed.");

    const reactivatedUser = await prisma.user.findUnique({
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

    assert.equal(reactivatedUser.status, "ACTIVE");
    assert.equal(reactivatedUser.suspendedAt, null);
    assert.equal(reactivatedUser.suspensionReason, null);
    assert.equal(reactivatedUser.suspendedByAdminId, null);

    // Reactivation must never restore previously revoked sessions.
    const sessionsAfterReactivation = await prisma.session.count({
      where: {
        userId: targetUserId,
        revokedAt: {
          not: null,
        },
      },
    });

    const tokensAfterReactivation = await prisma.refreshToken.count({
      where: {
        sessionId: {
          in: sessionIds,
        },
        revokedAt: {
          not: null,
        },
      },
    });

    assert.equal(sessionsAfterReactivation, 2);
    assert.equal(tokensAfterReactivation, 2);

    // Verify the reactivation audit record.
    const reactivationAudit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: adminId,
        entityType: "USER",
        entityId: targetUserId,
        action: "USER_REACTIVATED",
      },
    });

    assert.ok(reactivationAudit, "Reactivation audit log was not created.");

    console.log("PASS: User reactivated successfully.");
    console.log("PASS: Suspension metadata cleared.");
    console.log("PASS: Previously revoked sessions remain revoked.");
    console.log("PASS: Previously revoked refresh tokens remain revoked.");
    console.log("PASS: Reactivation audit log created.");

    console.log("\n========================================");
    console.log(" ADMIN USER MANAGEMENT INTEGRATION TEST");
    console.log(" RESULT: ALL CHECKS PASSED");
    console.log("========================================");
  } finally {
    console.log("\nCleaning up temporary integration-test records...");

    if (targetUserId || adminId) {
      const temporaryUserIds = [targetUserId, adminId].filter(Boolean);

      // Remove only audit records created for these temporary accounts.
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            {
              entityId: {
                in: temporaryUserIds,
              },
            },
            ...(adminId ? [{ actorUserId: adminId }] : []),
          ],
        },
      });

      // Remove only the sessions created by this script.
      if (sessionIds.length > 0) {
        await prisma.refreshToken.deleteMany({
          where: {
            sessionId: {
              in: sessionIds,
            },
          },
        });

        await prisma.session.deleteMany({
          where: {
            id: {
              in: sessionIds,
            },
          },
        });
      }

      // Remove only the two temporary accounts.
      if (targetUserId) {
        await prisma.user.deleteMany({
          where: {
            id: targetUserId,
          },
        });
      }

      if (adminId) {
        await prisma.user.deleteMany({
          where: {
            id: adminId,
          },
        });
      }
    }

    console.log("Temporary records cleaned up.");
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nINTEGRATION TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});
