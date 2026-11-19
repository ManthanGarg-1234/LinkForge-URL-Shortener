
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(currentDirectory, "../..");

dotenv.config({
  path: path.join(serverDirectory, ".env"),
});

const TEST_DATABASE_NAME = "linkforge_admin_test";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("This diagnostic cannot run in production.");
  }

  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error(
      "DATABASE_URL is missing from server/.env."
    );
  }

  const databaseUrl = new URL(configuredUrl);
  const sourceDatabase = databaseUrl.pathname.replace(/^\/+/, "");

  if (
    !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)
  ) {
    throw new Error("Only a local PostgreSQL server is permitted.");
  }

  if (!["linkforge", TEST_DATABASE_NAME].includes(sourceDatabase)) {
    throw new Error(
      "Unexpected source database. Refusing to derive a test connection."
    );
  }

  // Never connect to the application's normal database.
  databaseUrl.pathname = `/${TEST_DATABASE_NAME}`;
  process.env.DATABASE_URL = databaseUrl.toString();

  // Import only after redirecting DATABASE_URL.
  const { prisma } = await import("../../src/lib/prisma.js");

  try {
    await prisma.$connect();

    const [databaseInfo] = await prisma.$queryRaw`
      SELECT
        current_database() AS database_name,
        to_regclass('public._prisma_migrations') IS NOT NULL
          AS migrations_table_exists,
        to_regclass('public.users') IS NOT NULL
          AS users_table_exists,
        to_regclass('public.sessions') IS NOT NULL
          AS sessions_table_exists,
        to_regclass('public.refresh_tokens') IS NOT NULL
          AS refresh_tokens_table_exists
    `;

    console.log("\n========== REFRESH TEST DATABASE ==========");
    console.log(`Database: ${databaseInfo.database_name}`);
    console.log(`Migrations table: ${databaseInfo.migrations_table_exists}`);
    console.log(`Users table: ${databaseInfo.users_table_exists}`);
    console.log(`Sessions table: ${databaseInfo.sessions_table_exists}`);
    console.log(
      `Refresh tokens table: ${databaseInfo.refresh_tokens_table_exists}`
    );

    if (databaseInfo.migrations_table_exists) {
      const [migrationInfo] = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS applied_migrations
        FROM public."_prisma_migrations"
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `;

      console.log(
        `Successfully applied migrations: ${migrationInfo.applied_migrations}`
      );
    }

    const schemaReady =
      databaseInfo.database_name === TEST_DATABASE_NAME &&
      databaseInfo.migrations_table_exists &&
      databaseInfo.users_table_exists &&
      databaseInfo.sessions_table_exists &&
      databaseInfo.refresh_tokens_table_exists;

    if (!schemaReady) {
      throw new Error(
        "The isolated test database is missing required schema objects."
      );
    }

    console.log("\nPASS: Isolated refresh-token test database is ready.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nTEST DATABASE CHECK FAILED:");
  console.error(error.message);
  process.exitCode = 1;
});
