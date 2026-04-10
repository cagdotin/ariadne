import type { ProjectSummary } from "@contracts/shared";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { format_cost, format_date_relative, format_number } from "@/lib/format";
import { use_project_scope } from "./project-scope-provider";

interface TopProjectsProps {
	projects: ProjectSummary[];
}

export function TopProjects({ projects }: TopProjectsProps) {
	const { set_scope } = use_project_scope();

	const top = useMemo(
		() =>
			[...projects]
				.sort((a, b) => b.session_count - a.session_count)
				.slice(0, 5),
		[projects],
	);

	return (
		<div>
			<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
				Most Active Projects
			</h2>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
				{top.map((project) => (
					<Card
						key={project.path}
						className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
						onClick={() =>
							set_scope({
								project_path: project.path,
								project_name: project.name,
							})
						}
					>
						<p className="font-medium truncate">{project.name}</p>
						<p className="text-xs text-muted-foreground mt-1">
							{format_number(project.session_count)} sessions ·{" "}
							{format_cost(project.total_cost)}
						</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							{format_date_relative(project.last_active)}
						</p>
					</Card>
				))}
			</div>
		</div>
	);
}
