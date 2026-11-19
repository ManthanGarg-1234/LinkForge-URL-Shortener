
import { z } from "zod";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../utils/password.utils.js";

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().email().max(255).transform((value) =>
      value.toLowerCase()
    ),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    newPassword: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`
      )
      .max(
        PASSWORD_MAX_LENGTH,
        `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`
      ),
  })
  .strict();
