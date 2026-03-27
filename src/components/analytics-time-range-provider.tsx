import { createContext, useCallback, useContext, useState } from "react";

/**
 * Canonical set of time-range options used everywhere in the app.
 * Shared between the provider, header selector, and any page that
 * needs to display the current range label.
 */
export const RANGE_OPTIONS = [
  { label: "Today", value: 1 },
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
] as const;

export type RangeDays = (typeof RANGE_OPTIONS)[number]["value"];

const ALLOWED_VALUES = new Set<number>(RANGE_OPTIONS.map((o) => o.value));
const DEFAULT_RANGE: RangeDays = 30;
const STORAGE_KEY = "ariadne:analytics-time-range-days";

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function read_stored_range(): RangeDays {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_RANGE;
    const parsed = Number(raw);
    if (ALLOWED_VALUES.has(parsed)) return parsed as RangeDays;
    // Bad value — clear and fall back
    localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_RANGE;
  } catch {
    return DEFAULT_RANGE;
  }
}

function write_stored_range(days: RangeDays) {
  try {
    localStorage.setItem(STORAGE_KEY, String(days));
  } catch {
    // Storage full / unavailable — ignore
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AnalyticsTimeRangeState {
  range_days: RangeDays;
  set_range_days: (days: RangeDays) => void;
}

const AnalyticsTimeRangeContext = createContext<AnalyticsTimeRangeState | null>(
  null,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AnalyticsTimeRangeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [range_days, set_range_state] = useState<RangeDays>(read_stored_range);

  const set_range_days = useCallback((days: RangeDays) => {
    if (!ALLOWED_VALUES.has(days)) return;
    set_range_state(days);
    write_stored_range(days);
  }, []);

  return (
    <AnalyticsTimeRangeContext.Provider value={{ range_days, set_range_days }}>
      {children}
    </AnalyticsTimeRangeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function use_analytics_time_range(): AnalyticsTimeRangeState {
  const ctx = useContext(AnalyticsTimeRangeContext);
  if (!ctx) {
    throw new Error(
      "use_analytics_time_range must be used within AnalyticsTimeRangeProvider",
    );
  }
  return ctx;
}

/** Convenience: get the display label for a given range_days value. */
export function range_label(days: number): string {
  const opt = RANGE_OPTIONS.find((o) => o.value === days);
  return opt?.label ?? `${days}d`;
}
