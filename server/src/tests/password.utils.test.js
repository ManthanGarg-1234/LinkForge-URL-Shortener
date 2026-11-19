
import { describe, expect, it } from "vitest";

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  passwordSchema,
  hashPassword,
  verifyPassword,
} from "../utils/password.utils.js";

describe("Password utilities", () => {
  const validPassword = "LinkForge-Secure-2026!";

  describe("Password validation", () => {
    it("should accept a valid password", () => {
      expect(passwordSchema.safeParse(validPassword).success).toBe(true);
    });

    it("should reject passwords shorter than 12 characters", () => {
      expect(passwordSchema.safeParse("Short123!").success).toBe(false);
    });

    it("should reject passwords longer than 128 characters", () => {
      const longPassword = "A".repeat(129);

      expect(passwordSchema.safeParse(longPassword).success).toBe(false);
    });

    it("should accept a password at the minimum length", () => {
      const password = "A".repeat(PASSWORD_MIN_LENGTH);

      expect(passwordSchema.safeParse(password).success).toBe(true);
    });

    it("should accept a password at the maximum length", () => {
      const password = "A".repeat(PASSWORD_MAX_LENGTH);

      expect(passwordSchema.safeParse(password).success).toBe(true);
    });

    it("should reject non-string password values", () => {
      expect(passwordSchema.safeParse(123456789012).success).toBe(false);
    });
  });

  describe("Password hashing", () => {
    it("should generate an Argon2id hash", async () => {
      const hash = await hashPassword(validPassword);

      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it("should generate different hashes for the same password", async () => {
      const firstHash = await hashPassword(validPassword);
      const secondHash = await hashPassword(validPassword);

      expect(firstHash).not.toBe(secondHash);
    });

    it("should never return the original password as the hash", async () => {
      const hash = await hashPassword(validPassword);

      expect(hash).not.toBe(validPassword);
    });

    it("should reject an invalid password during hashing", async () => {
      await expect(hashPassword("short")).rejects.toThrow();
    });
  });

  describe("Password verification", () => {
    it("should verify the correct password", async () => {
      const hash = await hashPassword(validPassword);

      await expect(verifyPassword(validPassword, hash)).resolves.toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const hash = await hashPassword(validPassword);

      await expect(
        verifyPassword("Wrong-Password-2026!", hash)
      ).resolves.toBe(false);
    });

    it("should reject a malformed password hash", async () => {
      await expect(
        verifyPassword(validPassword, "not-a-valid-hash")
      ).resolves.toBe(false);
    });

    it("should reject a malformed Argon2id hash", async () => {
      await expect(
        verifyPassword(validPassword, "$argon2id$invalid")
      ).resolves.toBe(false);
    });

    it("should reject non-string password input", async () => {
      await expect(
        verifyPassword(null, "$argon2id$invalid")
      ).resolves.toBe(false);
    });
  });
});
