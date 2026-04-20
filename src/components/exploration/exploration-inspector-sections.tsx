import type { GraphEdge, GraphNode } from "@contracts/graph";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type {
	ArrivalPath,
	FileSummary,
	InsightSummary,
	InstructionSummary,
	TurnSummary,
} from "@/lib/exploration-inspector-summaries";
import { cn } from "@/lib/utils";
import type { FileActivityDetail } from "./exploration-inspector-replay";

const availability_badge_colors: Record<string, string> = {
	available_observed: "bg-green-500/10 text-green-600",
	available_ambient: "bg-blue-500/10 text-blue-600",
	derived_inferred: "bg-amber-500/10 text-amber-600",
	unavailable: "bg-muted text-muted-foreground",
	unknown: "bg-muted text-muted-foreground italic",
};

const availability_labels: Record<string, string> = {
	available_observed: "Observed",
	available_ambient: "Ambient",
	derived_inferred: "Inferred",
	unavailable: "Unavailable",
	unknown: "Unknown",
};

const action_labels: Record<string, string> = {
	read: "Read",
	edited: "Edited",
	wrote: "Written",
};

const action_colors: Record<string, string> = {
	read: "text-green-600 bg-green-500/10",
	edited: "text-orange-600 bg-orange-500/10",
	wrote: "text-purple-600 bg-purple-500/10",
};

export function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
			{children}
		</span>
	);
}

export function PropertyRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-[10px] text-muted-foreground">{label}:</span>
			{children}
		</div>
	);
}

export function RelationshipButton({
	direction,
	edge,
	other_node,
	on_click,
}: {
	direction: "incoming" | "outgoing";
	edge: GraphEdge;
	other_node: GraphNode;
	on_click: () => void;
}) {
	return (
		<button
			type="button"
			className="flex w-full items-center gap-1 rounded-sm px-2 py-0.5 text-left text-[10px] transition-colors hover:bg-accent/50"
			onClick={on_click}
		>
			<ArrowRight
				className={cn(
					"size-2.5 shrink-0 text-muted-foreground",
					direction === "incoming" && "rotate-180",
				)}
			/>
			<span className="flex-1 truncate">{other_node.label}</span>
			<Badge
				className={cn(
					"ml-auto shrink-0 text-[9px]",
					availability_badge_colors[edge.availability],
				)}
			>
				{edge.kind.replace(/_/g, " ")}
			</Badge>
		</button>
	);
}

export function TurnSummarySection({ summary }: { summary: TurnSummary }) {
	return (
		<div>
			<SectionLabel>Turn Summary</SectionLabel>
			<div className="mt-1 grid grid-cols-2 gap-1">
				<SummaryItem label="Searches" value={summary.searches} />
				<SummaryItem label="Files explored" value={summary.files_explored} />
				<SummaryItem label="Docs explored" value={summary.docs_explored} />
				<SummaryItem label="Edits" value={summary.edits} />
				<SummaryItem label="Writes" value={summary.writes} />
			</div>
		</div>
	);
}

export function FileSummarySection({ summary }: { summary: FileSummary }) {
	return (
		<div>
			<SectionLabel>File Summary</SectionLabel>
			<div className="mt-1 space-y-1">
				<div className="grid grid-cols-2 gap-1">
					<SummaryItem label="Reads" value={summary.reads} />
					<SummaryItem label="Edits" value={summary.edits} />
					<SummaryItem label="Writes" value={summary.writes} />
					<SummaryItem label="Upstream docs" value={summary.upstream_docs} />
					<SummaryItem
						label="Upstream instructions"
						value={summary.upstream_instructions}
					/>
					{summary.nearby_unexplored_count > 0 && (
						<SummaryItem
							label="Unexplored neighbors"
							value={summary.nearby_unexplored_count}
						/>
					)}
				</div>
				{summary.first_seen_turn !== null && (
					<div className="text-[10px] text-muted-foreground">
						First seen: Turn {summary.first_seen_turn + 1}
					</div>
				)}
				<Badge
					variant={summary.is_explored ? "default" : "secondary"}
					className="text-[10px]"
				>
					{summary.is_explored ? "Explored" : "Unexplored neighbor"}
				</Badge>
			</div>
		</div>
	);
}

export function InstructionSummarySection({
	summary,
}: {
	summary: InstructionSummary;
}) {
	return (
		<div>
			<SectionLabel>Influence Summary</SectionLabel>
			<div className="mt-1 grid grid-cols-2 gap-1">
				<SummaryItem
					label="Downstream files"
					value={summary.downstream_files}
				/>
				<SummaryItem
					label="Downstream edits"
					value={summary.downstream_edits}
				/>
			</div>
			<Badge
				className={cn(
					"mt-1 text-[10px]",
					availability_badge_colors[summary.availability],
				)}
			>
				{availability_labels[summary.availability] ?? summary.availability}
			</Badge>
		</div>
	);
}

export function SummaryTextItem({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="min-w-0 text-[10px]">
			<span className="text-muted-foreground">{label}: </span>
			<span className="break-all">{value}</span>
		</div>
	);
}

export function TextPreview({
	text,
	max_lines = 12,
}: {
	text: string;
	max_lines?: number;
}) {
	const lines = text.split("\n");
	const truncated = lines.length > max_lines;
	const display = truncated
		? `${lines.slice(0, max_lines).join("\n")}\n…`
		: text;

	return (
		<pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all rounded-sm bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
			{display}
		</pre>
	);
}

