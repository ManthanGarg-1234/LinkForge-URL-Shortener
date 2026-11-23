import { describe, expect, it } from "vitest";

import {
  getAuthRoutePath,
  getAuthRouteState,
} from "./auth-routes.js";

const validToken = "a".repeat(64);

describe("getAuthRouteState", () => {
  it("recognizes an email verification link and extracts its token", () => {
    expect(
      getAuthRouteState(
        "/verify-email",
        `?token=${validToken}`,
      ),
    ).toEqual({
      mode: "verify",
      verificationToken: validToken,
      verificationError: "",
      resetToken: "",
    });
  });

  it("reports a missing verification token", () => {
    const result = getAuthRouteState("/verify-email");

    expect(result.mode).toBe("verify");
    expect(result.verificationToken).toBe("");
    expect(result.verificationError).toMatch(/missing/i);
  });

  it("rejects a verification token that is too short", () => {
    const result = getAuthRouteState(
      "/verify-email",
      "?token=short",
    );

    expect(result.mode).toBe("verify");
    expect(result.verificationError).toMatch(/invalid/i);
  });

  it("rejects a verification token that exceeds the maximum length", () => {
    const result = getAuthRouteState(
      "/verify-email",
      `?token=${"a".repeat(201)}`,
    );

    expect(result.mode).toBe("verify");
    expect(result.verificationError).toMatch(/invalid/i);
  });

  it("recognizes password reset links and extracts their tokens", () => {
    expect(
      getAuthRouteState(
        "/reset-password",
        `?token=${validToken}`,
      ),
    ).toEqual({
      mode: "reset",
      verificationToken: "",
      verificationError: "",
      resetToken: validToken,
    });
  });

  it("recognizes the forgot-password route", () => {
    expect(getAuthRouteState("/forgot-password").mode).toBe("forgot");
  });

  it("defaults unknown routes to login", () => {
    expect(getAuthRouteState("/unknown").mode).toBe("login");
  });
});

describe("getAuthRoutePath", () => {
  it("generates the forgot-password path", () => {
    expect(getAuthRoutePath("forgot")).toBe("/forgot-password");
  });

  it("preserves the reset token in the reset-password path", () => {
    expect(getAuthRoutePath("reset", "token with spaces")).toBe(
      "/reset-password?token=token%20with%20spaces",
    );
  });

  it("returns the root path for login and other modes", () => {
    expect(getAuthRoutePath("login")).toBe("/");
    expect(getAuthRoutePath("verify")).toBe("/");
  });
});
