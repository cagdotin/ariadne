import { Input } from "@/components/ui/input";
import { Search, AlertTriangle } from "lucide-react";

interface QmdLogsToolbarProps {
  search: string;
  on_search_change: (value: string) => void;
  subcommand_filter: string | null;
  on_subcommand_filter_change: (value: string | null) => void;
  error_only: boolean;
  on_error_only_change: (value: boolean) => void;
  available_subcommands: string[];
}

export function QmdLogsToolbar({
  search,
  on_search_change,
  subcommand_filter,
  on_subcommand_filter_change,
  error_only,
  on_error_only_change,
  available_subcommands,
}: QmdLogsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search commands, arguments, output..."
          value={search}
          onChange={(e) => on_search_change(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => on_subcommand_filter_change(null)}
          className={`rounded-md border px-2 py-0.5 text-xs transition-colors cursor-pointer ${
            subcommand_filter === null
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
          }`}
        >
          All
        </button>
        {available_subcommands.map((cmd) => (
          <button
            key={cmd}
            onClick={() =>
              on_subcommand_filter_change(subcommand_filter === cmd ? null : cmd)
            }
            className={`rounded-md border px-2 py-0.5 text-xs font-mono transition-colors cursor-pointer ${
              subcommand_filter === cmd
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
            }`}
          >
            {cmd}
          </button>
        ))}
      </div>

      <button
        onClick={() => on_error_only_change(!error_only)}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors cursor-pointer ${
          error_only
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
        }`}
      >
        <AlertTriangle className="h-3 w-3" />
        Errors only
      </button>

      {(search || subcommand_filter || error_only) && (
        <button
          onClick={() => {
            on_search_change("");
            on_subcommand_filter_change(null);
            on_error_only_change(false);
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