export function JsonPreview({ data }: { data: unknown }) {
	return (
		<pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all rounded-sm bg-muted/30 p-2 font-mono text-[9px] leading-relaxed">
			{JSON.stringify(data, null, 2)}
		</pre>
	);
}

export function FileActivityCard({
	activity,
	on_select_node,
}: {
	activity: FileActivityDetail;
	on_select_node: (node_id: string) => void;
}) {
	return (
		<div className="space-y-2 rounded-sm border border-border/50 p-2">
			<div className="flex items-center gap-1.5">
				<Badge
					className={cn(
						"text-[9px]",
						action_colors[activity.action] ?? "bg-muted text-muted-foreground",
					)}
				>
					{action_labels[activity.action] ?? activity.action}
				</Badge>
				{activity.turn_index !== null && (
					<span className="text-[9px] text-muted-foreground">
						Turn {activity.turn_index + 1}
					</span>
				)}
				{activity.tool_index !== null && (
					<span className="text-[9px] text-muted-foreground">
						Tool {activity.tool_index + 1}
					</span>
				)}
			</div>

			<button
				type="button"
				className="w-full rounded-sm px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-accent/50"
				onClick={() => on_select_node(activity.tool_node_id)}
			>
				{activity.tool_label}
			</button>

			{activity.tool_arguments && (
				<div>
					<div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
						Input
					</div>
					<JsonPreview data={activity.tool_arguments} />
				</div>
			)}

			{activity.result_text && (
				<div>
					<div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
						Output
					</div>
					<TextPreview text={activity.result_text} max_lines={16} />
				</div>
			)}

			{Boolean(activity.result_details) && (
				<div>
					<div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
						Parsed result
					</div>
					<JsonPreview data={activity.result_details} />
				</div>
			)}

			{activity.result_is_error && (
				<Badge className="bg-red-500/10 text-[9px] text-red-600">
					Tool result error
				</Badge>
			)}
		</div>
	);
}

export function InsightSummarySection({
	summary,
}: {
	summary: InsightSummary;
}) {
	return (
		<div className="space-y-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2">
			<SectionLabel>Graph Insight</SectionLabel>

			{summary.primary_path_label && (
				<div className="space-y-0.5">
					<span className="text-[9px] font-medium uppercase tracking-wider text-primary">
						Primary path
					</span>
					<p className="font-mono text-[10px] leading-relaxed text-foreground">
						{summary.primary_path_label}
					</p>
				</div>
			)}

			{summary.supporting_labels.length > 0 && (
				<div className="space-y-0.5">
					<span className="text-[9px] font-medium uppercase tracking-wider text-amber-500">
						Supporting
					</span>
					<p className="text-[10px] text-foreground/80">
						{summary.supporting_labels.join(", ")}
					</p>
				</div>
			)}

			{summary.structural_ref_labels.length > 0 && (
				<div className="space-y-0.5">
					<span className="text-[9px] font-medium uppercase tracking-wider text-cyan-500">
						Structural references
					</span>
					<p className="text-[10px] text-foreground/80">
						{summary.structural_ref_labels.join(", ")}
					</p>
				</div>
			)}

			{summary.downstream_labels.length > 0 && (
				<div className="space-y-0.5">
					<span className="text-[9px] font-medium uppercase tracking-wider text-orange-500">
						Downstream effects
					</span>
					<p className="text-[10px] text-foreground/80">
						{summary.downstream_labels.join(", ")}
					</p>
				</div>
			)}
		</div>
	);
}

export function ArrivalPathRow({
	path,
	on_select_node,
}: {
	path: ArrivalPath;
	on_select_node: (node_id: string) => void;
}) {
	const prompt_target_id = path.turn_node_id ?? path.user_prompt_node_id;

	return (
		<div className="space-y-1 rounded-sm border border-border/50 px-2 py-1.5">
			<div className="flex items-center gap-1.5">
				<Badge
					className={cn(
						"text-[9px]",
						action_colors[path.action] ?? "bg-muted text-muted-foreground",
					)}
				>
					{action_labels[path.action] ?? path.action}
				</Badge>
				{path.turn_index !== null && (
					<span className="tabular-nums text-[9px] text-muted-foreground">
						Turn {path.turn_index + 1}
					</span>
				)}
			</div>

			{path.user_message && prompt_target_id && (
				<button
					type="button"
					className="flex w-full items-start gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-accent/50"
					onClick={() => on_select_node(prompt_target_id)}
				>
					<ArrowRight className="mt-0.5 size-2.5 shrink-0 text-blue-500" />
					<span className="line-clamp-2 text-[10px] text-foreground">
						{path.user_message}
					</span>
				</button>
			)}

			<button
				type="button"
				className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-accent/50"
				onClick={() => on_select_node(path.tool_node_id)}
			>
				<ArrowRight className="size-2.5 shrink-0 text-muted-foreground" />
				<span className="truncate text-[10px] text-muted-foreground">
					{path.tool_label}
				</span>
			</button>
		</div>
	);
}

function SummaryItem({ label, value }: { label: string; value: number }) {
	return (
		<div className="text-[10px]">
			<span className="text-muted-foreground">{label}: </span>
			<span className="tabular-nums">{value}</span>
		</div>
	);
}
