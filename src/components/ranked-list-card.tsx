import type { NameCount } from "@/schemas/analytics";
import { format_number } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RankedListCardProps {
  title: string;
  items: NameCount[];
  max_count: number;
  empty_label?: string;
}

export function RankedListCard({
  title,
  items,
  max_count,
  empty_label = "No data available",
}: RankedListCardProps) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty_label}</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 10).map((item) => {
              const width = (item.count / max_count) * 100;

              return (
                <div key={item.name} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate font-mono text-xs" title={item.name}>
                        {item.name}
                      </span>
                      <Badge variant="secondary" className="h-4 px-1 py-0 text-xs">
                        {format_number(item.count)}
                      </Badge>
                    </div>
                    <div className="h-1 w-full rounded-sm bg-muted">
                      <div
                        className="h-full rounded-sm bg-blue-500 transition-all duration-300"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
