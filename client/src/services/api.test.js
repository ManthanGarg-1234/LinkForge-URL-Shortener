import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAuthApi() {
  vi.resetModules();

  const module = await import("./api.js");
  return module.authApi;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("authApi.restoreSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shares one in-flight restoration between concurrent calls", async () => {
    const lockRequest = vi.fn(async (_name, _options, callback) => callback());

    vi.stubGlobal("navigator", {
      locks: {
        request: lockRequest,
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, {
          message: "Unauthenticated",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: {
            user: {
              id: "user-1",
              email: "test@linkforge.test",
            },
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const authApi = await loadAuthApi();

    const firstRequest = authApi.restoreSession();
    const secondRequest = authApi.restoreSession();

    expect(firstRequest).toBe(secondRequest);

    const [firstResult, secondResult] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);

    expect(firstResult).toEqual(secondResult);
    expect(firstResult.data.user.id).toBe("user-1");

    expect(lockRequest).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(fetchMock.mock.calls[0][0]).toContain("/auth/me");
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/refresh");
    expect(fetchMock.mock.calls[2][0]).toContain("/auth/me");
  });

  it("does not rotate a refresh token when the access session is valid", async () => {
    const lockRequest = vi.fn(async (_name, _options, callback) => callback());

    vi.stubGlobal("navigator", {
      locks: {
        request: lockRequest,
      },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          user: {
            id: "user-2",
            email: "active@linkforge.test",
          },
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const authApi = await loadAuthApi();
    const result = await authApi.restoreSession();

    expect(result.data.user.id).toBe("user-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/me");
    expect(lockRequest).toHaveBeenCalledTimes(1);
  });

  it("does not attempt refresh for non-401 errors", async () => {
    const lockRequest = vi.fn(async (_name, _options, callback) => callback());

    vi.stubGlobal("navigator", {
      locks: {
        request: lockRequest,
      },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(500, {
        message: "Internal server error",
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const authApi = await loadAuthApi();

    await expect(authApi.restoreSession()).rejects.toMatchObject({
      status: 500,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lockRequest).toHaveBeenCalledTimes(1);
  });

  it("uses same-tab deduplication when Web Locks are unavailable", async () => {
    vi.stubGlobal("navigator", {});

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, {
          message: "Unauthenticated",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: {
            user: {
              id: "user-3",
              email: "fallback@linkforge.test",
            },
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const authApi = await loadAuthApi();

    const firstRequest = authApi.restoreSession();
    const secondRequest = authApi.restoreSession();

    expect(firstRequest).toBe(secondRequest);

    const result = await firstRequest;

    expect(result.data.user.id).toBe("user-3");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("authApi.updateProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a PATCH request to the authenticated profile endpoint", async () => {
    const updatedUser = {
      id: "user-10",
      name: "Updated User",
      email: "user@linkforge.test",
      role: "USER",
      status: "ACTIVE",
    };

    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        message: "Profile updated successfully.",
        data: {
          user: updatedUser,
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const authApi = await loadAuthApi();

    const result = await authApi.updateProfile({
      name: "Updated User",
    });

    expect(result.data.user).toEqual(updatedUser);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toContain("/auth/me");
    expect(options.method).toBe("PATCH");
    expect(options.credentials).toBe("include");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({
      name: "Updated User",
    });
  });

  it("propagates profile validation errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(400, {
        success: false,
        message: "Validation failed.",
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed.",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const authApi = await loadAuthApi();

    await expect(
      authApi.updateProfile({
        name: "A",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });
});
