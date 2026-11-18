
import http from "node:http";

import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const server = http.createServer(app);

let isShuttingDown = false;

async function startServer() {
  try {
    // Establish the database connection before accepting requests.
    await prisma.$connect();

    console.log("Database connection established.");

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
      console.log("---------------------------------------");
    });
  } catch (error) {
    console.error("Failed to start LinkForge API.");
    console.error("Database connection error:", error.message);

    await prisma.$disconnect();
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
  }, 10000);

  forceShutdown.unref();

  try {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await prisma.$disconnect();

    console.log("Database disconnected.");
    console.log("LinkForge shut down successfully.");

    clearTimeout(forceShutdown);
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
