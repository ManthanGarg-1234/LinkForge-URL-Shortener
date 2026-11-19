
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, hashPasswordMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
  },
  hashPasswordMock: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../utils/password.utils.js", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    hashPassword: hashPasswordMock,
  };
});

import { registerUser } from "../services/auth.service.js";

const validInput = {
  name: "LinkForge User",
  email: "USER@EXAMPLE.COM",
  password: "LinkForge-Secure-2026!",
};

const createdUser = {
  id: "user-123",
  email: "user@example.com",
  name: "LinkForge User",
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("Authentication service - registration", () => {
  const transactionMock = {
    user: {
      create: vi.fn(),
    },
    emailVerificationToken: {
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    hashPasswordMock.mockResolvedValue("$argon2id$test-hash");

    transactionMock.user.create.mockResolvedValue(createdUser);
    transactionMock.emailVerificationToken.create.mockResolvedValue({
      id: "verification-123",
    });

    prismaMock.$transaction.mockImplementation(async (callback) => {
      return callback(transactionMock);
    });
  });

  it("should create an unverified user", async () => {
    const result = await registerUser(validInput);

    expect(result.created).toBe(true);
    expect(result.user.emailVerifiedAt).toBeNull();
    expect(result.user.role).toBe("USER");
  });

  it("should normalize the email address", async () => {
    await registerUser(validInput);

    expect(transactionMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "user@example.com",
        }),
      })
    );
  });

  it("should hash the password before creating the user", async () => {
    await registerUser(validInput);

    expect(hashPasswordMock).toHaveBeenCalledWith(validInput.password);

    expect(transactionMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "$argon2id$test-hash",
        }),
      })
    );
  });

  it("should store a hashed verification token", async () => {
    const result = await registerUser(validInput);

    const tokenRecord =
      transactionMock.emailVerificationToken.create.mock.calls[0][0];

    expect(tokenRecord.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenRecord.data.tokenHash).not.toBe(result.verificationToken);
  });

  it("should set a 24-hour verification token expiry", async () => {
    const before = Date.now();

    await registerUser(validInput);

    const tokenRecord =
      transactionMock.emailVerificationToken.create.mock.calls[0][0];

    const expiry = tokenRecord.data.expiresAt.getTime();
    const expectedExpiry = 24 * 60 * 60 * 1000;

    expect(expiry).toBeGreaterThanOrEqual(before + expectedExpiry - 1000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + expectedExpiry + 1000);
  });

  it("should not create a user when registration input is invalid", async () => {
    await expect(
      registerUser({
        ...validInput,
        password: "short",
      })
    ).rejects.toThrow();

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("should return a generic result for an existing email", async () => {
    const duplicateError = Object.assign(
      new Error("Unique constraint failed"),
      { code: "P2002" }
    );

    prismaMock.$transaction.mockRejectedValueOnce(duplicateError);

    const result = await registerUser(validInput);

    expect(result).toEqual({
      created: false,
      user: null,
      verificationToken: null,
    });
  });

  it("should propagate unexpected database errors", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(
      new Error("Database unavailable")
    );

    await expect(registerUser(validInput)).rejects.toThrow(
      "Database unavailable"
    );
  });
});
