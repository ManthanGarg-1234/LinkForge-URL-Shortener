
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";

import { allowedOrigins, env } from "./config/env.js";
import { openApiSpec } from "./config/openapi.js";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import passwordResetRoutes from "./routes/password-reset.routes.js";
import urlRoutes from "./routes/url.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import redirectRoutes from "./routes/redirect.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import abuseReportRoutes from "./routes/abuse-report.routes.js";

import { notFoundHandler } from "./middleware/not-found.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.disable("x-powered-by");

// Caddy is the only trusted reverse proxy in the production Docker network.
// The API must not expose a host-published port.
app.set("trust proxy", 1);

const isProduction = env.NODE_ENV === "production";

app.use(
  helmet({
    crossOriginOpenerPolicy: {
      policy: "same-origin-allow-popups",
    },

    // HSTS is appropriate only when the application is served over HTTPS.
    strictTransportSecurity: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
        }
      : false,

    // Avoid forcing HTTPS for local HTTP development domains.
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
  }),
);

// CORS allows only explicitly configured origins.
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// Must run before routes that read HTTP-only authentication cookies.
app.use(cookieParser());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to LinkForge API",
    ...(!isProduction && {
      documentation: "/api/v1/docs",
    }),
  });
});

// Interactive API documentation is available only outside production.
if (!isProduction) {
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
    }),
  );
}

// API routes.
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth", passwordResetRoutes);
app.use("/api/v1/urls", urlRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/abuse-reports", abuseReportRoutes);

app.use("/", redirectRoutes);

// 404 and centralized error handling.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
