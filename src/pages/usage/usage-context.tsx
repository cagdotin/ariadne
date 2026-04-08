import { createContext, useContext } from "react";
import type { AnalyticsOverview } from "@contracts/analytics/overview";
import type { TimeBreakdown } from "@contracts/analytics/time";
import type { ProjectFileStats } from "@contracts/analytics/files";

export interface UsageContextValue {
  overview: AnalyticsOverview | null;
  time_data: TimeBreakdown | null;
  file_stats: ProjectFileStats | null;
  range_days: number;
  loading: boolean;
  error: string | null;
}

const UsageContext = createContext<UsageContextValue | null>(null);

export const UsageProvider = UsageContext.Provider;

export function use_usage_context(): UsageContextValue {
  const ctx = useContext(UsageContext);
  if (!ctx) throw new Error("use_usage_context must be used within UsageProvider");
  return ctx;
}
