
import argon2 from "argon2";

import { prisma } from "../lib/prisma.js";
import { registerSchema, loginSchema } from "../validators/auth.schemas.js";
import {
  hashPassword,
  verifyPassword,
} from "../utils/password.utils.js";
import {
  createOpaqueToken,
  hashToken,
} from "../utils/token.utils.js";
import { createSession } from "./session.service.js";

const EMAIL_VERIFICATION_TTL_HOURS = 24;

const SAFE_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
};

// Generated once per process to reduce the timing difference
// between an unknown email and an incorrect password.
const DUMMY_PASSWORD_HASH_PROMISE = argon2.hash(
  "LinkForge-Dummy-Password-For-Timing-Only-2026!",
  {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  }
);

export async function registerUser(input) {
  const validatedInput = registerSchema.parse(input);

  const passwordHash = await hashPassword(validatedInput.password);
  const rawVerificationToken = createOpaqueToken();
  const verificationTokenHash = hashToken(rawVerificationToken);

  const expiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000
  );

  try {
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          name: validatedInput.name,
          email: validatedInput.email,
          passwordHash,
        },
        select: SAFE_USER_FIELDS,
      });

      await transaction.emailVerificationToken.create({
        data: {
          userId: createdUser.id,
          tokenHash: verificationTokenHash,
          expiresAt,
        },
      });

      return createdUser;
    });

    return {
      created: true,
      user,
      verificationToken: rawVerificationToken,
    };
  } catch (error) {
    if (error?.code === "P2002") {
      return {
        created: false,
        user: null,
        verificationToken: null,
      };
    }

    throw error;
  }
}

/**
 * Authenticates an email/password combination.
 *
 * Does not create a session for unverified or suspended accounts.
 * Returns a generic failure for invalid credentials.
 */
export async function loginUser(input, metadata = {}) {
  const validatedInput = loginSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: {
      email: validatedInput.email,
    },
    select: {
      ...SAFE_USER_FIELDS,
      passwordHash: true,
    },
  });

  if (!user || !user.passwordHash) {
    const dummyHash = await DUMMY_PASSWORD_HASH_PROMISE;

    await verifyPassword(
      validatedInput.password,
      dummyHash
    );

    return {
      authenticated: false,
      reason: "INVALID_CREDENTIALS",
    };
  }

  const passwordIsValid = await verifyPassword(
    validatedInput.password,
    user.passwordHash
  );

  if (!passwordIsValid) {
    return {
      authenticated: false,
      reason: "INVALID_CREDENTIALS",
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

  const {
    passwordHash: _passwordHash,
    ...safeUser
  } = user;

  return {
    authenticated: true,
    user: safeUser,
    session,
  };
}
