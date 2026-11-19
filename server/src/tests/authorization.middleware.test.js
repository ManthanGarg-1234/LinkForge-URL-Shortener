
import { describe, expect, it, vi } from "vitest";

import {
  authorizeRoles,
} from "../middleware/authorization.middleware.js";

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe("Role-based authorization middleware", () => {
  it("should allow a user with an authorized role", () => {
    const middleware = authorizeRoles("USER", "ADMIN");

    const req = {
      user: {
        id: "user-123",
        role: "USER",
      },
    };

    const res = createResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should allow an admin on an admin-only route", () => {
    const middleware = authorizeRoles("ADMIN");

    const req = {
      user: {
        id: "admin-123",
        role: "ADMIN",
      },
    };

    const res = createResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("should reject a user accessing an admin-only route", () => {
    const middleware = authorizeRoles("ADMIN");

    const req = {
      user: {
        id: "user-123",
        role: "USER",
      },
    };

    const res = createResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject a request without an authenticated user", () => {
    const middleware = authorizeRoles("USER");

    const req = {};
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject middleware configured without roles", () => {
    expect(() => authorizeRoles()).toThrow(
      "At least one valid role must be provided."
    );
  });
});
