import { z } from "zod";

export const qmd_index_schema = z.object({
  name: z.string(),
  file_stem: z.string(),
  db_path: z.string(),
  db_size_bytes: z.number(),
  collection_count: z.number(),
  document_count: z.number(),
  last_modified: z.string().nullable(),
});
export type QmdIndex = z.infer<typeof qmd_index_schema>;
