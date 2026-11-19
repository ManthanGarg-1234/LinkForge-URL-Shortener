import { prisma } from "../lib/prisma.js";

import { createSession } from "./session.service.js";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getSafeName(name) {
  if (typeof name !== "string") {
    return null;
  }

  const normalized = name.trim();

  return normalized.length > 0
    ? normalized.slice(0, 100)
    : null;
}

/**
 * Authenticates a user using a verified Firebase Google identity.
 *
 * Security rules:
 * - Only verified Google identities are accepted.
 * - Existing OAuth accounts are matched by Firebase UID.
 * - Existing password accounts are never silently linked.
 * - Only LinkForge session tokens are issued to the client.
 */
export async function authenticateFirebaseGoogleUser(
  decodedToken,
  metadata = {},
) {
  const firebaseUid = decodedToken?.uid;
  const email = decodedToken?.email;
  const emailVerified = decodedToken?.email_verified;
  const signInProvider = decodedToken?.firebase?.sign_in_provider;

  if (
    typeof firebaseUid !== "string" ||
    firebaseUid.length === 0 ||
    typeof email !== "string" ||
    email.length === 0 ||
    emailVerified !== true ||
    signInProvider !== "google.com"
  ) {
    return {
      authenticated: false,
      reason: "INVALID_FIREBASE_IDENTITY",
    };
  }

  const normalizedEmail = normalizeEmail(email);
  const name = getSafeName(decodedToken.name);

  let user;

  try {
    user = await prisma.$transaction(async (transaction) => {
      const existingOAuthAccount =
        await transaction.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "GOOGLE",
              providerAccountId: firebaseUid,
            },
          },
          include: {
            user: true,
          },
        });

      if (existingOAuthAccount) {
        return existingOAuthAccount.user;
      }

      const existingUser = await transaction.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

      if (existingUser) {
        return null;
      }

      const newUser = await transaction.user.create({
        data: {
          email: normalizedEmail,
          name,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          role: "USER",
          status: "ACTIVE",
        },
      });

      await transaction.oAuthAccount.create({
        data: {
          userId: newUser.id,
          provider: "GOOGLE",
          providerAccountId: firebaseUid,
          email: normalizedEmail,
        },
      });

      return newUser;
    });
  } catch (error) {
    // Handle concurrent first-time Google registrations.
    if (error?.code === "P2002") {
      const existingOAuthAccount =
        await prisma.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "GOOGLE",
              providerAccountId: firebaseUid,
            },
          },
          include: {
            user: true,
          },
        });

      if (existingOAuthAccount) {
        user = existingOAuthAccount.user;
      } else {
        return {
          authenticated: false,
          reason: "ACCOUNT_LINK_REQUIRED",
        };
      }
    } else {
      throw error;
    }
  }

  if (!user) {
    return {
      authenticated: false,
      reason: "ACCOUNT_LINK_REQUIRED",
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      authenticated: false,
      reason: "ACCOUNT_UNAVAILABLE",
    };
  }

  if (!user.emailVerifiedAt) {
    return {
      authenticated: false,
      reason: "EMAIL_NOT_VERIFIED",
    };
  }

  const session = await createSession({
    userId: user.id,
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress,
  });

  return {
    authenticated: true,

    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },

    session,
  };
}