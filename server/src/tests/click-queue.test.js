import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    redisInstances: [],
    queueInstance: null,
    workerInstance: null,
    recordClick: vi.fn(),
  };

  state.RedisMock = vi.fn(function (url, options) {
    this.url = url;
    this.options = options;
    this.status = "ready";
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue("OK");

    state.redisInstances.push(this);
  });

  state.QueueMock = vi.fn(function (name, options) {
    this.name = name;
    this.options = options;
    this.add = vi.fn().mockResolvedValue({ id: "job-123" });
    this.close = vi.fn().mockResolvedValue(undefined);

    state.queueInstance = this;
  });

  state.WorkerMock = vi.fn(function (name, processor, options) {
    this.name = name;
    this.processor = processor;
    this.options = options;
    this.on = vi.fn().mockReturnThis();
    this.waitUntilReady = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn().mockResolvedValue(undefined);

    state.workerInstance = this;
  });

  return state;
});

vi.mock("ioredis", () => ({
  default: mocks.RedisMock,
}));

vi.mock("bullmq", () => ({
  Queue: mocks.QueueMock,
  Worker: mocks.WorkerMock,
}));

vi.mock("../config/env.js", () => ({
  env: {
    REDIS_URL: "redis://127.0.0.1:6379",
  },
}));

vi.mock("../services/url.service.js", () => ({
  recordClick: mocks.recordClick,
}));

import {
  clickQueue,
  enqueueClick,
  startClickWorker,
  closeClickQueue,
} from "../lib/click-queue.js";

describe("BullMQ click queue", () => {
  beforeEach(() => {
    mocks.recordClick.mockReset();
    mocks.recordClick.mockResolvedValue({
      id: "click-123",
      shortUrlId: "url-123",
    });

    mocks.queueInstance.add.mockClear();
    mocks.queueInstance.close.mockClear();
  });

  it("creates the click queue with the expected name", () => {
    expect(clickQueue.name).toBe("linkforge-click-events");
  });

  it("configures five attempts with exponential backoff", () => {
    expect(clickQueue.options.defaultJobOptions).toMatchObject({
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  });

  it("enqueues a click event with the correct job name and payload", async () => {
    const event = {
      shortUrlId: "url-123",
      referrerOrigin: "https://google.com",
    };

    await enqueueClick(event);

    expect(clickQueue.add).toHaveBeenCalledWith("record-click", event);
  });

  it("enqueues a click event with a null referrer by default", async () => {
    await enqueueClick({
      shortUrlId: "url-123",
    });

    expect(clickQueue.add).toHaveBeenCalledWith("record-click", {
      shortUrlId: "url-123",
      referrerOrigin: null,
    });
  });

  it("rejects an event without a short URL ID", async () => {
    await expect(
      enqueueClick({
        referrerOrigin: "https://google.com",
      }),
    ).rejects.toThrow("Short URL ID is required.");

    expect(clickQueue.add).not.toHaveBeenCalled();
  });

  it("starts the worker with concurrency of ten", async () => {
    const worker = await startClickWorker();

    expect(worker).toBe(mocks.workerInstance);

    expect(mocks.WorkerMock).toHaveBeenCalledWith(
      "linkforge-click-events",
      expect.any(Function),
      expect.objectContaining({
        concurrency: 10,
      }),
    );

    expect(worker.waitUntilReady).toHaveBeenCalledOnce();
  });

  it("returns the existing worker when started again", async () => {
    const firstWorker = await startClickWorker();
    const constructorCalls = mocks.WorkerMock.mock.calls.length;

    const secondWorker = await startClickWorker();

    expect(secondWorker).toBe(firstWorker);
    expect(mocks.WorkerMock).toHaveBeenCalledTimes(constructorCalls);
  });

  it("persists a valid click event through recordClick", async () => {
    const worker = await startClickWorker();

    await worker.processor({
      name: "record-click",
      data: {
        shortUrlId: "url-123",
        referrerOrigin: "https://google.com",
      },
    });

    expect(mocks.recordClick).toHaveBeenCalledWith({
      shortUrlId: "url-123",
      referrerOrigin: "https://google.com",
    });
  });

  it("uses null when a worker job has no referrer", async () => {
    const worker = await startClickWorker();

    await worker.processor({
      name: "record-click",
      data: {
        shortUrlId: "url-123",
      },
    });

    expect(mocks.recordClick).toHaveBeenCalledWith({
      shortUrlId: "url-123",
      referrerOrigin: null,
    });
  });

  it("propagates database errors so BullMQ can retry the job", async () => {
    mocks.recordClick.mockRejectedValueOnce(
      new Error("Database temporarily unavailable"),
    );

    const worker = await startClickWorker();

    await expect(
      worker.processor({
        name: "record-click",
        data: {
          shortUrlId: "url-123",
          referrerOrigin: null,
        },
      }),
    ).rejects.toThrow("Database temporarily unavailable");
  });

  it("rejects unsupported job names", async () => {
    const worker = await startClickWorker();

    await expect(
      worker.processor({
        name: "unsupported-job",
        data: {
          shortUrlId: "url-123",
        },
      }),
    ).rejects.toThrow("Unsupported click job: unsupported-job");

    expect(mocks.recordClick).not.toHaveBeenCalled();
  });

  it("closes the worker, queue, and Redis connections", async () => {
    const worker = await startClickWorker();

    const workerConnection = mocks.redisInstances.at(-1);
    const queueConnection = mocks.redisInstances[0];

    await closeClickQueue();

    expect(worker.close).toHaveBeenCalledOnce();
    expect(workerConnection.disconnect).toHaveBeenCalledOnce();
    expect(clickQueue.close).toHaveBeenCalledOnce();
    expect(queueConnection.quit).toHaveBeenCalledOnce();
  });
});
