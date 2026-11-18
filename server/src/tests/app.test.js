
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Mock Prisma before importing the Express application.
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../lib/prisma.js";
import app from "../app.js";

describe("LinkForge API", () => {
  beforeEach(() => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  });

  describe("GET /", () => {
    it("should return the API welcome response", async () => {
      const response = await request(app).get("/");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Welcome to LinkForge API");
      expect(response.body.documentation).toBe("/api/v1/docs");
    });
  });

  describe("GET /api/v1/health", () => {
    it("should return healthy when the database is connected", async () => {
      const response = await request(app).get("/api/v1/health");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.database).toBe("connected");
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it("should return 503 when the database is unavailable", async () => {
      prisma.$queryRaw.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const response = await request(app).get("/api/v1/health");

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.data.database).toBe("disconnected");
    });
  });

  describe("GET /api/v1/health/live", () => {
    it("should confirm that the application process is alive", async () => {
      const response = await request(app).get("/api/v1/health/live");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("LinkForge API is alive.");
    });

    it("should not require a database query", async () => {
      await request(app).get("/api/v1/health/live");

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/health/ready", () => {
    it("should return ready when the database is available", async () => {
      const response = await request(app).get("/api/v1/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.database).toBe("connected");
    });

    it("should return 503 when the database is unavailable", async () => {
      prisma.$queryRaw.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const response = await request(app).get("/api/v1/health/ready");

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.data.database).toBe("unavailable");
    });
  });

  describe("404 handling", () => {
    it("should return 404 for an unknown route", async () => {
      const response = await request(app).get("/api/v1/unknown-route");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Route not found");
    });
  });
});
