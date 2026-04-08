import { z } from "zod";
import { day_count_schema, day_cost_schema } from "../shared/primitives";

export const weekday_stat_schema = z.object({
  day: z.string(),
  sessions: z.number(),
  cost: z.number(),
  share: z.number(),
});
export type WeekdayStat = z.infer<typeof weekday_stat_schema>;

export const time_of_day_stat_schema = z.object({
  label: z.string(),
  hour_start: z.number(),
  hour_end: z.number(),
  sessions: z.number(),
  cost: z.number(),
  share: z.number(),
});
export type TimeOfDayStat = z.infer<typeof time_of_day_stat_schema>;

export const hour_count_schema = z.object({
  hour: z.string(),
  count: z.number(),
});
export type HourCount = z.infer<typeof hour_count_schema>;

export const time_breakdown_schema = z.object({
  range_days: z.number(),
  total_sessions: z.number(),
  total_cost: z.number(),
  avg_cost_per_session: z.number(),
  total_tokens: z.number(),
  by_weekday: z.array(weekday_stat_schema),
  by_time_of_day: z.array(time_of_day_stat_schema),
  daily_sessions: z.array(day_count_schema),
  daily_cost: z.array(day_cost_schema),
  hourly_sessions: z.array(hour_count_schema),
});
export type TimeBreakdown = z.infer<typeof time_breakdown_schema>;
