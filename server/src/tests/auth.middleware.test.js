import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, verifyAccessTokenMock } = vi.hoisted(() => ({
  prismaMock: {
    session: {
      findFirst: vi.fn(),
    },
  },
  verifyAccessTokenMock: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../utils/token.utils.js", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    verifyAccessToken: verifyAccessTokenMock,
  };
});

import { authenticate } from "../middleware/auth.middleware.js";
import { ACCESS_TOKEN_COOKIE } from "../config/auth.js";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const emailVerifiedAt = new Date("2026-01-02T00:00:00.000Z");

const claims = {
  userId: "user-123",
  sessionId: "session-123",
};

const activeSession = {
  id: "session-123",
  userId: "user-123",
  user: {
    id: "user-123",
    email: "user@example.com",
    name: "Test User",
    role: "USER",
    status: "ACTIVE",
    emailVerifiedAt,
    createdAt,
  },
};

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function createRequest(token = "valid-access-token") {
  return {
    cookies: token
      ? {
          [ACCESS_TOKEN_COOKIE]: token,
        }
      : {},
  };
}

describe("Authentication middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    verifyAccessTokenMock.mockResolvedValue(claims);

    prismaMock.session.findFirst.mockResolvedValue({
      ...activeSession,
      user: { ...activeSession.user },
    });
  });

  it("should authenticate a valid user and attach safe account metadata", async () => {
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(req.user).toEqual({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
      role: "USER",
      status: "ACTIVE",
      emailVerifiedAt,
      createdAt,
      sessionId: "session-123",
    });

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should reject a request without an access cookie", async () => {
    const req = createRequest(null);
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(verifyAccessTokenMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject an invalid or expired JWT", async () => {
    verifyAccessTokenMock.mockRejectedValue(new Error("Invalid JWT"));

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject a missing database session", async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should query only an active, unexpired matching session and select profile metadata", async () => {
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(prismaMock.session.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-123",
        userId: "user-123",
        revokedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            createdAt: true,
          },
        },
      },
    });
  });

  it("should reject a suspended user", async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      ...activeSession,
      user: {
        ...activeSession.user,
        status: "SUSPENDED",
      },
    });

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject a user whose email is not verified", async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      ...activeSession,
      user: {
        ...activeSession.user,
        emailVerifiedAt: null,
      },
    });

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should pass database errors to the centralized error handler", async () => {
    const databaseError = new Error("Database unavailable");

    prismaMock.session.findFirst.mockRejectedValue(databaseError);

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(databaseError);
    expect(res.status).not.toHaveBeenCalled();
  });
});
