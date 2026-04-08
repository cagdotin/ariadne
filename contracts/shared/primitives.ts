import { z } from "zod";

// ─── Cross-domain building blocks ───────────────────────────────────────────

export const day_count_schema = z.object({
  date: z.string(),
  count: z.number(),
});
export type DayCount = z.infer<typeof day_count_schema>;

export const day_cost_schema = z.object({
  date: z.string(),
  cost: z.number(),
});
export type DayCost = z.infer<typeof day_cost_schema>;

export const name_count_schema = z.object({
  name: z.string(),
  count: z.number(),
});
export type NameCount = z.infer<typeof name_count_schema>;

export const project_summary_schema = z.object({
  name: z.string(),
  path: z.string(),
  session_count: z.number(),
  total_cost: z.number(),
  total_tokens: z.number(),
  last_active: z.string(),
});
export type ProjectSummary = z.infer<typeof project_summary_schema>;
