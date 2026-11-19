import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

import { rateLimit } from "express-rate-limit";

function createTestApp() {
  const app = express();

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 2,
    standardHeaders: true,
    legacyHeaders: false,

    handler(req, res) {
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests.",
        },
      });
    },
  });

  app.get("/limited", limiter, (req, res) => {
    res.status(200).json({
      success: true,
    });
  });

  return app;
}

describe("Authentication rate limiter", () => {
  it("should allow requests within the configured limit", async () => {
    const app = createTestApp();

    const firstResponse = await request(app).get("/limited");
    const secondResponse = await request(app).get("/limited");

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
  });

  it("should reject requests exceeding the configured limit", async () => {
    const app = createTestApp();

    await request(app).get("/limited");
    await request(app).get("/limited");

    const response = await request(app).get("/limited");

    expect(response.status).toBe(429);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests.",
      },
    });

    expect(response.headers["ratelimit-limit"]).toBeDefined();
    expect(response.headers["ratelimit-remaining"]).toBeDefined();
  });
});