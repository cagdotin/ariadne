import { Search, X } from "lucide-react";
import { format_number } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectFilterMode } from "./types";

interface ProjectScopeSearchProps {
  query: string;
  filter_mode: ProjectFilterMode;
  visible_count: number;
  on_query_change: (query: string) => void;
  on_filter_change: (value: string) => void;
}

export function ProjectScopeSearch({
  query,
  filter_mode,
  visible_count,
  on_query_change,
  on_filter_change,
}: ProjectScopeSearchProps) {
  return (
    <div className="space-y-2 p-3 border-b">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => on_query_change(e.target.value)}
          placeholder="Search project name or path…"
          className="pl-8 pr-8"
        />
        {query.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => on_query_change("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            <X />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Tabs
          value={filter_mode}
          onValueChange={on_filter_change}
          className="gap-0"
        >
          <TabsList variant="line" className="h-7 gap-0 p-0">
            <TabsTrigger value="all" className="h-7 px-2 text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="recent" className="h-7 px-2 text-xs">
              Recent
            </TabsTrigger>
            <TabsTrigger value="active" className="h-7 px-2 text-xs">
              Active
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-muted-foreground">
          {format_number(visible_count)} visible
        </span>
      </div>
    </div>
  );
}
