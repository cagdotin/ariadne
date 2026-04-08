import { Minus, Plus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ZoomControlsProps {
  on_zoom_in: () => void;
  on_zoom_out: () => void;
  on_fit: () => void;
  zoom_percentage: number;
}

export function ZoomControls({
  on_zoom_in,
  on_zoom_out,
  on_fit,
  zoom_percentage,
}: ZoomControlsProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border bg-card shrink-0">
      <Button variant="ghost" size="icon" className="size-6" onClick={on_zoom_out} aria-label="Zoom out">
        <Minus className="size-3" />
      </Button>

      <span className="text-[10px] text-muted-foreground font-mono w-10 text-center tabular-nums select-none">
        {zoom_percentage}%
      </span>

      <Button variant="ghost" size="icon" className="size-6" onClick={on_zoom_in} aria-label="Zoom in">
        <Plus className="size-3" />
      </Button>

      <Separator orientation="vertical" className="h-4 mx-1" />

      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={on_fit} aria-label="Fit to view">
        <Maximize2 className="size-2.5" />
        fit
      </Button>
    </div>
  );
}
