
import argon2 from "argon2";
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`
  );

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

/**
 * Validates and securely hashes a new password.
 */
export async function hashPassword(password) {
  const validatedPassword = passwordSchema.parse(password);

  return argon2.hash(validatedPassword, ARGON2_OPTIONS);
}

/**
 * Verifies a password against an existing Argon2id hash.
 *
 * Returns false for invalid input or malformed hashes.
 */
export async function verifyPassword(password, passwordHash) {
  if (
    typeof password !== "string" ||
    typeof passwordHash !== "string" ||
    !passwordHash.startsWith("$argon2id$")
  ) {
    return false;
  }

  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
