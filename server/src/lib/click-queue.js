
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";

import { env } from "../config/env.js";
import { recordClick } from "../services/url.service.js";

const QUEUE_NAME = "linkforge-click-events";

const QUEUE_OPTIONS = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

function createRedisConnection({ worker = false } = {}) {
  return new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: !worker,
    enableOfflineQueue: false,
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 5000,

    retryStrategy(times) {
      return Math.min(times * 500, 2000);
    },
  });
}

function validateClickTimestamp(clickedAt) {
  if (
    !(clickedAt instanceof Date) ||
    !Number.isFinite(clickedAt.getTime())
  ) {
    throw new TypeError("A valid click timestamp is required.");
  }
}

const queueRedis = createRedisConnection();

export const clickQueue = new Queue(QUEUE_NAME, {
  connection: queueRedis,
  defaultJobOptions: QUEUE_OPTIONS,
});

let clickWorker = null;
let workerRedis = null;

export async function enqueueClick({
  shortUrlId,
  referrerOrigin = null,
  clickedAt,
}) {
  if (!shortUrlId) {
    throw new TypeError("Short URL ID is required.");
  }

  validateClickTimestamp(clickedAt);

  return clickQueue.add("record-click", {
    shortUrlId,
    referrerOrigin,
    clickedAt: clickedAt.toISOString(),
  });
}

export async function startClickWorker() {
  if (clickWorker) {
    return clickWorker;
  }

  workerRedis = createRedisConnection({ worker: true });

  clickWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name !== "record-click") {
        throw new Error(`Unsupported click job: ${job.name}`);
      }

      const {
        shortUrlId,
        referrerOrigin = null,
        clickedAt,
      } = job.data;

      // Older queued jobs did not store a click timestamp.
      // Preserve their previous processing-time behavior.
      const eventTimestamp =
        clickedAt === undefined
          ? new Date()
          : new Date(clickedAt);

      if (!Number.isFinite(eventTimestamp.getTime())) {
        throw new TypeError("Click job contains an invalid timestamp.");
      }

      await recordClick({
        shortUrlId,
        referrerOrigin,
        clickedAt: eventTimestamp,
      });
    },
    {
      connection: workerRedis,
      concurrency: 10,
    },
  );

  clickWorker.on("completed", (job) => {
    console.log(`Click event processed: ${job.id}`);
  });

  clickWorker.on("failed", (job, error) => {
    console.error(
      `Click event failed${job ? `: ${job.id}` : ""}:`,
      error.message,
    );
  });

  clickWorker.on("error", (error) => {
    console.error("Click worker error:", error.message);
  });

  try {
    await clickWorker.waitUntilReady();

    console.log("BullMQ click worker is ready.");

    return clickWorker;
  } catch (error) {
    console.error("Unable to start click worker:", error.message);

    await clickWorker.close().catch(() => {});
    clickWorker = null;

    workerRedis.disconnect();
    workerRedis = null;

    throw error;
  }
}

export async function closeClickQueue() {
  if (clickWorker) {
    await clickWorker.close();
    clickWorker = null;
    console.log("BullMQ click worker closed.");
  }

  if (workerRedis) {
    workerRedis.disconnect();
    workerRedis = null;
  }

  await clickQueue.close();

  if (queueRedis.status === "ready") {
    await queueRedis.quit();
  } else if (queueRedis.status !== "end") {
    queueRedis.disconnect();
  }

  console.log("Click queue closed.");
}
