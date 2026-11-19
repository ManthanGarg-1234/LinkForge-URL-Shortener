
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(currentDirectory, "../..");

dotenv.config({
  path: path.join(serverDirectory, ".env"),
});

const TEST_DATABASE_NAME = "linkforge_admin_test";
const ALLOWED_SOURCE_DATABASES = [
  "linkforge",
  TEST_DATABASE_NAME,
];

let prisma;
let blocker;
let temporaryUserId;
let temporarySessionId;
let blockerTransactionOpen = false;

function configureIsolatedDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Integration tests cannot run in production.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from server/.env.");
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  const sourceDatabase = databaseUrl.pathname.replace(/^\/+/, "");

  if (
    !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)
  ) {
    throw new Error("Only a local PostgreSQL server is permitted.");
  }

  if (!ALLOWED_SOURCE_DATABASES.includes(sourceDatabase)) {
    throw new Error("Unexpected source database. Refusing to continue.");
  }

  databaseUrl.pathname = `/${TEST_DATABASE_NAME}`;
  process.env.DATABASE_URL = databaseUrl.toString();

  return databaseUrl.toString();
}

async function waitForBlockedRefreshUpdates() {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS waiting_count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND state = 'active'
        AND query ILIKE '%refresh_tokens%'
        AND position('UPDATE' IN upper(query)) > 0
    `;

    const waitingCount = result[0].waiting_count;

    if (waitingCount >= 2) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    "Both refresh requests did not reach the expected PostgreSQL row-lock wait."
  );
}

async function cleanup() {
  if (blockerTransactionOpen && blocker) {
    try {
      await blocker.query("ROLLBACK");
      blockerTransactionOpen = false;
    } catch (error) {
      console.error("WARNING: Could not release blocker transaction.");
      console.error(error.message);
    }
  }

  if (blocker) {
    try {
      await blocker.end();
    } catch (error) {
      console.error("WARNING: Could not close PostgreSQL blocker.");
      console.error(error.message);
    }
  }

  if (prisma && temporaryUserId) {
    try {
      await prisma.user.deleteMany({
        where: {
          id: temporaryUserId,
        },
      });

      console.log("PASS: Temporary user and dependent records cleaned up.");
    } catch (error) {
      console.error("WARNING: Temporary user cleanup failed.");
      console.error(error.message);
    }
  }

  if (prisma) {
    await prisma.$disconnect();
  }
}

async function main() {
  const connectionString = configureIsolatedDatabase();

  // Import Prisma only after DATABASE_URL has been redirected.
  const prismaModule = await import("../../src/lib/prisma.js");
  const sessionService = await import("../../src/services/session.service.js");

  prisma = prismaModule.prisma;

  const { createSession, rotateRefreshToken } = sessionService;

  try {
    await prisma.$connect();

    const [database] = await prisma.$queryRaw`
      SELECT current_database() AS database_name
    `;

    assert.equal(database.database_name, TEST_DATABASE_NAME);

    console.log(`Database safety check passed: ${database.database_name}`);

    const uniqueId = randomUUID();

    const user = await prisma.user.create({
      data: {
        email: `refresh-concurrency-${uniqueId}@linkforge.test`,
        name: "Refresh Concurrency Integration Test",
        role: "USER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    temporaryUserId = user.id;

    const session = await createSession({
      userId: temporaryUserId,
      userAgent: "Refresh concurrency integration test",
      ipAddress: "127.0.0.1",
    });

    temporarySessionId = session.sessionId;

    console.log("PASS: Temporary user and session created.");

    // A separate PostgreSQL connection holds the original token row lock.
    blocker = new Client({
      connectionString,
      application_name: "linkforge-refresh-concurrency-blocker",
    });

    await blocker.connect();
    await blocker.query("BEGIN");
    blockerTransactionOpen = true;

    await blocker.query(
      `
        SELECT id
        FROM public.refresh_tokens
        WHERE "tokenHash" = $1
        FOR UPDATE
      `,
      [
        (await import("../../src/utils/token.utils.js"))
          .hashToken(session.refreshToken),
      ],
    );

    console.log("PASS: PostgreSQL row lock acquired.");

    // Both requests attempt to consume the same single-use refresh token.
    const refreshRequests = [
      rotateRefreshToken(session.refreshToken),
      rotateRefreshToken(session.refreshToken),
    ];

    try {
      await waitForBlockedRefreshUpdates();

      console.log(
        "PASS: Both refresh requests reached the PostgreSQL row-lock wait."
      );
    } finally {
      await blocker.query("COMMIT");
      blockerTransactionOpen = false;

      console.log("PASS: PostgreSQL row lock released.");
    }

    const results = await Promise.all(refreshRequests);

    const successfulRotations = results.filter(
      (result) => result.rotated === true,
    );

    const reuseRejections = results.filter(
      (result) =>
        result.rotated === false &&
        result.reason === "TOKEN_REUSE_DETECTED",
    );

    assert.equal(
      successfulRotations.length,
      1,
      "Exactly one request must consume the original refresh token.",
    );

    assert.equal(
      reuseRejections.length,
      1,
      "The competing request must be classified as token reuse.",
    );

    console.log("PASS: Exactly one request consumed the original token.");
    console.log("PASS: Competing request was classified as token reuse.");

    const finalSession = await prisma.session.findUnique({
      where: {
        id: temporarySessionId,
      },
      select: {
        revokedAt: true,
        refreshTokens: {
          select: {
            usedAt: true,
            revokedAt: true,
          },
        },
      },
    });

    assert.ok(finalSession, "Temporary session should still exist.");
    assert.ok(
      finalSession.revokedAt,
      "Session must be revoked after refresh-token reuse is detected.",
    );

    assert.equal(
      finalSession.refreshTokens.length,
      2,
      "Expected the original token and one successor token.",
    );

    assert.ok(
      finalSession.refreshTokens.every((token) => token.revokedAt),
      "Both refresh tokens must be revoked after reuse detection.",
    );

    assert.ok(
      finalSession.refreshTokens.some((token) => token.usedAt),
      "The original refresh token must have been consumed.",
    );

    console.log(
      "PASS: Session revocation enforced after concurrent token reuse."
    );

    console.log("\n========== REFRESH TOKEN REPLAY TEST RESULT ==========");
    console.log("PASS: PostgreSQL enforced single-use refresh-token rotation.");
    console.log("PASS: One request succeeded and the competing request was rejected.");
    console.log("PASS: Session revocation followed the configured replay-detection policy.");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error("\nREFRESH TOKEN REPLAY TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});
