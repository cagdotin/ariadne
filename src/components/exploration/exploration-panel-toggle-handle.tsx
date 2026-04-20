import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExplorationPanelToggleHandleProps {
	collapsed: boolean;
	collapsed_icon: LucideIcon;
	expanded_icon: LucideIcon;
	on_toggle: () => void;
}

export function ExplorationPanelToggleHandle({
	collapsed,
	collapsed_icon: CollapsedIcon,
	expanded_icon: ExpandedIcon,
	on_toggle,
}: ExplorationPanelToggleHandleProps) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className="absolute top-1/2 left-1/2 z-20 size-5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-background opacity-0 shadow-sm transition-opacity group-hover/handle:opacity-100 hover:bg-accent"
			onClick={on_toggle}
		>
			{collapsed ? (
				<CollapsedIcon className="size-3" />
			) : (
				<ExpandedIcon className="size-3" />
			)}
		</Button>
	);
}
