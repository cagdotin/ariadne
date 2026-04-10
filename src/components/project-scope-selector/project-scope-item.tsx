import { memo } from "react";
import { ComboboxItem } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

interface ProjectScopeItemProps {
	value: unknown;
	label: string;
	subtitle?: string;
	meta: string;
	title?: string;
}

// Memoized to limit row re-renders while query/filter state changes.
export const ProjectScopeItem = memo(function ProjectScopeItem({
	value,
	label,
	subtitle,
	meta,
	title,
}: ProjectScopeItemProps) {
	return (
		<ComboboxItem
			value={value}
			title={title}
			className={cn(
				"flex h-auto w-full items-center gap-2 whitespace-normal rounded-none p-2 text-left [&[data-highlighted]_.project-scope-item-label]:text-accent-foreground [&[data-highlighted]_.project-scope-item-meta]:text-accent-foreground/80 [&[data-highlighted]_.project-scope-item-subtitle]:text-accent-foreground/70 [&[data-selected]_.project-scope-item-label]:text-foreground",
			)}
		>
			<div className="min-w-0 flex-1 pr-6 text-xs">
				<div className="flex items-baseline justify-between gap-2">
					<p className="project-scope-item-label truncate font-semibold text-muted-foreground">
						{label}
					</p>
					<span className="project-scope-item-meta shrink-0 text-muted-foreground">
						{meta}
					</span>
				</div>
				{subtitle ? (
					<p className="project-scope-item-subtitle truncate text-muted-foreground">
						{subtitle}
					</p>
				) : null}
			</div>
		</ComboboxItem>
	);
});
