
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  allowedOrigins: [
    "https://linkforge-url-shortener.pages.dev",
    "https://72acec22.linkforge-url-shortener.pages.dev",
  ],
}));

import { requireTrustedOrigin } from "../middleware/trusted-origin.middleware.js";

describe("Trusted origin middleware", () => {
  it("should allow the production frontend origin", () => {
    const req = {
      get: vi.fn().mockReturnValue(
        "https://linkforge-url-shortener.pages.dev",
      ),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    requireTrustedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should allow the preview frontend origin", () => {
    const req = {
      get: vi.fn().mockReturnValue(
        "https://72acec22.linkforge-url-shortener.pages.dev",
      ),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    requireTrustedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should reject an untrusted origin with HTTP 403", () => {
    const req = {
      get: vi.fn().mockReturnValue("https://malicious-example.com"),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    requireTrustedOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "UNTRUSTED_ORIGIN",
        message: "Request origin is not allowed.",
      },
    });
  });

  it("should reject a missing origin", () => {
    const req = {
      get: vi.fn().mockReturnValue(undefined),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    requireTrustedOrigin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
