import Redis from "ioredis";

import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  commandTimeout: 2000,

  retryStrategy(times) {
    if (times > 3) {
      console.warn(
        "Redis connection retries exhausted. Continuing without Redis.",
      );

      return null;
    }

    return Math.min(times * 500, 1500);
  },
});

redis.on("connect", () => {
  console.log("Redis connection established.");
});

redis.on("ready", () => {
  console.log("Redis is ready to accept commands.");
});

redis.on("error", (error) => {
  console.error("Redis client error:", error.message);
});

redis.on("close", () => {
  console.warn("Redis connection closed.");
});

/**
 * Attempts to connect to Redis.
 *
 * Redis is an optional performance dependency.
 * Application startup must not depend on Redis availability.
 *
 * @returns {Promise<boolean>}
 */
export async function connectRedis() {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const response = await redis.ping();

    if (response !== "PONG") {
      throw new Error("Unexpected Redis PING response.");
    }

    return true;
  } catch {
    console.warn(
      "Redis is unavailable. LinkForge will continue without Redis caching.",
    );

    return false;
  }
}

/**
 * Gracefully closes the Redis connection.
 */
export async function disconnectRedis() {
  try {
    if (redis.status === "ready") {
      await redis.quit();
      console.log("Redis disconnected.");
      return;
    }

    if (redis.status !== "end") {
      redis.disconnect();
    }
  } catch (error) {
    console.error("Error while disconnecting Redis:", error.message);

    redis.disconnect();
  }
}
