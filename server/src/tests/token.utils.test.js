
import { describe, it, expect } from "vitest";

import {
  createOpaqueToken,
  hashToken,
  createAccessToken,
  verifyAccessToken,
} from "../utils/token.utils.js";

describe("Authentication token utilities", () => {
  describe("createOpaqueToken", () => {
    it("should generate a cryptographically random token", () => {
      const token = createOpaqueToken();

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("should generate unique tokens", () => {
      const firstToken = createOpaqueToken();
      const secondToken = createOpaqueToken();

      expect(firstToken).not.toBe(secondToken);
    });
  });

  describe("hashToken", () => {
    it("should generate a SHA-256 hexadecimal hash", () => {
      const hash = hashToken("test-refresh-token");

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate the same hash for the same token", () => {
      const token = "consistent-token";

      expect(hashToken(token)).toBe(hashToken(token));
    });

    it("should generate different hashes for different tokens", () => {
      expect(hashToken("token-one")).not.toBe(
        hashToken("token-two")
      );
    });

    it("should reject empty or invalid input", () => {
      expect(() => hashToken("")).toThrow(TypeError);
      expect(() => hashToken(null)).toThrow(TypeError);
      expect(() => hashToken(undefined)).toThrow(TypeError);
    });
  });

  describe("createAccessToken", () => {
    it("should create a valid signed JWT", async () => {
      const token = await createAccessToken({
        userId: "test-user",
        sessionId: "test-session",
      });

      expect(token).toEqual(expect.any(String));
      expect(token.split(".")).toHaveLength(3);
    });

    it("should reject missing user or session identifiers", async () => {
      await expect(
        createAccessToken({
          userId: "",
          sessionId: "test-session",
        })
      ).rejects.toThrow(TypeError);

      await expect(
        createAccessToken({
          userId: "test-user",
          sessionId: "",
        })
      ).rejects.toThrow(TypeError);
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify a valid JWT and return its claims", async () => {
      const token = await createAccessToken({
        userId: "test-user",
        sessionId: "test-session",
      });

      const verified = await verifyAccessToken(token);

      expect(verified.userId).toBe("test-user");
      expect(verified.sessionId).toBe("test-session");
      expect(verified.issuedAt).toEqual(expect.any(Number));
      expect(verified.expiresAt).toEqual(expect.any(Number));
      expect(verified.expiresAt).toBeGreaterThan(
        verified.issuedAt
      );
    });

    it("should reject a tampered JWT", async () => {
      const token = await createAccessToken({
        userId: "test-user",
        sessionId: "test-session",
      });

      const [header, payload] = token.split(".");
      const tamperedToken = `${header}.${payload}.invalidsignature`;

      await expect(
        verifyAccessToken(tamperedToken)
      ).rejects.toThrow();
    });

    it("should reject malformed JWTs", async () => {
      await expect(
        verifyAccessToken("not-a-valid-jwt")
      ).rejects.toThrow();
    });

    it("should reject empty or invalid input", async () => {
      await expect(
        verifyAccessToken("")
      ).rejects.toThrow(TypeError);

      await expect(
        verifyAccessToken(null)
      ).rejects.toThrow(TypeError);
    });
  });
});
