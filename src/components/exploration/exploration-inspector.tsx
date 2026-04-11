import type {
	ExplorationPayload,
	ExplorationRelation,
} from "@contracts/exploration";
import { ArrowRight, Info, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SelectionTarget } from "./exploration-selection";

interface ExplorationInspectorProps {
	selection: SelectionTarget;
	payload: ExplorationPayload;
	related_relations: ExplorationRelation[];
	on_select: (target: SelectionTarget | null) => void;
	on_close: () => void;
}

const evidence_labels: Record<string, string> = {
	explicit_session: "Session evidence",
	explicit_doc: "Doc evidence",
	structural_code: "Code structure",
	sequencing_inference: "Inferred from ordering",
	adjacency_only: "Adjacent (not explored)",
};

const evidence_colors: Record<string, string> = {
	explicit_session: "bg-green-500/10 text-green-600",
	explicit_doc: "bg-cyan-500/10 text-cyan-600",
	structural_code: "bg-blue-500/10 text-blue-600",
	sequencing_inference: "bg-amber-500/10 text-amber-600",
	adjacency_only: "bg-muted text-muted-foreground",
};

const relation_labels: Record<string, string> = {
	prompt_triggered: "Prompt triggered",
	command_led_to_read: "Discovery led to read",
	read_preceded_edit: "Read before edit",
	doc_influenced_read: "Doc influenced read",
	sequential_read: "Sequential read",
	user_followup_continued: "Followup continued",
	doc_links_doc: "Doc links doc",
	doc_references_file: "Doc references file",
	file_imports_file: "File imports file",
	section_belongs_to_doc: "Section of doc",
	adjacent_unexplored: "Adjacent (unexplored)",
};

