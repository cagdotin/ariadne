import { z } from "zod";

export const qmd_availability_schema = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  db_path: z.string().nullable(),
  db_size_bytes: z.number().nullable(),
});
export type QmdAvailability = z.infer<typeof qmd_availability_schema>;
