
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
      {
        name: "URLs",
        description: "Short URL creation and management",
      },
      {
        name: "Analytics",
        description: "Click analytics for the authenticated user's short URLs",
      },
      {
        name: "Redirects",
        description: "Short URL redirection",
      },
    ],

    components: {
      securitySchemes: {
        accessCookie: {
          type: "apiKey",
          in: "cookie",
          name: "lf_access",
          description:
            "HTTP-only access-token cookie issued after authentication.",
        },
      },

      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  example: "VALIDATION_ERROR",
                },
                message: {
                  type: "string",
                  example: "Request validation failed.",
                },
              },
            },
          },
        },

        ShortUrl: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            shortCode: {
              type: "string",
              pattern: "^[0-9A-Za-z]{8}$",
              example: "Ab12Cd34",
            },
            originalUrl: {
              type: "string",
              format: "uri",
              example: "https://example.com",
            },
            shortUrl: {
              type: "string",
              format: "uri",
              example: "http://localhost:5000/Ab12Cd34",
            },
            isActive: {
              type: "boolean",
              example: true,
            },
            expiresAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },

        Pagination: {
          type: "object",
          properties: {
            page: {
              type: "integer",
              example: 1,
            },
            limit: {
              type: "integer",
              example: 20,
            },
            total: {
              type: "integer",
              example: 45,
            },
            totalPages: {
              type: "integer",
              example: 3,
            },
          },
        },

        AnalyticsSummary: {
          type: "object",
          properties: {
            totalLinks: {
              type: "integer",
              example: 12,
            },
            activeLinks: {
              type: "integer",
              example: 10,
            },
            totalClicks: {
              type: "integer",
              example: 245,
            },
          },
        },

        DailyClick: {
          type: "object",
          properties: {
            date: {
              type: "string",
              format: "date",
              example: "2026-11-19",
            },
            clicks: {
              type: "integer",
              example: 15,
            },
          },
        },

        TopPerformingLink: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            shortCode: {
              type: "string",
              example: "Ab12Cd34",
            },
            originalUrl: {
              type: "string",
              format: "uri",
            },
            isActive: {
              type: "boolean",
            },
            clicks: {
              type: "integer",
              example: 85,
            },
          },
        },

        AnalyticsPeriod: {
          type: "object",
          properties: {
            days: {
              type: "integer",
              example: 30,
            },
            startDate: {
              type: "string",
              format: "date",
            },
            endDate: {
              type: "string",
              format: "date",
            },
            timezone: {
              type: "string",
              example: "UTC",
            },
          },
        },

        ReferrerStat: {
          type: "object",
          properties: {
            referrer: {
              type: "string",
              example: "https://google.com",
              description:
                "Referrer origin, or Direct / Unknown when no valid referrer was provided.",
            },
            clicks: {
              type: "integer",
              example: 32,
            },
          },
        },
      },
    },

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

      "/api/v1/urls": {
        post: {
          tags: ["URLs"],
          summary: "Create a short URL",
          description:
            "Creates a short URL for the authenticated user. Requires a trusted request origin and authentication.",
          security: [{ accessCookie: [] }],

          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["originalUrl"],
                  properties: {
                    originalUrl: {
                      type: "string",
                      format: "uri",
                      maxLength: 2048,
                      example: "https://example.com/article",
                    },
                    expiresAt: {
                      type: "string",
                      format: "date-time",
                      description:
                        "Optional expiration timestamp. Must be in the future and include a timezone offset.",
                      example: "2027-01-01T00:00:00.000Z",
                    },
                  },
                },
              },
            },
          },

          responses: {
            201: {
              description: "Short URL created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: {
                        type: "boolean",
                        example: true,
                      },
                      message: {
                        type: "string",
                        example: "Short URL created successfully.",
                      },
                      data: {
                        type: "object",
                        properties: {
                          url: {
                            $ref: "#/components/schemas/ShortUrl",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Invalid request data",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            401: {
              description: "Authentication required",
            },
            403: {
              description: "Untrusted request origin",
            },
            429: {
              description: "URL creation rate limit exceeded",
            },
            503: {
              description: "Unable to generate a unique short code",
            },
          },
        },

        get: {
          tags: ["URLs"],
          summary: "List the authenticated user's short URLs",
          description:
            "Returns a paginated list of short URLs belonging only to the authenticated user.",
          security: [{ accessCookie: [] }],

          parameters: [
            {
              name: "page",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                default: 1,
              },
              description: "Page number.",
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                default: 20,
              },
              description: "Number of records per page.",
            },
          ],

          responses: {
            200: {
              description: "Short URL list retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: {
                        type: "boolean",
                        example: true,
                      },
                      data: {
                        type: "object",
                        properties: {
                          urls: {
                            type: "array",
                            items: {
                              $ref: "#/components/schemas/ShortUrl",
                            },
                          },
                          pagination: {
                            $ref: "#/components/schemas/Pagination",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Invalid pagination parameters",
            },
            401: {
              description: "Authentication required",
            },
          },
        },
      },

      "/api/v1/urls/{id}/status": {
        patch: {
          tags: ["URLs"],
          summary: "Activate or deactivate a short URL",
          description:
            "Changes the active status of a short URL belonging to the authenticated user. An inactive URL cannot redirect to its original destination.",
          security: [{ accessCookie: [] }],

          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "UUID of the short URL record.",
              schema: {
                type: "string",
                format: "uuid",
                example: "550e8400-e29b-41d4-a716-446655440000",
              },
            },
          ],

          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["isActive"],
                  properties: {
                    isActive: {
                      type: "boolean",
                      example: false,
                      description:
                        "Set false to deactivate or true to reactivate the short URL.",
                    },
                  },
                },
              },
            },
          },

          responses: {
            200: {
              description: "Short URL status updated successfully",
            },
            400: {
              description: "Invalid URL ID or status value",
            },
            401: {
              description: "Authentication required",
            },
            403: {
              description: "Untrusted request origin",
            },
            404: {
              description:
                "Short URL does not exist or does not belong to the authenticated user.",
            },
          },
        },
      },

      "/api/v1/urls/{id}": {
        delete: {
          tags: ["URLs"],
          summary: "Delete a short URL",
          description:
            "Permanently deletes a short URL belonging to the authenticated user.",
          security: [{ accessCookie: [] }],

          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "UUID of the short URL record.",
              schema: {
                type: "string",
                format: "uuid",
                example: "550e8400-e29b-41d4-a716-446655440000",
              },
            },
          ],

          responses: {
            200: {
              description: "Short URL deleted successfully",
            },
            400: {
              description: "Invalid URL ID",
            },
            401: {
              description: "Authentication required",
            },
            403: {
              description: "Untrusted request origin",
            },
            404: {
              description:
                "Short URL does not exist or does not belong to the authenticated user.",
            },
          },
        },
      },

      "/api/v1/analytics/overview": {
        get: {
          tags: ["Analytics"],
          summary: "Get account analytics overview",
          description:
            "Returns all-time link totals and click totals, the five top-performing links, and daily click counts for the last 30 UTC calendar days. Results are restricted to the authenticated user. Clicks represent recorded redirect requests, not verified unique human visitors.",
          security: [{ accessCookie: [] }],

          responses: {
            200: {
              description: "Analytics overview retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: {
                        type: "boolean",
                        example: true,
                      },
                      data: {
                        type: "object",
                        properties: {
                          summary: {
                            $ref: "#/components/schemas/AnalyticsSummary",
                          },
                          dailyClicks: {
                            type: "array",
                            items: {
                              $ref: "#/components/schemas/DailyClick",
                            },
                          },
                          topLinks: {
                            type: "array",
                            items: {
                              $ref: "#/components/schemas/TopPerformingLink",
                            },
                          },
                          period: {
                            $ref: "#/components/schemas/AnalyticsPeriod",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: {
              description: "Authentication required",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            500: {
              description: "Unable to retrieve analytics",
            },
          },
        },
      },

      "/api/v1/analytics/links/{id}": {
        get: {
          tags: ["Analytics"],
          summary: "Get analytics for an individual short URL",
          description:
            "Returns all-time clicks, last-30-day clicks, daily click counts, and referrer-origin breakdown for a short URL owned by the authenticated user. A missing or non-owned URL returns the same 404 response.",
          security: [{ accessCookie: [] }],

          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "UUID of the short URL record.",
              schema: {
                type: "string",
                format: "uuid",
                example: "550e8400-e29b-41d4-a716-446655440000",
              },
            },
          ],

          responses: {
            200: {
              description: "Link analytics retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: {
                        type: "boolean",
                        example: true,
                      },
                      data: {
                        type: "object",
                        properties: {
                          link: {
                            $ref: "#/components/schemas/ShortUrl",
                          },
                          summary: {
                            type: "object",
                            properties: {
                              totalClicks: {
                                type: "integer",
                                example: 120,
                              },
                              clicksLast30Days: {
                                type: "integer",
                                example: 35,
                              },
                            },
                          },
                          dailyClicks: {
                            type: "array",
                            items: {
                              $ref: "#/components/schemas/DailyClick",
                            },
                          },
                          referrers: {
                            type: "array",
                            items: {
                              $ref: "#/components/schemas/ReferrerStat",
                            },
                          },
                          period: {
                            type: "object",
                            properties: {
                              days: {
                                type: "integer",
                                example: 30,
                              },
                              startDate: {
                                type: "string",
                                format: "date",
                              },
                              timezone: {
                                type: "string",
                                example: "UTC",
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Invalid URL ID",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            401: {
              description: "Authentication required",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            404: {
              description:
                "Short URL does not exist or does not belong to the authenticated user.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
            500: {
              description: "Unable to retrieve link analytics",
            },
          },
        },
      },

      "/{shortCode}": {
        get: {
          tags: ["Redirects"],
          summary: "Redirect to the original URL",
          description:
            "Resolves an active, non-expired short code, records a click event when possible, and redirects to its original URL.",
          parameters: [
            {
              name: "shortCode",
              in: "path",
              required: true,
              schema: {
                type: "string",
                pattern: "^[0-9A-Za-z]{8}$",
                example: "Ab12Cd34",
              },
            },
          ],

          responses: {
            302: {
              description: "Redirect to the original URL",
              headers: {
                Location: {
                  schema: {
                    type: "string",
                    format: "uri",
                  },
                  description: "Original destination URL.",
                },
                "Cache-Control": {
                  schema: {
                    type: "string",
                    example: "no-store",
                  },
                },
              },
            },
            404: {
              description:
                "Short URL does not exist, is inactive, or has expired.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  apis: [],
};

export const openApiSpec = swaggerJsdoc(options);
