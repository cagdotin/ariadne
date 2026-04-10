import type { ModelAggregate } from "@contracts/analytics/overview";
import { useMemo } from "react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

interface ModelDistributionProps {
	models: ModelAggregate[];
}

const colors = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
	"var(--ring)",
	"var(--primary)",
	"var(--muted-foreground)",
];

export function ModelDistribution({ models }: ModelDistributionProps) {
	const { chart_config, chart_data } = useMemo(() => {
		const sorted_models = [...models]
			.sort((a, b) => b.message_count - a.message_count)
			.slice(0, 8);

		const chart_config = sorted_models.reduce<ChartConfig>(
			(config, model, index) => {
				config[model.model_id] = {
					label: model.model_id,
					color: colors[index % colors.length],
				};
				return config;
			},
			{},
		);

		const chart_data = sorted_models.map((model, index) => ({
			name: model.model_id,
			messages: model.message_count,
			fill: colors[index % colors.length],
		}));

		return { chart_config, chart_data };
	}, [models]);

	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">Model Distribution</CardTitle>
			</CardHeader>
			<CardContent className="min-w-0">
				<ChartContainer config={chart_config} className="h-[300px] w-full">
					<BarChart
						data={chart_data}
						layout="vertical"
						margin={{ left: 8, right: 8 }}
					>
						<XAxis type="number" hide />
						<YAxis
							type="category"
							dataKey="name"
							width={130}
							interval={0}
							tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
							axisLine={false}
							tickLine={false}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
						<Bar dataKey="messages" radius={[0, 2, 2, 0]}>
							{chart_data.map((entry) => (
								<Cell key={entry.name} fill={entry.fill} />
							))}
						</Bar>
					</BarChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
