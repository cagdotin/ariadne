import { ChevronRight } from "lucide-react";
import { AppHeaderActions } from "@/components/app-header-actions";
import { PageHeader } from "@/components/page-header";
import { ProjectScopeSelector } from "@/components/project-scope-selector";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import type { Breadcrumb } from "@/components/use-breadcrumbs";

function DragSpacer({ className }: { className?: string }) {
	return <div className={`app-drag-region ${className ?? ""}`} />;
}

function TitlebarNavigation({
	breadcrumbs,
	show_time_range_selector,
}: {
	breadcrumbs: Breadcrumb[];
	show_time_range_selector: boolean;
}) {
	return (
		<>
			<ProjectScopeSelector />
			<span>
				<ChevronRight className="size-3 text-muted-foreground" />
			</span>
			<PageHeader items={breadcrumbs} />
			<DragSpacer className="flex-1 h-full" />
			<AppHeaderActions show_time_range_selector={show_time_range_selector} />
		</>
	);
}

function ExpandedTitlebar({
	breadcrumbs,
	show_time_range_selector,
}: {
	breadcrumbs: Breadcrumb[];
	show_time_range_selector: boolean;
}) {
	return (
		<>
			{/* Left zone — matches sidebar width */}
			<div
				className="flex items-center justify-end shrink-0 h-full border-r border-border bg-sidebar"
				style={{ width: "var(--sidebar-width)" }}
			>
				<DragSpacer className="flex-1 h-full" />
				<SidebarTrigger className="size-6 [&_svg]:size-3.5 mr-2" />
			</div>
			{/* Right zone */}
			<div className="flex items-center gap-1.5 flex-1 min-w-0 px-3 h-full">
				<TitlebarNavigation
					breadcrumbs={breadcrumbs}
					show_time_range_selector={show_time_range_selector}
				/>
			</div>
		</>
	);
}

function CollapsedTitlebar({
	breadcrumbs,
	show_time_range_selector,
}: {
	breadcrumbs: Breadcrumb[];
	show_time_range_selector: boolean;
}) {
	return (
		<div className="flex items-center gap-2 flex-1 min-w-0 pr-3 h-full">
			<DragSpacer className="shrink-0 w-[78px] h-full" />
			<SidebarTrigger className="size-6 [&_svg]:size-3.5 shrink-0" />
			<TitlebarNavigation
				breadcrumbs={breadcrumbs}
				show_time_range_selector={show_time_range_selector}
			/>
		</div>
	);
}

export function AppTitlebar({
	breadcrumbs,
	show_time_range_selector,
}: {
	breadcrumbs: Breadcrumb[];
	show_time_range_selector: boolean;
}) {
	const { state, isMobile } = useSidebar();
	const show_expanded = state === "expanded" && !isMobile;

	return (
		<header className="flex items-center h-10 border-b border-border shrink-0">
			{show_expanded ? (
				<ExpandedTitlebar
					breadcrumbs={breadcrumbs}
					show_time_range_selector={show_time_range_selector}
				/>
			) : (
				<CollapsedTitlebar
					breadcrumbs={breadcrumbs}
					show_time_range_selector={show_time_range_selector}
				/>
			)}
		</header>
	);
}
