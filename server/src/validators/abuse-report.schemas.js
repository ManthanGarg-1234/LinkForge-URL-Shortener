import { z } from "zod";

export const createAbuseReportSchema = z
  .object({
    shortCode: z
      .string()
      .trim()
      .min(1, "Short code is required.")
      .max(16, "Short code cannot exceed 16 characters.")
      .regex(
        /^[A-Za-z0-9]+$/,
        "Short code must contain only letters and numbers.",
      ),

    reason: z.enum([
      "PHISHING",
      "MALWARE",
      "SPAM",
      "SCAM",
      "OTHER",
    ]),

    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters.")
      .optional(),
  })
  .strict();