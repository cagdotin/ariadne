import { useEffect, useRef, useState } from "react";

import { Link, Outlet, useLocation } from "@tanstack/react-router";
import type { AnalyticsOverview, TimeBreakdown, ProjectFileStats } from "@/schemas/analytics";
import {
  get_analytics_overview,
  get_time_breakdown,
  get_project_file_stats,
} from "@/api/analytics";
import { use_project_scope } from "@/components/project-scope-provider";
import { use_analytics_time_range } from "@/components/analytics-time-range-provider";
import { cn, error_message } from "@/lib/utils";
import { UsageProvider } from "./usage-context";
import {
  DollarSign,
  Wrench,
  Clock,
  FolderOpen,
} from "lucide-react";

interface NavTab {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function UsageNav({ project_path }: { project_path: string | undefined }) {
  const location = useLocation();
  const pathname = location.pathname;

  const tabs: NavTab[] = [
    { to: "/usage/cost", label: "Cost", icon: DollarSign },
    { to: "/usage/tools", label: "Tools", icon: Wrench },
    { to: "/usage/patterns", label: "Patterns", icon: Clock },
    ...(project_path
      ? [{ to: "/usage/files", label: "Files", icon: FolderOpen }]
      : []),
  ];

  return (
    <nav className="inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground h-8 bg-muted">
      {tabs.map((tab) => {
        const is_active = pathname === tab.to || pathname.startsWith(tab.to + "/");
        const Icon = tab.icon;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "relative inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap transition-all",
              "[&_svg]:pointer-events-none [&_svg]:shrink-0",
              is_active
                ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function UsageLayout() {
  const { scope } = use_project_scope();
  const { range_days } = use_analytics_time_range();
  const project_path = scope?.project_path;

  const [overview, set_overview] = useState<AnalyticsOverview | null>(null);
  const [time_data, set_time_data] = useState<TimeBreakdown | null>(null);
  const [file_stats, set_file_stats] = useState<ProjectFileStats | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  // Show the loading skeleton on the first load, then silently refresh in the
  // background when only range_days or project_path changes.
  const has_loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const fetch_data = async () => {
      try {
        if (!has_loaded.current) set_loading(true);
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
        has_loaded.current = true;
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

  return (
    <UsageProvider value={{ overview, time_data, file_stats, range_days, loading, error }}>
      <div className="min-w-0 w-full">
        <div className="flex items-center gap-4 mb-4">
          <UsageNav project_path={project_path} />
        </div>
        <Outlet />
      </div>
    </UsageProvider>
  );
}
