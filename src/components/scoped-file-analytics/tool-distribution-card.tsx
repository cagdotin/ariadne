import type { NameCount } from "@contracts/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ToolDistributionCardProps {
  tools: NameCount[];
}

export function ToolDistributionCard({ tools }: ToolDistributionCardProps) {
  const visible_tools = tools.slice(0, 12);
  const max_count = tools[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tool Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible_tools.map((tool) => {
          const width = (tool.count / max_count) * 100;

          return (
            <div key={tool.name} className="flex items-center gap-3 min-w-0">
              <span className="w-32 shrink-0 truncate text-sm text-muted-foreground">
                {tool.name}
              </span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm text-foreground">
                {tool.count}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
