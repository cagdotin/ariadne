import { Search, X, Filter, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface SessionToolbarProps {
  search: string;
  on_search_change: (value: string) => void;
  available_tools: string[];
  selected_tools: Set<string>;
  on_toggle_tool: (tool: string) => void;
  available_models: string[];
  selected_models: Set<string>;
  on_toggle_model: (model: string) => void;
  has_active_filters: boolean;
  on_clear_all: () => void;
  total_count: number;
  filtered_count: number;
}

function FilterPopover({
  label,
  items,
  selected,
  on_toggle,
}: {
  label: string;
  items: string[];
  selected: Set<string>;
  on_toggle: (item: string) => void;
}) {
  const count = selected.size;

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Filter className="size-3 text-muted-foreground" />
        {label}
        {count > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-px text-[10px] leading-tight text-primary-foreground font-semibold">
            {count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              None available
            </div>
          ) : (
            items.map((item) => {
              const is_selected = selected.has(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => on_toggle(item)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      is_selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {is_selected && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{item}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SessionToolbar({
  search,
  on_search_change,
  available_tools,
  selected_tools,
  on_toggle_tool,
  available_models,
  selected_models,
  on_toggle_model,
  has_active_filters,
  on_clear_all,
  total_count,
  filtered_count,
}: SessionToolbarProps) {
  const is_filtered = has_active_filters && filtered_count !== total_count;

  return (
    <div className="flex flex-col gap-2">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => on_search_change(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => on_search_change("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <FilterPopover
          label="Tools"
          items={available_tools}
          selected={selected_tools}
          on_toggle={on_toggle_tool}
        />

        <FilterPopover
          label="Model"
          items={available_models}
          selected={selected_models}
          on_toggle={on_toggle_model}
        />

        {has_active_filters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={on_clear_all}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3 mr-1" />
            Clear
          </Button>
        )}

        {is_filtered && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered_count} of {total_count}
          </span>
        )}
      </div>

      {/* Active filter chips */}
      {(selected_tools.size > 0 || selected_models.size > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[...selected_tools].map((tool) => (
            <Badge key={`tool-${tool}`} variant="secondary" className="gap-1 pr-1 cursor-pointer" onClick={() => on_toggle_tool(tool)}>
              {tool}
              <X className="size-3" />
            </Badge>
          ))}
          {[...selected_models].map((model) => (
            <Badge key={`model-${model}`} variant="secondary" className="gap-1 pr-1 cursor-pointer" onClick={() => on_toggle_model(model)}>
              {model}
              <X className="size-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
