
import { z } from "zod";

export const adminAbuseReportIdSchema = z.object({
  id: z.string().uuid(),
});

export const adminAbuseReportListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "DISMISSED", "CONFIRMED"]).optional(),
  reason: z.enum([
    "PHISHING",
    "MALWARE",
    "SPAM",
    "SCAM",
    "OTHER",
  ]).optional(),
  search: z.string().trim().max(100).optional(),
});

export const reviewAbuseReportSchema = z.object({
  status: z.enum(["DISMISSED", "CONFIRMED"]),
  resolutionNote: z
    .string()
    .trim()
    .max(1000, "Resolution note cannot exceed 1000 characters.")
    .optional(),
}).strict();
