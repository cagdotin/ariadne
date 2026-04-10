import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

interface CostBreakdownProps {
	input_cost: number;
	output_cost: number;
	cache_read_cost: number;
	cache_write_cost: number;
}

const chart_config = {
	input: { label: "Input", color: "var(--chart-1)" },
	output: { label: "Output", color: "var(--chart-3)" },
	cache_read: { label: "Cache Read", color: "var(--chart-5)" },
	cache_write: { label: "Cache Write", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function CostBreakdown({
	input_cost,
	output_cost,
	cache_read_cost,
	cache_write_cost,
}: CostBreakdownProps) {
	const total_cost =
		input_cost + output_cost + cache_read_cost + cache_write_cost;

	const raw_categories = [
		{ key: "input", name: "Input", cost: input_cost, color: "var(--chart-1)" },
		{
			key: "output",
			name: "Output",
			cost: output_cost,
			color: "var(--chart-3)",
		},
		{
			key: "cache_read",
			name: "Cache Read",
			cost: cache_read_cost,
			color: "var(--chart-5)",
		},
		{
			key: "cache_write",
			name: "Cache Write",
			cost: cache_write_cost,
			color: "var(--chart-4)",
		},
	].filter((c) => c.cost > 0);

	const format_cost = (cost: number) => `$${cost.toFixed(4)}`;
	const get_pct = (cost: number) =>
		total_cost === 0 ? 0 : (cost / total_cost) * 100;

	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader>
				<CardTitle className="text-base">LLM API Cost Breakdown</CardTitle>
				<p className="text-xs text-muted-foreground">
					Token costs across all sessions
				</p>
			</CardHeader>
			<CardContent className="min-w-0">
				<div className="flex flex-col sm:flex-row gap-6 items-center">
					<ChartContainer
						config={chart_config}
						className="h-[180px] w-[180px] shrink-0"
					>
						<PieChart>
							<ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
							<Pie
								data={raw_categories}
								dataKey="cost"
								nameKey="name"
								innerRadius={50}
								outerRadius={80}
								strokeWidth={2}
							>
								{raw_categories.map((cat, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: static list, index is stable
									<Cell key={i} fill={cat.color} />
								))}
							</Pie>
						</PieChart>
					</ChartContainer>

					<div className="flex flex-col gap-2 flex-1">
						{raw_categories.map((cat) => (
							<div
								key={cat.key}
								className="flex items-center justify-between text-sm"
							>
								<div className="flex items-center gap-2">
									<div
										className="w-3 h-3 rounded-sm"
										style={{ background: cat.color }}
									/>
									<span className="text-muted-foreground">{cat.name}</span>
								</div>
								<div className="text-right">
									<span className="text-foreground">
										{format_cost(cat.cost)}
									</span>
									<span className="text-muted-foreground ml-2 text-xs">
										{get_pct(cat.cost).toFixed(1)}%
									</span>
								</div>
							</div>
						))}
						<div className="flex items-center justify-between text-sm font-semibold border-t border-border pt-2 mt-1">
							<span>Total</span>
							<span>{format_cost(total_cost)}</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
