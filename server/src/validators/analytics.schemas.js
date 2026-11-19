
import { z } from "zod";

export const analyticsLinkIdSchema = z.object({
  id: z.string().uuid("A valid URL ID is required."),
});
