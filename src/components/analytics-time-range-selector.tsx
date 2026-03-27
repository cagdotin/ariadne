import { useRef } from "react";
import { Calendar } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { use_container_width } from "@/hooks/use-container-width";
import {
  use_analytics_time_range,
  RANGE_OPTIONS,
  range_label,
  type RangeDays,
} from "./analytics-time-range-provider";
import { RangePicker } from "./range-picker";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";

/** Width threshold below which the segmented control collapses into a menu. */
const COLLAPSE_THRESHOLD = 340;

/**
 * Header-level analytics time-range selector.
 *
 * Renders the full segmented `RangePicker` when there is enough room and
 * falls back to a compact dropdown trigger on mobile or narrow headers.
 *
 * This component is fully presentational — it reads/writes via the global
 * `AnalyticsTimeRangeProvider` and has no route awareness.
 */
export function AnalyticsTimeRangeSelector() {
  const { range_days, set_range_days } = use_analytics_time_range();
  const is_mobile = useIsMobile();
  const container_ref = useRef<HTMLDivElement>(null);
  const container_width = use_container_width(container_ref);

  const should_collapse = is_mobile || container_width < COLLAPSE_THRESHOLD;

  return (
    <div ref={container_ref} className="flex items-center shrink-0">
      {should_collapse ? (
        <CompactSelector
          value={range_days}
          on_change={set_range_days}
        />
      ) : (
        <RangePicker
          options={[...RANGE_OPTIONS]}
          value={range_days}
          on_change={(v) => set_range_days(v as RangeDays)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact dropdown fallback for narrow widths
// ---------------------------------------------------------------------------

function CompactSelector({
  value,
  on_change,
}: {
  value: RangeDays;
  on_change: (v: RangeDays) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5 px-2 h-7 text-xs">
            <Calendar className="size-3.5" />
            <span>{range_label(value)}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(v) => on_change(Number(v) as RangeDays)}
        >
          {RANGE_OPTIONS.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={String(opt.value)}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