export function ExplorationInspector({
	selection,
	payload,
	related_relations,
	on_select,
	on_close,
}: ExplorationInspectorProps) {
	const title = useMemo(() => {
		if (selection.type === "turn") {
			return `Turn ${selection.turn.index + 1}`;
		}
		if (selection.type === "event") {
			return selection.event.label;
		}
		return selection.artifact.label;
	}, [selection]);

	const subtitle = useMemo(() => {
		if (selection.type === "turn") {
			return selection.turn.user_message_snippet;
		}
		if (selection.type === "event") {
			return selection.event.detail ?? selection.event.kind;
		}
		return selection.artifact.path;
	}, [selection]);

	// Find related artifacts for "why was this explored" queries
	const causal_chain = useMemo(() => {
		if (selection.type !== "artifact") return [];
		const chain: Array<{
			relation: ExplorationRelation;
			label: string;
		}> = [];

		for (const rel of related_relations) {
			if (rel.target_id === selection.artifact.id) {
				chain.push({
					relation: rel,
					label: relation_labels[rel.kind] ?? rel.kind,
				});
			}
		}
		return chain;
	}, [selection, related_relations]);

	// Turn-specific: list events and artifacts
	const turn_events = useMemo(() => {
		if (selection.type !== "turn") return [];
		return selection.turn.event_ids
			.map((id) => payload.events.find((e) => e.id === id))
			.filter(Boolean);
	}, [selection, payload.events]);

	const turn_artifacts = useMemo(() => {
		if (selection.type !== "turn") return [];
		return selection.turn.artifact_ids
			.map((id) => payload.artifacts.find((a) => a.id === id))
			.filter(Boolean);
	}, [selection, payload.artifacts]);

	const label_by_id = useMemo(() => {
		const map = new Map<string, string>();
		for (const art of payload.artifacts) map.set(art.id, art.label);
		for (const evt of payload.events) map.set(evt.id, evt.label);
		return map;
	}, [payload.artifacts, payload.events]);

	const resolve_name = (id: string): string => label_by_id.get(id) ?? id;

	return (
		<aside className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
			{/* Header */}
			<div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border flex-none">
				<div className="flex items-center gap-2 min-w-0">
					<Info className="size-3.5 text-muted-foreground shrink-0" />
					<span className="text-xs font-medium truncate">{title}</span>
				</div>
				<Button variant="ghost" size="xs" onClick={on_close}>
					<X className="size-3.5" />
				</Button>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
				{/* Path / detail */}
				<div>
					<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
						Detail
					</span>
					<p className="text-xs text-foreground mt-1 break-all">{subtitle}</p>
				</div>

				{/* Artifact-specific: provenance */}
				{selection.type === "artifact" && (
					<>
						<div>
							<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
								Properties
							</span>
							<div className="mt-1 space-y-1">
								<div className="flex items-center gap-2">
									<span className="text-[10px] text-muted-foreground">
										Kind:
									</span>
									<Badge variant="outline" className="text-[10px]">
										{selection.artifact.kind.replace("_", " ")}
									</Badge>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-[10px] text-muted-foreground">
										Status:
									</span>
									<Badge
										variant={
											selection.artifact.explored ? "default" : "secondary"
										}
										className="text-[10px]"
									>
										{selection.artifact.explored
											? "Explored"
											: "Unexplored neighbor"}
									</Badge>
								</div>
								{selection.artifact.first_seen_turn !== null && (
									<div className="flex items-center gap-2">
										<span className="text-[10px] text-muted-foreground">
											First seen:
										</span>
										<span className="text-[10px]">
											Turn {selection.artifact.first_seen_turn + 1}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* Why was this explored? */}
						{causal_chain.length > 0 && (
							<div>
								<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
									How it was reached
								</span>
								<div className="mt-1 space-y-1.5">
									{causal_chain.map((item) => (
										<button
											key={`${item.relation.source_id}-${item.relation.kind}-${item.relation.target_id}`}
											type="button"
											className="w-full flex items-start gap-2 px-2 py-1 rounded-sm text-left hover:bg-accent/50 transition-colors"
											onClick={() => {
												const source_art = payload.artifacts.find(
													(a) => a.id === item.relation.source_id,
												);
												if (source_art) {
													on_select({
														type: "artifact",
														artifact: source_art,
													});
												}
											}}
										>
											<ArrowRight className="size-3 text-muted-foreground mt-0.5 shrink-0" />
											<div className="min-w-0">
												<p className="text-[11px] truncate">
													{resolve_name(item.relation.source_id)}
												</p>
												<div className="flex items-center gap-1 mt-0.5">
													<Badge
														className={cn(
															"text-[9px]",
															evidence_colors[item.relation.evidence],
														)}
													>
														{evidence_labels[item.relation.evidence] ??
															item.relation.evidence}
													</Badge>
													<span className="text-[9px] text-muted-foreground">
														{item.label}
													</span>
												</div>
											</div>
										</button>
									))}
								</div>
							</div>
						)}
					</>
				)}

				{/* Turn-specific: events and artifacts */}
				{selection.type === "turn" && (
					<>
						{turn_events.length > 0 && (
							<div>
								<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
									Events in this turn
								</span>
								<div className="mt-1 space-y-0.5">
									{turn_events.map(
										(evt) =>
											evt && (
												<button
													key={evt.id}
													type="button"
													className="w-full text-left px-2 py-1 text-[11px] truncate hover:bg-accent/50 rounded-sm transition-colors"
													onClick={() =>
														on_select({
															type: "event",
															event: evt,
														})
													}
												>
													{evt.label}
												</button>
											),
									)}
								</div>
							</div>
						)}
						{turn_artifacts.length > 0 && (
							<div>
								<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
									Artifacts explored
								</span>
								<div className="mt-1 space-y-0.5">
									{turn_artifacts.map(
										(art) =>
											art && (
												<button
													key={art.id}
													type="button"
													className="w-full text-left px-2 py-1 text-[11px] truncate hover:bg-accent/50 rounded-sm transition-colors"
													onClick={() =>
														on_select({
															type: "artifact",
															artifact: art,
														})
													}
												>
													{art.label}{" "}
													<span className="text-muted-foreground">
														({art.path})
													</span>
												</button>
											),
									)}
								</div>
							</div>
						)}
					</>
				)}

				{/* Event-specific */}
				{selection.type === "event" && (
					<>
						<div>
							<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
								Properties
							</span>
							<div className="mt-1 space-y-1">
								<div className="flex items-center gap-2">
									<span className="text-[10px] text-muted-foreground">
										Kind:
									</span>
									<Badge variant="outline" className="text-[10px]">
										{selection.event.kind.replace(/_/g, " ")}
									</Badge>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-[10px] text-muted-foreground">
										Turn:
									</span>
									<span className="text-[10px]">
										{selection.event.turn_index + 1}
									</span>
								</div>
								{selection.event.is_error && (
									<Badge variant="destructive" className="text-[10px]">
										Error
									</Badge>
								)}
							</div>
						</div>

						{/* Related relations */}
						{related_relations.length > 0 && (
							<div>
								<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
									Relationships
								</span>
								<div className="mt-1 space-y-1">
									{related_relations.map((rel) => (
										<div
											key={`${rel.source_id}-${rel.target_id}-${rel.kind}`}
											className="flex items-center gap-1 text-[10px]"
										>
											<span className="truncate max-w-[80px]">
												{resolve_name(rel.source_id)}
											</span>
											<ArrowRight className="size-2.5 text-muted-foreground shrink-0" />
											<span className="truncate max-w-[80px]">
												{resolve_name(rel.target_id)}
											</span>
											<Badge
												className={cn(
													"text-[9px] ml-auto shrink-0",
													evidence_colors[rel.evidence],
												)}
											>
												{rel.kind.replace(/_/g, " ")}
											</Badge>
										</div>
									))}
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</aside>
	);
}
