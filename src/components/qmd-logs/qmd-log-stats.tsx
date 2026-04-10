import type { QmdLogStats } from "@contracts/qmd-logs";
import { StatCard } from "@/components/stat-card";
import { format_number } from "@/lib/format";

interface QmdLogStatsDisplayProps {
	stats: QmdLogStats;
}

export function QmdLogStatsDisplay({ stats }: QmdLogStatsDisplayProps) {
	const error_rate =
		stats.total_calls > 0
			? ((stats.error_calls / stats.total_calls) * 100).toFixed(1)
			: "0";

	return (
		<div className="flex flex-wrap gap-3">
			<StatCard
				label="Total QMD Calls"
				value={format_number(stats.total_calls)}
			/>
			<StatCard
				label="Errors"
				value={format_number(stats.error_calls)}
				sub_label={`${error_rate}% error rate`}
			/>
			<StatCard label="Projects" value={format_number(stats.unique_projects)} />
			<StatCard label="Sessions" value={format_number(stats.unique_sessions)} />
		</div>
	);
}
