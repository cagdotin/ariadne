import { z } from "zod";

export const qmd_context_schema = z.object({
  path: z.string(),
  context: z.string(),
});
export type QmdContext = z.infer<typeof qmd_context_schema>;

export const qmd_collection_schema = z.object({
  name: z.string(),
  path: z.string(),
  pattern: z.string(),
  ignore_patterns: z.array(z.string()),
  include_by_default: z.boolean(),
  update_command: z.string().nullable(),
  doc_count: z.number(),
  active_doc_count: z.number(),
  embedded_count: z.number(),
  last_modified: z.string().nullable(),
  contexts: z.array(qmd_context_schema),
});
export type QmdCollection = z.infer<typeof qmd_collection_schema>;

export const qmd_document_schema = z.object({
  path: z.string(),
  title: z.string(),
  docid: z.string(),
  collection: z.string(),
  modified_at: z.string(),
  body_length: z.number(),
});
export type QmdDocument = z.infer<typeof qmd_document_schema>;

export const qmd_status_schema = z.object({
  total_documents: z.number(),
  active_documents: z.number(),
  embedded_chunks: z.number(),
  needs_embedding: z.number(),
  collection_count: z.number(),
  db_size_bytes: z.number(),
  global_context: z.string().nullable(),
  days_since_update: z.number().nullable(),
});
export type QmdStatus = z.infer<typeof qmd_status_schema>;

export const qmd_collection_detail_schema = z.object({
  collection: qmd_collection_schema,
  documents: z.array(qmd_document_schema),
});
export type QmdCollectionDetail = z.infer<typeof qmd_collection_detail_schema>;
