import { Search, X } from "lucide-react";
import { format_number } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ComboboxInput } from "@/components/ui/combobox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectFilterMode } from "./types";

interface ProjectScopeSearchProps {
  query: string;
  filter_mode: ProjectFilterMode;
  visible_count: number;
  is_stale: boolean;
  on_query_change: (query: string) => void;
  on_filter_change: (value: string) => void;
}

export function ProjectScopeSearch({
  query,
  filter_mode,
  visible_count,
  is_stale,
  on_query_change,
  on_filter_change,
}: ProjectScopeSearchProps) {
  return (
    <div className="space-y-2 p-3 border-b">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <ComboboxInput
          autoFocus
          aria-label="Search projects"
          placeholder="Search project name or path…"
          className="pl-8 pr-8"
        />
        {query.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => on_query_change("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            <X />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Tabs
          value={filter_mode}
          onValueChange={on_filter_change}
          className="gap-0"
        >
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {is_stale ? <span>Updating…</span> : null}
          <span>{format_number(visible_count)} visible</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-muted-foreground">
        <span className="truncate">↑↓ navigate</span>
        <span className="truncate">↵ select</span>
        <span className="truncate">esc close</span>
      </div>
    </div>
  );
}
