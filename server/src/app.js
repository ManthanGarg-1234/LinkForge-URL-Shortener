
import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.js";
import { openApiSpec } from "./config/openapi.js";

import healthRoutes from "./routes/health.routes.js";

import { notFoundHandler } from "./middleware/not-found.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to LinkForge API",
    documentation: "/api/v1/docs",
  });
});

// OpenAPI JSON specification.
app.get("/api/v1/docs.json", (req, res) => {
  res.status(200).json(openApiSpec);
});

// Interactive Swagger documentation.
app.use(
  "/api/v1/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    explorer: true,
    customSiteTitle: "LinkForge API Documentation",
  })
);

// Health endpoints.
app.use("/api/v1/health", healthRoutes);

// 404 and centralized error handling.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
