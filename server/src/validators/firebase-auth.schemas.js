import { z } from "zod";

export const firebaseGoogleLoginSchema = z.object({
  idToken: z
    .string()
    .min(1, "Firebase ID token is required.")
    .max(10000, "Firebase ID token is too large."),
});