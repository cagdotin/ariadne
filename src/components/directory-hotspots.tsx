import type { DirectoryStat } from "@contracts/analytics/files";

interface DirectoryHotspotsProps {
  stats: DirectoryStat[];
  max_rows?: number;
}

export function DirectoryHotspots({ stats, max_rows = 20 }: DirectoryHotspotsProps) {
  const visible = stats.slice(0, max_rows);
  if (visible.length === 0) {
    return <p className="text-muted-foreground text-sm">No directory data.</p>;
  }

  const max_total = Math.max(...visible.map((d) => d.total), 1);

  return (
    <div className="space-y-2">
      {visible.map((dir) => {
        const read_pct = (dir.read_count / max_total) * 100;
        const edit_pct = (dir.edit_count / max_total) * 100;
        const write_pct = (dir.write_count / max_total) * 100;
        return (
          <div key={dir.path} className="min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-muted-foreground truncate min-w-0 flex-1 pr-2" title={dir.path}>
                {dir.path}
              </span>
              <span className="text-xs text-foreground shrink-0">{dir.total}</span>
            </div>
            <div className="flex h-2 rounded overflow-hidden bg-muted w-full">
              {read_pct > 0 && (
                <div
                  className="bg-blue-500"
                  style={{ width: `${read_pct}%` }}
                  title={`Read: ${dir.read_count}`}
                />
              )}
              {edit_pct > 0 && (
                <div
                  className="bg-green-500"
                  style={{ width: `${edit_pct}%` }}
                  title={`Edit: ${dir.edit_count}`}
                />
              )}
              {write_pct > 0 && (
                <div
                  className="bg-orange-500"
                  style={{ width: `${write_pct}%` }}
                  title={`Write: ${dir.write_count}`}
                />
              )}
            </div>
          </div>
        );
      })}
      <div className="flex gap-4 text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-500" />Read</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-green-500" />Edit</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-500" />Write</span>
      </div>
    </div>
  );
}
