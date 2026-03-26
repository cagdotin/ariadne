import { DirectoryHotspots } from "@/components/directory-hotspots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileActivityTabs } from "./file-activity-tabs";
import { ToolDistributionCard } from "./tool-distribution-card";
import { use_scoped_file_analytics } from "./use-scoped-file-analytics";

interface ScopedFileAnalyticsProps {
  project_path: string;
}

export function ScopedFileAnalytics({ project_path }: ScopedFileAnalyticsProps) {
  const {
    file_stats,
    loading,
    error,
    exclude_paths,
    active_tab,
    filtered_read,
    filtered_edit,
    filtered_write,
    filtered_dirs,
    hidden_count,
    active_file_list,
    set_exclude_paths,
    set_active_tab,
  } = use_scoped_file_analytics(project_path);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!file_stats) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Project File Analytics</h2>

      <div className="flex min-w-0 items-center gap-3">
        <label className="shrink-0 text-sm text-muted-foreground">Exclude paths:</label>
        <Input
          value={exclude_paths}
          onChange={(event) => set_exclude_paths(event.target.value)}
          placeholder="node_modules, .git, dist (comma-separated)"
          className="min-w-0 flex-1"
        />
        {hidden_count > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            {hidden_count} hidden
          </span>
        )}
      </div>

      <ToolDistributionCard tools={file_stats.tool_distribution} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Directory Hotspots</CardTitle>
        </CardHeader>
        <CardContent>
          <DirectoryHotspots stats={filtered_dirs} />
        </CardContent>
      </Card>

      <FileActivityTabs
        active_tab={active_tab}
        filtered_read={filtered_read}
        filtered_edit={filtered_edit}
        filtered_write={filtered_write}
        active_file_list={active_file_list}
        on_tab_change={set_active_tab}
      />
    </div>
  );
}
