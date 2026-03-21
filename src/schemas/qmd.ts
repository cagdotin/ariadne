import { z } from "zod";

export const QmdAvailabilitySchema = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  db_path: z.string().nullable(),
  db_size_bytes: z.number().nullable(),
});
export type QmdAvailability = z.infer<typeof QmdAvailabilitySchema>;

export const QmdIndexSchema = z.object({
  name: z.string(),
  file_stem: z.string(),
  db_path: z.string(),
  db_size_bytes: z.number(),
  collection_count: z.number(),
  document_count: z.number(),
  last_modified: z.string().nullable(),
});
export type QmdIndex = z.infer<typeof QmdIndexSchema>;

export const QmdContextSchema = z.object({
  path: z.string(),
  context: z.string(),
});
export type QmdContext = z.infer<typeof QmdContextSchema>;

export const QmdCollectionSchema = z.object({
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
  contexts: z.array(QmdContextSchema),
});
export type QmdCollection = z.infer<typeof QmdCollectionSchema>;

export const QmdDocumentSchema = z.object({
  path: z.string(),
  title: z.string(),
  docid: z.string(),
  collection: z.string(),
  modified_at: z.string(),
  body_length: z.number(),
});
export type QmdDocument = z.infer<typeof QmdDocumentSchema>;

export const QmdStatusSchema = z.object({
  total_documents: z.number(),
  active_documents: z.number(),
  embedded_chunks: z.number(),
  needs_embedding: z.number(),
  collection_count: z.number(),
  db_size_bytes: z.number(),
  global_context: z.string().nullable(),
  days_since_update: z.number().nullable(),
});
export type QmdStatus = z.infer<typeof QmdStatusSchema>;

export const QmdCollectionDetailSchema = z.object({
  collection: QmdCollectionSchema,
  documents: z.array(QmdDocumentSchema),
});
export type QmdCollectionDetail = z.infer<typeof QmdCollectionDetailSchema>;

export const QmdCommandResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
});
export type QmdCommandResult = z.infer<typeof QmdCommandResultSchema>;
