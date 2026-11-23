
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

vi.mock("../lib/click-queue.js", () => ({
  enqueueClick: vi.fn(),
}));

vi.mock("../services/url.service.js", () => ({
  resolveShortCode: vi.fn(),
  recordClick: vi.fn(),
}));

import app from "../app.js";
import { enqueueClick } from "../lib/click-queue.js";
import {
  resolveShortCode,
  recordClick,
} from "../services/url.service.js";

describe("Redirect routes and asynchronous click tracking", () => {
  const validRecord = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    originalUrl: "https://example.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    resolveShortCode.mockResolvedValue(validRecord);
    enqueueClick.mockResolvedValue({ id: "job-123" });

    recordClick.mockResolvedValue({
      id: "click-id",
      shortUrlId: validRecord.id,
      clickedAt: new Date(),
    });
  });

  it("queues a click with its timestamp and redirects to the destination", async () => {
    const response = await request(app)
      .get("/Ab12Cd34")
      .set("Referer", "https://google.com/search?q=linkforge");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://example.com");

    expect(resolveShortCode).toHaveBeenCalledWith("Ab12Cd34");

    expect(enqueueClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: "https://google.com",
      clickedAt: expect.any(Date),
    });

    expect(recordClick).not.toHaveBeenCalled();
  });

  it("queues a click without a referrer when none is supplied", async () => {
    const response = await request(app).get("/Ab12Cd34");

    expect(response.status).toBe(302);

    expect(enqueueClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: null,
      clickedAt: expect.any(Date),
    });
  });

  it("stores only the referrer origin", async () => {
    await request(app)
      .get("/Ab12Cd34")
      .set(
        "Referer",
        "https://example.org/private/path?token=secret#section",
      );

    expect(enqueueClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: "https://example.org",
      clickedAt: expect.any(Date),
    });
  });

  it("ignores an invalid referrer", async () => {
    await request(app)
      .get("/Ab12Cd34")
      .set("Referer", "not-a-valid-url");

    expect(enqueueClick).toHaveBeenCalledWith({
      shortUrlId: validRecord.id,
      referrerOrigin: null,
      clickedAt: expect.any(Date),
    });
  });

  it("passes the original click timestamp to PostgreSQL when queue submission fails", async () => {
    enqueueClick.mockRejectedValue(
      new Error("Redis queue unavailable"),
    );

    const response = await request(app).get("/Ab12Cd34");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://example.com");

    expect(enqueueClick).toHaveBeenCalledOnce();
    expect(recordClick).toHaveBeenCalledOnce();

    const queuedEvent = enqueueClick.mock.calls[0][0];
    const persistedEvent = recordClick.mock.calls[0][0];

    expect(queuedEvent).toMatchObject({
      shortUrlId: validRecord.id,
      referrerOrigin: null,
      clickedAt: expect.any(Date),
    });

    expect(persistedEvent).toEqual({
      shortUrlId: validRecord.id,
      referrerOrigin: null,
      clickedAt: queuedEvent.clickedAt,
    });

    expect(persistedEvent.clickedAt).toBe(queuedEvent.clickedAt);
  });

  it("still redirects when both queue and database fallback fail", async () => {
    enqueueClick.mockRejectedValue(
      new Error("Redis queue unavailable"),
    );

    recordClick.mockRejectedValue(
      new Error("Analytics database unavailable"),
    );

    const response = await request(app).get("/Ab12Cd34");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://example.com");

    expect(enqueueClick).toHaveBeenCalledOnce();
    expect(recordClick).toHaveBeenCalledOnce();

    expect(enqueueClick.mock.calls[0][0].clickedAt).toBeInstanceOf(Date);
    expect(recordClick.mock.calls[0][0].clickedAt).toBe(
      enqueueClick.mock.calls[0][0].clickedAt,
    );
  });

  it("returns 404 for invalid short codes", async () => {
    const response = await request(app).get("/invalid");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");

    expect(resolveShortCode).not.toHaveBeenCalled();
    expect(enqueueClick).not.toHaveBeenCalled();
    expect(recordClick).not.toHaveBeenCalled();
  });

  it("returns 404 when the short link is unavailable", async () => {
    resolveShortCode.mockResolvedValue(null);

    const response = await request(app).get("/Ab12Cd34");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("SHORT_URL_NOT_FOUND");

    expect(enqueueClick).not.toHaveBeenCalled();
    expect(recordClick).not.toHaveBeenCalled();
  });
});
