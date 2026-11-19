
import { z } from "zod";

const originalUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required.")
  .max(2048, "URL cannot exceed 2048 characters.")
  .url("Enter a valid URL.")
  .refine(
    (value) => {
      try {
        const url = new URL(value);

        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          Boolean(url.hostname) &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "Only valid HTTP and HTTPS URLs without embedded credentials are allowed.",
    },
  );

export const createShortUrlSchema = z
  .object({
    originalUrl: originalUrlSchema,
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.expiresAt ||
      new Date(data.expiresAt).getTime() > Date.now(),
    {
      message: "Expiration date must be in the future.",
      path: ["expiresAt"],
    },
  );

export const listShortUrlsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const updateShortUrlStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const shortUrlIdSchema = z
  .object({
    id: z.string().uuid("Invalid short URL ID."),
  })
  .strict();
