import { useEffect, useRef, useState } from "react";
import type { AnalyticsOverview, TimeBreakdown, ProjectFileStats } from "@/schemas/analytics";
import {
  get_analytics_overview,
  get_time_breakdown,
  get_project_file_stats,
} from "@/api/analytics";
import { use_project_scope } from "@/components/project-scope-provider";
import { RangePicker } from "@/components/range-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { error_message } from "@/lib/utils";
import { CostTab } from "./cost-tab";
import { ToolsTab } from "./tools-tab";
import { PatternsTab } from "./patterns-tab";
import { FilesTab } from "./files-tab";
import {
  DollarSign,
  Wrench,
  Clock,
  FolderOpen,
} from "lucide-react";

const range_options = [
  { label: "Today", value: 1 },
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];

export function Usage() {
  const { scope } = use_project_scope();
  const project_path = scope?.project_path;

  const [overview, set_overview] = useState<AnalyticsOverview | null>(null);
  const [time_data, set_time_data] = useState<TimeBreakdown | null>(null);
  const [file_stats, set_file_stats] = useState<ProjectFileStats | null>(null);
  const [range_days, set_range_days] = useState(30);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  const prev_project_path = useRef(project_path);

  useEffect(() => {
    let cancelled = false;
    const scope_changed = prev_project_path.current !== project_path;
    prev_project_path.current = project_path;

    const fetch_data = async () => {
      try {
        if (scope_changed || !overview) set_loading(true);
        set_error(null);

        const requests: [
          Promise<AnalyticsOverview>,
          Promise<TimeBreakdown>,
          Promise<ProjectFileStats | null>,
        ] = [
          get_analytics_overview(project_path, range_days),
          get_time_breakdown(range_days, project_path),
          project_path
            ? get_project_file_stats(project_path, range_days)
            : Promise.resolve(null),
        ];

        const [next_overview, next_time, next_files] = await Promise.all(requests);
        if (cancelled) return;

        set_overview(next_overview);
        set_time_data(next_time);
        set_file_stats(next_files);
      } catch (err) {
        if (cancelled) return;
        set_error(error_message(err, "Failed to load usage data"));
      } finally {
        if (!cancelled) set_loading(false);
      }
    };

    fetch_data();
    return () => { cancelled = true; };
  }, [project_path, range_days]);

  if (error) {
    return (
      <div className="min-w-0 w-full">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (loading || !overview || !time_data) {
    return (
      <div className="min-w-0 w-full space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-7 w-56" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full">
      <Tabs defaultValue="cost">
        <div className="flex items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="cost">
              <DollarSign className="size-3.5" />
              Cost
            </TabsTrigger>
            <TabsTrigger value="tools">
              <Wrench className="size-3.5" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="patterns">
              <Clock className="size-3.5" />
              Patterns
            </TabsTrigger>
            {project_path && (
              <TabsTrigger value="files">
                <FolderOpen className="size-3.5" />
                Files
              </TabsTrigger>
            )}
          </TabsList>
          <RangePicker
            options={range_options}
            value={range_days}
            on_change={set_range_days}
          />
        </div>

        <TabsContent value="cost">
          <CostTab overview={overview} time_data={time_data} />
        </TabsContent>

        <TabsContent value="tools">
          <ToolsTab overview={overview} />
        </TabsContent>

        <TabsContent value="patterns">
          <PatternsTab time_data={time_data} range_days={range_days} />
        </TabsContent>

        {project_path && (
          <TabsContent value="files">
            <FilesTab file_stats={file_stats} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
