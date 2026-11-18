
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../middleware/error.middleware.js";

function createTestApp(error) {
  const app = express();

  app.get("/test-error", (req, res, next) => {
    next(error);
  });

  app.use(errorHandler);

  return app;
}

describe("Centralized error handler", () => {
  it("should return a safe 500 response for internal errors", async () => {
    const app = createTestApp(
      new Error("Sensitive internal database information")
    );

    const response = await request(app).get("/test-error");

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Internal server error");
    expect(response.body.message).not.toContain("Sensitive");
  });

  it("should return the appropriate message for client errors", async () => {
    const error = Object.assign(new Error("Invalid request"), {
      statusCode: 400,
    });

    const app = createTestApp(error);

    const response = await request(app).get("/test-error");

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Invalid request");
  });
});
