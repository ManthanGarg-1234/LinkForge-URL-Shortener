
import { prisma } from "../lib/prisma.js";

async function checkDatabase() {
  try {
    await prisma.$connect();

    const result = await prisma.$queryRaw`
      SELECT
        current_database() AS database,
        current_user AS username,
        NOW() AS server_time
    `;

    console.log("=================================");
    console.log(" LINKFORGE DATABASE CONNECTION");
    console.log("=================================");
    console.log("Connection successful.");
    console.log("Database details:", result[0]);
    console.log("=================================");
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();