
import { z } from "zod";

const shortCodeSchema = z
  .string()
  .trim()
  .length(8, "Short code must contain exactly 8 characters.")
  .regex(/^[A-Za-z0-9]+$/, "Short code must be alphanumeric.");

export const adminShortCodeSchema = z.object({
  shortCode: shortCodeSchema,
});

export const blockShortUrlSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "A blocking reason must contain at least 10 characters.")
    .max(500, "A blocking reason cannot exceed 500 characters."),
}).strict();
