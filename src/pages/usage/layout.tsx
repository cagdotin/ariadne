import type { ProjectFileStats } from "@contracts/analytics/files";
import type { AnalyticsOverview } from "@contracts/analytics/overview";
import type { TimeBreakdown } from "@contracts/analytics/time";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Clock, DollarSign, FolderOpen, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	get_analytics_overview,
	get_project_file_stats,
	get_time_breakdown,
} from "@/api/analytics";
import { use_analytics_time_range } from "@/components/analytics-time-range-provider";
import { use_project_scope } from "@/components/project-scope-provider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { error_message } from "@/lib/utils";
import { UsageProvider } from "./usage-context";

interface NavTab {
	to: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}

function UsageNav({ project_path }: { project_path: string | undefined }) {
	const location = useLocation();
	const navigate = useNavigate();
	const pathname = location.pathname;

	const tabs: NavTab[] = [
		{ to: "/usage/cost", label: "Cost", icon: DollarSign },
		{ to: "/usage/tools", label: "Tools", icon: Wrench },
		{ to: "/usage/patterns", label: "Patterns", icon: Clock },
		...(project_path
			? [{ to: "/usage/files", label: "Files", icon: FolderOpen }]
			: []),
	];

	const active_tab =
		tabs.find((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`))
			?.to ?? tabs[0].to;

	return (
		<Tabs value={active_tab} onValueChange={(value) => navigate({ to: value })}>
			<TabsList>
				{tabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<TabsTrigger key={tab.to} value={tab.to}>
							<Icon className="size-3.5" />
							{tab.label}
						</TabsTrigger>
					);
				})}
			</TabsList>
		</Tabs>
	);
}

export function UsageLayout() {
	const { scope } = use_project_scope();
	const { range_days } = use_analytics_time_range();
	const project_path = scope?.project_path;

	const [overview, set_overview] = useState<AnalyticsOverview | null>(null);
	const [time_data, set_time_data] = useState<TimeBreakdown | null>(null);
	const [file_stats, set_file_stats] = useState<ProjectFileStats | null>(null);
	const [loading, set_loading] = useState(true);
	const [error, set_error] = useState<string | null>(null);

	// Show the loading skeleton on the first load, then silently refresh in the
	// background when only range_days or project_path changes.
	const has_loaded = useRef(false);

	useEffect(() => {
		let cancelled = false;

		const fetch_data = async () => {
			try {
				if (!has_loaded.current) set_loading(true);
				set_error(null);

				const requests: [
					Promise<AnalyticsOverview>,
					Promise<TimeBreakdown>,
					Promise<ProjectFileStats | null>,
				] = [
					get_analytics_overview(project_path, range_days),
					get_time_breakdown(range_days, project_path),
					project_path
						? get_project_file_stats(project_path, range_days)
						: Promise.resolve(null),
				];

				const [next_overview, next_time, next_files] =
					await Promise.all(requests);
				if (cancelled) return;

				set_overview(next_overview);
				set_time_data(next_time);
				set_file_stats(next_files);
				has_loaded.current = true;
			} catch (err) {
				if (cancelled) return;
				set_error(error_message(err, "Failed to load usage data"));
			} finally {
				if (!cancelled) set_loading(false);
			}
		};

		fetch_data();
		return () => {
			cancelled = true;
		};
	}, [project_path, range_days]);

	return (
		<UsageProvider
			value={{ overview, time_data, file_stats, range_days, loading, error }}
		>
			<div className="min-w-0 w-full">
				<div className="flex items-center gap-4 mb-4">
					<UsageNav project_path={project_path} />
				</div>
				<Outlet />
			</div>
		</UsageProvider>
	);
}
