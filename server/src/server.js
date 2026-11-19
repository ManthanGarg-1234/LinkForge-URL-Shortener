
import http from "node:http";

import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

import {
  connectRedis,
  disconnectRedis,
} from "./lib/redis.js";

import {
  startClickWorker,
  closeClickQueue,
} from "./lib/click-queue.js";

const server = http.createServer(app);

let isShuttingDown = false;

async function startServer() {
  try {
    // PostgreSQL is mandatory.
    await prisma.$connect();

    console.log("Database connection established.");

    // Redis is optional. Its failure must not prevent API startup.
    const redisConnected = await connectRedis();

    console.log(
      redisConnected
        ? "Redis caching infrastructure is available."
        : "Redis unavailable. Continuing without Redis.",
    );

    let workerReady = false;

    if (redisConnected) {
      try {
        await startClickWorker();
        workerReady = true;
      } catch (error) {
        console.error(
          "BullMQ worker startup failed. API will continue:",
          error.message,
        );
      }
    }

    server.listen(env.PORT, () => {
      console.log("---------------------------------------");
      console.log("       LINKFORGE API SERVER");
      console.log("---------------------------------------");
      console.log(`Environment : ${env.NODE_ENV}`);
      console.log(`Port        : ${env.PORT}`);
      console.log(`API         : http://localhost:${env.PORT}`);
      console.log(`Health      : http://localhost:${env.PORT}/api/v1/health`);
      console.log(`Liveness    : http://localhost:${env.PORT}/api/v1/health/live`);
      console.log(`Readiness   : http://localhost:${env.PORT}/api/v1/health/ready`);
      console.log(
        `Redis       : ${redisConnected ? "Connected" : "Unavailable (fallback mode)"}`,
      );
      console.log(
        `Click worker: ${workerReady ? "Running" : "Unavailable"}`,
      );
      console.log("---------------------------------------");
    });
  } catch (error) {
    console.error("Failed to start LinkForge API.");
    console.error("Startup error:", error.message);

    try {
      await closeClickQueue();
    } catch (queueError) {
      console.error(
        "BullMQ cleanup failed:",
        queueError.message,
      );
    }

    try {
      await disconnectRedis();
    } catch (redisError) {
      console.error(
        "Redis cleanup failed:",
        redisError.message,
      );
    }

    try {
      await prisma.$disconnect();
    } catch (databaseError) {
      console.error(
        "Database cleanup failed:",
        databaseError.message,
      );
    }

    process.exit(1);
  }
}

async function shutdown(signal) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down LinkForge...`);

  const forceShutdown = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 15000);

  forceShutdown.unref();

  let shutdownFailed = false;

  // Stop accepting requests and wait for active requests to finish.
  try {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } catch (error) {
    shutdownFailed = true;
    console.error("HTTP server shutdown failed:", error.message);
  }

  // Close the worker and BullMQ connections before Redis cache.
  try {
    await closeClickQueue();
  } catch (error) {
    shutdownFailed = true;
    console.error("BullMQ shutdown failed:", error.message);
  }

  try {
    await disconnectRedis();
  } catch (error) {
    shutdownFailed = true;
    console.error("Redis shutdown failed:", error.message);
  }

  try {
    await prisma.$disconnect();
    console.log("Database disconnected.");
  } catch (error) {
    shutdownFailed = true;
    console.error("Database shutdown failed:", error.message);
  }

  clearTimeout(forceShutdown);

  if (shutdownFailed) {
    console.error("LinkForge shut down with cleanup errors.");
    process.exit(1);
  }

  console.log("LinkForge shut down successfully.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
