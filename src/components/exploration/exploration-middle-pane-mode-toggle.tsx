import { cn } from "@/lib/utils";
import type { MiddlePaneMode } from "./exploration-middle-pane-mode";

interface MiddlePaneModeToggleProps {
	mode: MiddlePaneMode;
	on_set_mode: (mode: MiddlePaneMode) => void;
}

export function MiddlePaneModeToggle({
	mode,
	on_set_mode,
}: MiddlePaneModeToggleProps) {
	return (
		<div
			className="flex items-center gap-0.5 overflow-hidden rounded-md border border-border"
			data-testid="middle-pane-mode-toggle"
		>
			<button
				type="button"
				className={cn(
					"px-2 py-0.5 text-[10px] font-medium transition-colors",
					mode === "map"
						? "bg-primary text-primary-foreground"
						: "text-muted-foreground hover:bg-accent",
				)}
				onClick={() => on_set_mode("map")}
			>
				Map
			</button>
			<button
				type="button"
				className={cn(
					"px-2 py-0.5 text-[10px] font-medium transition-colors",
					mode === "graph"
						? "bg-primary text-primary-foreground"
						: "text-muted-foreground hover:bg-accent",
				)}
				onClick={() => on_set_mode("graph")}
			>
				Graph
			</button>
		</div>
	);
}
