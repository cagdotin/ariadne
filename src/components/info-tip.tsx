import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

interface InfoTipProps {
  title: string;
  children: React.ReactNode;
  side?: Side;
  align?: Align;
  className?: string;
  icon_className?: string;
}

export function InfoTip({
  title,
  children,
  side = "bottom",
  align = "start",
  className,
  icon_className,
}: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          "size-4 text-muted-foreground/50 transition-colors",
          "hover:text-muted-foreground focus-visible:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
          "cursor-help",
          icon_className
        )}
      >
        <HelpCircle className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className={cn("w-72", className)}
      >
        <div className="space-y-1.5">
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription render={<div />}>
            {children}
          </PopoverDescription>
        </div>
      </PopoverContent>
    </Popover>
  );
}
