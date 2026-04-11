import type {
	ExplorationArtifact,
	ExplorationEvent,
	ExplorationRelation,
} from "@contracts/exploration";
import {
	BookOpen,
	Eye,
	File,
	FileCode,
	FileText,
	Hash,
	Search,
} from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { SelectionTarget } from "./exploration-selection";

interface ExplorationGraphProps {
	artifacts: ExplorationArtifact[];
	relations: ExplorationRelation[];
	events: ExplorationEvent[];
	selection: SelectionTarget | null;
	highlight_ids: Set<string>;
	on_select: (target: SelectionTarget | null) => void;
}

const kind_icons: Record<string, typeof File> = {
	source_file: FileCode,
	doc_file: FileText,
	doc_section: Hash,
	discovery_query: Search,
};

const kind_colors: Record<string, string> = {
	source_file: "border-green-500/40 bg-green-500/5",
	doc_file: "border-cyan-500/40 bg-cyan-500/5",
	doc_section: "border-cyan-400/30 bg-cyan-400/5",
	discovery_query: "border-amber-500/40 bg-amber-500/5",
};

const kind_icon_colors: Record<string, string> = {
	source_file: "text-green-500",
	doc_file: "text-cyan-500",
	doc_section: "text-cyan-400",
	discovery_query: "text-amber-500",
};

export function ExplorationGraph({
	artifacts,
	relations,
	selection,
	highlight_ids,
	on_select,
}: ExplorationGraphProps) {
	// Group artifacts by kind and explored status
	const groups = useMemo(() => {
		const explored_source: ExplorationArtifact[] = [];
		const explored_docs: ExplorationArtifact[] = [];
		const explored_sections: ExplorationArtifact[] = [];
		const explored_queries: ExplorationArtifact[] = [];
		const unexplored: ExplorationArtifact[] = [];

		for (const art of artifacts) {
			if (!art.explored) {
				unexplored.push(art);
			} else if (art.kind === "source_file") {
				explored_source.push(art);
			} else if (art.kind === "doc_file") {
				explored_docs.push(art);
			} else if (art.kind === "doc_section") {
				explored_sections.push(art);
			} else if (art.kind === "discovery_query") {
				explored_queries.push(art);
			}
		}

		return {
			explored_source,
			explored_docs,
			explored_sections,
			explored_queries,
			unexplored,
		};
	}, [artifacts]);

	// Count relations per artifact for sizing
	const relation_counts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const rel of relations) {
			counts.set(rel.source_id, (counts.get(rel.source_id) ?? 0) + 1);
			counts.set(rel.target_id, (counts.get(rel.target_id) ?? 0) + 1);
		}
		return counts;
	}, [relations]);

	const is_selected = (art: ExplorationArtifact) =>
		selection?.type === "artifact" && selection.artifact.id === art.id;

	const render_artifact_node = (art: ExplorationArtifact) => {
		const Icon = kind_icons[art.kind] ?? File;
		const color = kind_colors[art.kind] ?? "border-border bg-background";
		const icon_color = kind_icon_colors[art.kind] ?? "text-muted-foreground";
		const count = relation_counts.get(art.id) ?? 0;
		const selected = is_selected(art);
		const highlighted = highlight_ids.has(art.id) && !selected;

		return (
			<button
				key={art.id}
				type="button"
				className={cn(
					"flex items-center gap-1.5 px-2 py-1 rounded-md border text-left transition-all",
					"hover:ring-1 hover:ring-primary/30",
					color,
					!art.explored && "opacity-40 border-dashed",
					selected && "ring-2 ring-primary bg-primary/10",
					highlighted && selection && "ring-1 ring-primary/50 opacity-100",
				)}
				onClick={() => on_select({ type: "artifact", artifact: art })}
				title={art.path}
			>
				<Icon className={cn("size-3 shrink-0", icon_color)} />
				<span
					className={cn(
						"text-[11px] truncate max-w-[160px]",
						!art.explored && "italic text-muted-foreground",
					)}
				>
					{art.label}
				</span>
				{count > 1 && (
					<span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
						{count}
					</span>
				)}
			</button>
		);
	};

	const render_group = (
		title: string,
		items: ExplorationArtifact[],
		icon: typeof File,
	) => {
		if (items.length === 0) return null;
		const GroupIcon = icon;
		return (
			<div className="space-y-1.5">
				<div className="flex items-center gap-1.5 px-1">
					<GroupIcon className="size-3 text-muted-foreground" />
					<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
						{title}
					</span>
					<span className="text-[9px] text-muted-foreground tabular-nums">
						({items.length})
					</span>
				</div>
				<div className="flex flex-wrap gap-1">
					{items.map(render_artifact_node)}
				</div>
			</div>
		);
	};

	if (artifacts.length === 0) {
		return (
			<div className="flex items-center justify-center h-full p-8">
				<p className="text-muted-foreground text-sm">No artifacts to display</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0 overflow-hidden">
			<div className="px-3 py-1.5 border-b border-border flex-none">
				<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
					Exploration Graph
				</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
				{render_group("Source Files", groups.explored_source, FileCode)}
				{render_group("Documents", groups.explored_docs, FileText)}
				{render_group("Doc Sections", groups.explored_sections, BookOpen)}
				{render_group("Discovery Queries", groups.explored_queries, Search)}
				{groups.unexplored.length > 0 && (
					<div className="space-y-1.5 pt-2 border-t border-border/50">
						{render_group("Unexplored Neighbors", groups.unexplored, Eye)}
					</div>
				)}
			</div>
		</div>
	);
}
