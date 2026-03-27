import { CalendarRange } from "lucide-react";
import {
  use_analytics_time_range,
  RANGE_OPTIONS,
  range_label,
  type RangeDays,
} from "./analytics-time-range-provider";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";

/**
 * Header-level analytics time-range selector.
 *
 * Wide (≥ md): shadcn Tabs segmented control.
 * Narrow (< md): compact dropdown showing the current label.
 */
export function AnalyticsTimeRangeSelector() {
  const { range_days, set_range_days } = use_analytics_time_range();

  return (
    <>
      {/* Expanded: shadcn Tabs — hidden below lg */}
      <Tabs
        value={String(range_days)}
        onValueChange={(v) => set_range_days(Number(v) as RangeDays)}
        className="hidden lg:flex shrink-0"
      >
        <TabsList>
          {RANGE_OPTIONS.map((opt) => (
            <TabsTrigger
              key={opt.value}
              value={String(opt.value)}
              className="text-xs px-2"
            >
              {opt.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Collapsed: dropdown — visible below lg */}
      <div className="lg:hidden shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm">
                <CalendarRange className="size-3.5 mr-1" />
                <span>{range_label(range_days)}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
            <DropdownMenuRadioGroup
              value={String(range_days)}
              onValueChange={(v) => set_range_days(Number(v) as RangeDays)}
            >
              {RANGE_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem
                  key={opt.value}
                  value={String(opt.value)}
                >
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
