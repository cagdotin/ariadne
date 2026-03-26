import { cn } from "@/lib/utils";

export interface RangeOption {
  label: string;
  value: number;
}

interface RangePickerProps {
  options: RangeOption[];
  value: number;
  on_change: (value: number) => void;
  className?: string;
}

export function RangePicker({
  options,
  value,
  on_change,
  className,
}: RangePickerProps) {
  return (
    <div className={cn("flex items-center gap-1 shrink-0", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => on_change(option.value)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
