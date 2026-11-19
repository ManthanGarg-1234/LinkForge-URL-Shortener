
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { prisma } from "../lib/prisma.js";

function readEmailArgument() {
  const args = process.argv.slice(2);

  if (
    args.length !== 2 ||
    args[0] !== "--email" ||
    typeof args[1] !== "string"
  ) {
    throw new Error(
      "Usage: npm run admin:provision -- --email user@example.com"
    );
  }

  const email = args[1].trim().toLowerCase();

  if (
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("A valid email address is required.");
  }

  return email;
}

async function confirmPromotion(email) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "Admin provisioning requires an interactive terminal."
    );
  }

  const readline = createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    const expected = `PROMOTE ${email}`;

    console.log("\nYou are about to grant ADMIN privileges to:");
    console.log(email);
    console.log("\nThis operation changes the account's database role.");
    console.log("It does not create a new account.");
    console.log("It will be recorded in the audit log.\n");

    const answer = await readline.question(
      `Type "${expected}" to confirm: `
    );

    if (answer.trim() !== expected) {
      throw new Error("Confirmation did not match. No changes made.");
    }
  } finally {
    readline.close();
  }
}

async function provisionAdmin(email) {
  const existingAdminCount = await prisma.user.count({
    where: {
      role: "ADMIN",
    },
  });

  if (existingAdminCount > 0) {
    throw new Error(
      "An administrator already exists. Initial provisioning is disabled."
    );
  }

  const candidate = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
    },
  });

  if (!candidate) {
    throw new Error("No account exists with that email address.");
  }

  if (candidate.role !== "USER") {
    throw new Error("The target account is not an ordinary USER account.");
  }

  if (candidate.status !== "ACTIVE") {
    throw new Error("The target account is not active.");
  }

  if (!candidate.emailVerifiedAt) {
    throw new Error(
      "The target account's email address has not been verified."
    );
  }

  await confirmPromotion(email);

  const promotedUser = await prisma.$transaction(
    async (transaction) => {
      const adminCount = await transaction.user.count({
        where: {
          role: "ADMIN",
        },
      });

      if (adminCount > 0) {
        throw new Error(
          "An administrator was created concurrently. Provisioning aborted."
        );
      }

      const currentUser = await transaction.user.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
        },
      });

      if (
        !currentUser ||
        currentUser.email !== email ||
        currentUser.role !== "USER" ||
        currentUser.status !== "ACTIVE" ||
        !currentUser.emailVerifiedAt
      ) {
        throw new Error(
          "The target account changed or no longer meets provisioning requirements."
        );
      }

      const updateResult = await transaction.user.updateMany({
        where: {
          id: currentUser.id,
          role: "USER",
          status: "ACTIVE",
          emailVerifiedAt: {
            not: null,
          },
        },
        data: {
          role: "ADMIN",
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(
          "The account could not be promoted safely. No changes committed."
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: null,
          action: "ADMIN_PROVISIONED",
          entityType: "USER",
          entityId: currentUser.id,
          metadata: {
            targetEmail: currentUser.email,
            previousRole: "USER",
            newRole: "ADMIN",
            provisioningMethod: "ONE_TIME_LOCAL_CLI",
          },
        },
      });

      return {
        id: currentUser.id,
        email: currentUser.email,
      };
    },
    {
      isolationLevel: "Serializable",
    }
  );

  console.log("\nAdministrator provisioning successful.");
  console.log("User ID:", promotedUser.id);
  console.log("Email:", promotedUser.email);
  console.log("Role: ADMIN");
  console.log("Audit log: ADMIN_PROVISIONED");
}

async function main() {
  try {
    const email = readEmailArgument();
    await provisionAdmin(email);
  } catch (error) {
    console.error("\nAdmin provisioning failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
