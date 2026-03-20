import { useMemo } from "react";
import { subWeeks, formatISO } from "date-fns";
import type { DayCount } from "../schemas/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContributionGraph,
  ContributionGraphCalendar,
  ContributionGraphBlock,
  ContributionGraphFooter,
  ContributionGraphTotalCount,
  ContributionGraphLegend,
  type Activity,
} from "@/components/kibo-ui/contribution-graph";

interface ActivityHeatmapProps {
  data: DayCount[];
}

/** Convert DayCount[] into Activity[] with computed levels, spanning the last 52 weeks. */
function to_activities(data: DayCount[]): Activity[] {
  const lookup = new Map<string, number>();
  let max_count = 0;
  for (const item of data) {
    lookup.set(item.date, item.count);
    if (item.count > max_count) max_count = item.count;
  }

  const get_level = (count: number): number => {
    if (count === 0) return 0;
    if (max_count <= 4) return Math.min(count, 4);
    const q = max_count / 4;
    if (count <= q) return 1;
    if (count <= q * 2) return 2;
    if (count <= q * 3) return 3;
    return 4;
  };

  // Build date range: ~52 weeks back from today
  const today = new Date();
  const start = subWeeks(today, 52);
  const start_str = formatISO(start, { representation: "date" });
  const end_str = formatISO(today, { representation: "date" });

  // Ensure the range bookends exist so the component fills the full 52 weeks
  const activities: Activity[] = [];
  const seen = new Set<string>();

  // Add the start bookend
  const start_count = lookup.get(start_str) ?? 0;
  activities.push({
    date: start_str,
    count: start_count,
    level: get_level(start_count),
  });
  seen.add(start_str);

  // Add all data points within range
  for (const item of data) {
    if (
      item.date >= start_str &&
      item.date <= end_str &&
      !seen.has(item.date)
    ) {
      activities.push({
        date: item.date,
        count: item.count,
        level: get_level(item.count),
      });
      seen.add(item.date);
    }
  }

  // Add the end bookend
  if (!seen.has(end_str)) {
    const end_count = lookup.get(end_str) ?? 0;
    activities.push({
      date: end_str,
      count: end_count,
      level: get_level(end_count),
    });
  }

  return activities;
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const activities = useMemo(() => to_activities(data), [data]);

  if (activities.length === 0) {
    return null;
  }

  return (
    <Card className="w-full xl:max-w-2/3 2xl:w-1/2">
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        <ContributionGraph
          data={activities}
          blockSize={11}
          blockMargin={3}
          blockRadius={2}
          fontSize={10}
          labels={{
            totalCount: "{{count}} sessions in {{year}}",
            legend: { less: "Less", more: "More" },
          }}
          weekStart={1}
        >
          <ContributionGraphCalendar responsive>
            {(props) => <ContributionGraphBlock {...props} />}
          </ContributionGraphCalendar>
          <ContributionGraphFooter>
            <ContributionGraphTotalCount />
            <ContributionGraphLegend />
          </ContributionGraphFooter>
        </ContributionGraph>
      </CardContent>
    </Card>
  );
}
