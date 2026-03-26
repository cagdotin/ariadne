import { memo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ProjectScopeItemProps {
  label: string;
  subtitle?: string;
  meta: string;
  selected: boolean;
  on_select: () => void;
  title?: string;
}

// Memoized to prevent re-render of every row when parent state changes (5.6)
export const ProjectScopeItem = memo(function ProjectScopeItem({
  label,
  subtitle,
  meta,
  selected,
  on_select,
  title,
}: ProjectScopeItemProps) {
  return (
    <Button
      variant="ghost"
      onClick={on_select}
      title={title}
      className={cn(
        "flex h-auto w-full items-center gap-2 whitespace-normal rounded-md p-2 text-left",
        selected && "bg-accent",
      )}
    >
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-muted-foreground font-semibold">
            {label}
          </p>
          <span className="shrink-0 text-muted-foreground">{meta}</span>
        </div>
        {subtitle ? (
          <p className="truncate  text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {selected ? (
        <Check className="size-3.5 shrink-0 text-foreground" />
      ) : null}
    </Button>
  );
});
