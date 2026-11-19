
import { z } from "zod";
import { passwordSchema } from "../utils/password.utils.js";

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must contain at least 2 characters.")
      .max(100, "Name must not exceed 100 characters."),

    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .max(255, "Email must not exceed 255 characters.")
      .transform((value) => value.toLowerCase()),

    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .max(255, "Email must not exceed 255 characters.")
      .transform((value) => value.toLowerCase()),

    password: z
      .string()
      .min(1, "Password is required.")
      .max(128, "Password is too long."),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z
      .string()
      .min(20, "Invalid verification token.")
      .max(200, "Invalid verification token."),
  })
  .strict();
