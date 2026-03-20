import type { NameCount } from "../schemas/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format_number } from "../lib/format";

interface ToolDetailBreakdownProps {
  bash_commands: NameCount[];
  read_files: NameCount[];
  edit_files: NameCount[];
  write_files: NameCount[];
}

export function ToolDetailBreakdown({ 
  bash_commands, 
  read_files, 
  edit_files, 
  write_files 
}: ToolDetailBreakdownProps) {
  const max_bash_count = bash_commands[0]?.count || 1;
  const max_read_count = read_files[0]?.count || 1;
  const max_edit_count = edit_files[0]?.count || 1;
  const max_write_count = write_files[0]?.count || 1;

  const render_list = (items: NameCount[], max_count: number, title: string) => {
    if (items.length === 0) {
      return (
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No data available</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.slice(0, 10).map((item) => {
            const width = (item.count / max_count) * 100;
            return (
              <div key={item.name} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono truncate" title={item.name}>
                      {item.name}
                    </span>
                    <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                      {format_number(item.count)}
                    </Badge>
                  </div>
                  <div className="w-full bg-muted rounded-sm h-1">
                    <div 
                      className="h-full bg-blue-500 rounded-sm transition-all duration-300" 
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Tool Detail Breakdown</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Detailed breakdown of bash commands executed and files accessed across all sessions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {render_list(bash_commands, max_bash_count, "Most Used Bash Programs")}
        {render_list(read_files, max_read_count, "Most Read Files")}
        {render_list(edit_files, max_edit_count, "Most Edited Files")}
        {render_list(write_files, max_write_count, "Most Written Files")}
      </div>
    </div>
  );
}