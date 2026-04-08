import { useState, useRef, useEffect } from "react";
import type { QmdIndex } from "@contracts/qmd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/info-tip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

interface IndexSelectorProps {
  indexes: QmdIndex[];
  active_index: string;
  on_navigate: (name: string) => void;
  on_create: () => void;
  on_delete: (name: string) => void;
  on_rename: (old_name: string, new_name: string) => void;
  disabled?: boolean;
}

export function IndexSelector({
  indexes,
  active_index,
  on_navigate,
  on_create,
  on_delete,
  on_rename,
  disabled,
}: IndexSelectorProps) {
  const [renaming_index, set_renaming_index] = useState<string | null>(null);
  const [rename_value, set_rename_value] = useState("");
  const [rename_error, set_rename_error] = useState<string | null>(null);
  const rename_input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming_index && rename_input_ref.current) {
      rename_input_ref.current.focus();
      rename_input_ref.current.select();
    }
  }, [renaming_index]);

  const start_rename = (name: string) => {
    set_renaming_index(name);
    set_rename_value(name);
    set_rename_error(null);
  };

  const commit_rename = () => {
    if (!renaming_index) return;
    const trimmed = rename_value.trim();
    if (!trimmed || trimmed === renaming_index) {
      set_renaming_index(null);
      return;
    }
    const valid = /^[a-z][a-z0-9-]*$/.test(trimmed);
    if (!valid) {
      set_rename_error("Lowercase letters, numbers, and hyphens only");
      return;
    }
    if (trimmed.length > 32) {
      set_rename_error("Max 32 characters");
      return;
    }
    if (trimmed === "index" || trimmed === "models") {
      set_rename_error("Reserved name");
      return;
    }
    if (indexes.some((idx) => idx.name === trimmed && idx.name !== renaming_index)) {
      set_rename_error("Name already exists");
      return;
    }
    on_rename(renaming_index, trimmed);
    set_renaming_index(null);
  };

  const cancel_rename = () => {
    set_renaming_index(null);
    set_rename_error(null);
  };

  const format_subtitle = (idx: QmdIndex): string => {
    if (idx.collection_count === 0) return "empty";
    return `${idx.collection_count} collection${idx.collection_count !== 1 ? "s" : ""}`;
  };

  return (
    <div className="flex items-stretch gap-1 rounded-lg border border-border bg-card p-1.5 overflow-x-auto">
      {indexes.map((idx) => {
        const is_active = idx.name === active_index;
        const is_empty = idx.collection_count === 0;
        const is_renaming = renaming_index === idx.name;

        return (
          <div
            key={idx.name}
            className="group/index relative flex items-center"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!is_renaming && !disabled) on_navigate(idx.name);
              }}
              disabled={disabled}
              className={cn(
                "relative flex flex-col items-start min-w-[120px] px-3 py-1.5 h-auto text-left",
                is_active
                  ? "bg-accent ring-1 ring-primary"
                  : "hover:bg-accent/50",
              )}
            >
              {is_renaming ? (
                <div className="flex flex-col gap-0.5">
                  <Input
                    ref={rename_input_ref}
                    value={rename_value}
                    onChange={(e) => {
                      set_rename_value(e.target.value);
                      set_rename_error(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit_rename();
                      if (e.key === "Escape") cancel_rename();
                    }}
                    onBlur={cancel_rename}
                    className="h-5 text-sm font-medium px-1 py-0 w-28"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {rename_error && (
                    <span className="text-[10px] text-destructive">{rename_error}</span>
                  )}
                </div>
              ) : (
                <>
                  <span
                    className={cn(
                      "text-sm leading-tight truncate max-w-[160px]",
                      is_active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {idx.name}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-tight mt-0.5",
                      is_active
                        ? is_empty
                          ? "text-muted-foreground italic"
                          : "text-muted-foreground"
                        : is_empty
                          ? "text-muted-foreground/50 italic"
                          : "text-muted-foreground/70",
                    )}
                  >
                    {format_subtitle(idx)}
                  </span>
                </>
              )}
            </Button>

            {/* Context menu trigger — visible on hover */}
            {idx.name !== "default" && !is_renaming && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover/index:opacity-100 transition-opacity",
                    "hover:bg-accent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
                  <DropdownMenuItem
                    onClick={() => start_rename(idx.name)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => on_delete(idx.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {/* New Index button + info */}
      <div className="ml-auto shrink-0 self-center flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={on_create}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Index
        </Button>
        <InfoTip title="QMD Indexes" side="bottom" align="end">
          <div className="space-y-2">
            <p>Each index is an independent knowledge base with its own collections, documents, and vector embeddings.</p>
            <p>Use separate indexes to organize different domains — personal notes, work docs, project references — without mixing them together.</p>
          </div>
        </InfoTip>
      </div>
    </div>
  );
}
