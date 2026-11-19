
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("../services/url.service.js", () => ({
  resolveShortCode: vi.fn(),
  recordClick: vi.fn(),
}));

import app from "../app.js";
import {
  resolveShortCode,
  recordClick,
} from "../services/url.service.js";

describe("Redirect routes and click tracking", () => {
  const validRecord = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    originalUrl: "https://example.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    resolveShortCode.mockResolvedValue(validRecord);
    recordClick.mockResolvedValue({
      id: "click-id",
      shortUrlId: validRecord.id,
      clickedAt: new Date(),
    });
  });

  it("records a click and redirects to the destination", async () => {
    const response = await request(app)
      .get("/Ab12Cd34")
      .set("Referer", "https://google.com/search?q=linkforge");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://example.com");

    expect(resolveShortCode).toHaveBeenCalledWith("Ab12Cd34");

    expect(recordClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: "https://google.com",
    });
  });

  it("records a click without a referrer when none is supplied", async () => {
    const response = await request(app).get("/Ab12Cd34");

    expect(response.status).toBe(302);

    expect(recordClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: null,
    });
  });

  it("stores only the referrer origin, not its path or query", async () => {
    await request(app)
      .get("/Ab12Cd34")
      .set(
        "Referer",
        "https://example.org/private/path?token=secret#section",
      );

    expect(recordClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: "https://example.org",
    });
  });

  it("ignores an invalid referrer", async () => {
    await request(app)
      .get("/Ab12Cd34")
      .set("Referer", "not-a-valid-url");

    expect(recordClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: null,
    });
  });

  it("redirects successfully even if click recording fails", async () => {
    recordClick.mockRejectedValue(
      new Error("Analytics database unavailable"),
    );

    const response = await request(app).get("/Ab12Cd34");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://example.com");
  });

  it("returns 404 for invalid short codes", async () => {
    const response = await request(app).get("/invalid");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");

    expect(resolveShortCode).not.toHaveBeenCalled();
    expect(recordClick).not.toHaveBeenCalled();
  });

  it("returns 404 when the short link does not exist or is unavailable", async () => {
    resolveShortCode.mockResolvedValue(null);

    const response = await request(app).get("/Ab12Cd34");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");

    expect(recordClick).not.toHaveBeenCalled();
  });
});
