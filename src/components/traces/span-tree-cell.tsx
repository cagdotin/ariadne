import { memo } from "react";
import { ChevronRight, ChevronDown, Minus } from "lucide-react";
import { format_duration } from "./trace-transform";
import type { VisibleRow } from "./types";
import { cn } from "@/lib/utils";

interface SpanTreeCellProps {
  row: VisibleRow;
  is_selected: boolean;
  on_toggle: (id: string) => void;
}

export const SpanTreeCell = memo(function SpanTreeCell({ row, is_selected, on_toggle }: SpanTreeCellProps) {
  const { node, depth, is_expanded, has_children } = row;
  const indent = depth * 14;

  const is_collapsed_parent = has_children && !is_expanded;
  const display_duration = is_collapsed_parent ? node.subtree_duration_ms : node.duration_ms;

  return (
    <div
      className={cn(
        "flex items-center h-full min-w-0 pr-2",
        is_selected && "text-foreground",
      )}
      style={{ paddingLeft: `${indent + 4}px` }}
    >
      {/* Expand/collapse toggle */}
      <button
        type="button"
        className={cn(
          "flex-none size-4 flex items-center justify-center",
          has_children ? "text-muted-foreground hover:text-foreground cursor-pointer" : "text-muted-foreground/40",
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (has_children) on_toggle(node.id);
        }}
        tabIndex={-1}
      >
        {has_children ? (
          is_expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
        ) : (
          <Minus className="size-2.5" />
        )}
      </button>

      {/* Label */}
      <span className="ml-1 truncate text-[11px]">
        {node.label}
      </span>

      {/* Duration */}
      <span className="ml-auto flex-none text-[10px] tabular-nums text-muted-foreground pl-2">
        ({format_duration(display_duration)})
      </span>
    </div>
  );
});
