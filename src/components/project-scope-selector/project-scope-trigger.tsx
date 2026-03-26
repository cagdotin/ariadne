import { ChevronsUpDown, FolderGit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PopoverTrigger } from "@/components/ui/popover";

interface ProjectScopeTriggerProps {
  loading: boolean;
  label: string;
  description: string;
  full_path: string | null;
}

export function ProjectScopeTrigger({
  loading,
  label,
  description,
  full_path,
}: ProjectScopeTriggerProps) {
  return (
    <PopoverTrigger
      disabled={loading}
      title={full_path ?? "All projects"}
    >
      <Button
        variant="outline"
        size="sm"
        className={cn("gap-6 justify-between")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {loading ? "Loading…" : label}
          </span>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="hidden truncate text-xs text-muted-foreground lg:block leading-3">
            {loading ? "" : description}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
      </Button>
    </PopoverTrigger>
  );
}
