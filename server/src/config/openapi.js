
import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "LinkForge API",
      version: "1.0.0",
      description:
        "API documentation for LinkForge - a production-oriented URL Shortener and Link Management Platform.",
      contact: {
        name: "LinkForge API Support",
      },
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server",
      },
    ],
    tags: [
      {
        name: "General",
        description: "General API information",
      },
      {
        name: "Health",
        description: "Application health and readiness checks",
      },
    ],
    paths: {
      "/": {
        get: {
          tags: ["General"],
          summary: "API welcome endpoint",
          responses: {
            200: {
              description: "API welcome response",
            },
          },
        },
      },
      "/api/v1/health": {
        get: {
          tags: ["Health"],
          summary: "Application health check",
          responses: {
            200: {
              description: "Application and database are operational",
            },
            503: {
              description: "Database is unavailable",
            },
          },
        },
      },
      "/api/v1/health/live": {
        get: {
          tags: ["Health"],
          summary: "Liveness check",
          responses: {
            200: {
              description: "Application process is alive",
            },
          },
        },
      },
      "/api/v1/health/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: {
            200: {
              description: "Application is ready",
            },
            503: {
              description: "Application is not ready",
            },
          },
        },
      },
    },
  },
  apis: [],
};

export const openApiSpec = swaggerJsdoc(options);
