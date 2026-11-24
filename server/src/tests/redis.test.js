import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    redisInstance: null,
  };

  state.RedisMock = vi.fn(function (url, options) {
    this.url = url;
    this.options = options;
    this.status = "wait";

    this.on = vi.fn().mockReturnThis();
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.ping = vi.fn().mockResolvedValue("PONG");
    this.quit = vi.fn().mockResolvedValue("OK");
    this.disconnect = vi.fn();

    state.redisInstance = this;
  });

  return state;
});

vi.mock("ioredis", () => ({
  default: mocks.RedisMock,
}));

vi.mock("../config/env.js", () => ({
  env: {
    REDIS_URL: "redis://127.0.0.1:6379",
  },
}));

import { redis, connectRedis, disconnectRedis } from "../lib/redis.js";

describe("Redis connection lifecycle", () => {
  beforeEach(() => {
    redis.status = "wait";

    redis.connect.mockReset();
    redis.connect.mockResolvedValue(undefined);

    redis.ping.mockReset();
    redis.ping.mockResolvedValue("PONG");

    redis.quit.mockReset();
    redis.quit.mockResolvedValue("OK");

    redis.disconnect.mockReset();
  });

  it("creates the Redis client with the expected configuration", () => {
    expect(mocks.redisInstance).toBe(redis);
    expect(redis.url).toBe("redis://127.0.0.1:6379");

    expect(redis.options).toMatchObject({
      lazyConnect: true,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 2000,
    });
  });

  it("limits automatic reconnection attempts", () => {
    const retryStrategy = redis.options.retryStrategy;

    expect(retryStrategy(1)).toBe(500);
    expect(retryStrategy(2)).toBe(1000);
    expect(retryStrategy(3)).toBe(1500);
    expect(retryStrategy(4)).toBeNull();
  });

  it("connects and verifies Redis with PING", async () => {
    redis.status = "wait";

    const result = await connectRedis();

    expect(result).toBe(true);
    expect(redis.connect).toHaveBeenCalledOnce();
    expect(redis.ping).toHaveBeenCalledOnce();
  });

  it("does not reconnect when Redis is already connected", async () => {
    redis.status = "ready";

    const result = await connectRedis();

    expect(result).toBe(true);
    expect(redis.connect).not.toHaveBeenCalled();
    expect(redis.ping).toHaveBeenCalledOnce();
  });

  it("returns false when the Redis connection fails", async () => {
    redis.connect.mockRejectedValueOnce(new Error("Redis connection refused"));

    const result = await connectRedis();

    expect(result).toBe(false);
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it("returns false when Redis does not respond with PONG", async () => {
    redis.status = "ready";
    redis.ping.mockResolvedValueOnce("INVALID");

    const result = await connectRedis();

    expect(result).toBe(false);
  });

  it("gracefully quits Redis when the connection is ready", async () => {
    redis.status = "ready";

    await disconnectRedis();

    expect(redis.quit).toHaveBeenCalledOnce();
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects Redis directly when it is not ready or ended", async () => {
    redis.status = "wait";

    await disconnectRedis();

    expect(redis.disconnect).toHaveBeenCalledOnce();
    expect(redis.quit).not.toHaveBeenCalled();
  });

  it("does nothing when Redis is already ended", async () => {
    redis.status = "end";

    await disconnectRedis();

    expect(redis.disconnect).not.toHaveBeenCalled();
    expect(redis.quit).not.toHaveBeenCalled();
  });

  it("handles errors during graceful disconnection", async () => {
    redis.status = "ready";

    redis.quit.mockRejectedValueOnce(new Error("Redis quit failed"));

    await expect(disconnectRedis()).resolves.toBeUndefined();

    expect(redis.disconnect).toHaveBeenCalledOnce();
  });
});
