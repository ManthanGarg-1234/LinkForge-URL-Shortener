import { z } from "zod";

export const adminUserIdSchema = z.object({
  id: z.string().uuid(),
});

export const adminUserListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(["USER", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});