
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import { env } from "../config/env.js";

const queueName = `linkforge-retry-verification-${Date.now()}`;

const producerRedis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
});

const workerRedis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
});

let queue;
let worker;

let processorRuns = 0;

async function main() {
  try {
    await producerRedis.connect();
    await workerRedis.connect();

    console.log("Redis connections established.");

    queue = new Queue(queueName, {
      connection: producerRedis,
    });

    worker = new Worker(
      queueName,
      async (job) => {
        processorRuns += 1;

        console.log(
          `Processing attempt ${processorRuns} of 3...`,
        );

        if (processorRuns <= 2) {
          throw new Error(
            `Intentional test failure ${processorRuns}`,
          );
        }

        return {
          success: true,
          processorRuns,
        };
      },
      {
        connection: workerRedis,
        concurrency: 1,
      },
    );

    await worker.waitUntilReady();

    console.log("Temporary BullMQ worker is ready.");

    const completion = new Promise((resolve, reject) => {
      worker.on("completed", (job, result) => {
        resolve({ job, result });
      });

      worker.on("failed", (job, error) => {
        console.log(
          `Attempt failed (${job?.attemptsMade ?? "unknown"}): ${error.message}`,
        );

        if (
          job &&
          job.attemptsMade >= job.opts.attempts
        ) {
          reject(error);
        }
      });

      worker.on("error", reject);
    });

    await queue.add(
      "retry-verification",
      {
        purpose: "verify-real-bullmq-retries",
      },
      {
        attempts: 3,
        backoff: {
          type: "fixed",
          delay: 100,
        },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    console.log("Test job added. Waiting for retries...");

    let timeoutId;

    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error("BullMQ retry verification timed out."),
          );
        }, 15000);
      });

      const { result } = await Promise.race([
        completion,
        timeout,
      ]);

      if (
        processorRuns !== 3 ||
        result.success !== true
      ) {
        throw new Error(
          `Unexpected result: processor ran ${processorRuns} times.`,
        );
      }

      console.log("---------------------------------------");
      console.log("BULLMQ RETRY VERIFICATION PASSED");
      console.log("---------------------------------------");
      console.log(`Processing attempts : ${processorRuns}`);
      console.log(`Final result        : ${result.success}`);
      console.log("First two attempts  : Failed as expected");
      console.log("Third attempt       : Succeeded");
      console.log("---------------------------------------");
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    if (worker) {
      await worker.close().catch((error) => {
        console.error("Worker cleanup failed:", error.message);
      });
    }

    if (queue) {
      await queue.close().catch((error) => {
        console.error("Queue cleanup failed:", error.message);
      });
    }

    if (producerRedis.status === "ready") {
      await producerRedis.quit().catch(() => {
        producerRedis.disconnect();
      });
    } else {
      producerRedis.disconnect();
    }

    if (workerRedis.status === "ready") {
      await workerRedis.quit().catch(() => {
        workerRedis.disconnect();
      });
    } else {
      workerRedis.disconnect();
    }

    console.log("Temporary retry-test resources closed.");
  }
}

main().catch((error) => {
  console.error("BullMQ retry verification failed:", error);
  process.exitCode = 1;
});
