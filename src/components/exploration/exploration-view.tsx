import type { ExplorationPayload } from "@contracts/exploration";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ExplorationGraph } from "./exploration-graph";
import { ExplorationInspector } from "./exploration-inspector";
import {
	compute_highlight_ids,
	compute_related_relations,
	type SelectionTarget,
} from "./exploration-selection";
import { ExplorationTimeline } from "./exploration-timeline";

interface ExplorationViewProps {
	payload: ExplorationPayload;
}


export function ExplorationView({ payload }: ExplorationViewProps) {
	const [selection, set_selection] = useState<SelectionTarget | null>(null);

	const stats = useMemo(() => {
		const explored_artifacts = payload.artifacts.filter((a) => a.explored);
		const unexplored_artifacts = payload.artifacts.filter((a) => !a.explored);
		return {
			turns: payload.turns.length,
			events: payload.events.length,
			explored: explored_artifacts.length,
			unexplored: unexplored_artifacts.length,
		};
	}, [payload]);

	const highlight_ids = useMemo(
		() => compute_highlight_ids(selection, payload),
		[selection, payload],
	);

	const related_relations = useMemo(
		() => compute_related_relations(highlight_ids, payload.relations),
		[highlight_ids, payload.relations],
	);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			{/* Stats bar */}
			<div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/30 flex-none">
				<Badge variant="outline" className="text-[10px]">
					{stats.turns} turns
				</Badge>
				<Badge variant="outline" className="text-[10px]">
					{stats.events} events
				</Badge>
				<Badge variant="outline" className="text-[10px]">
					{stats.explored} explored
				</Badge>
				{stats.unexplored > 0 && (
					<Badge variant="secondary" className="text-[10px]">
						{stats.unexplored} neighbors
					</Badge>
				)}
				{!payload.has_repo_context && (
					<span className="text-[10px] text-muted-foreground italic">
						repo context unavailable
					</span>
				)}
			</div>

			{/* Main split view */}
			<ResizablePanelGroup
				orientation="horizontal"
				className="flex-1 min-h-0 min-w-0"
			>
				{/* Left: Timeline */}
				<ResizablePanel defaultSize="35%" minSize="25%" className="min-w-0">
					<ExplorationTimeline
						turns={payload.turns}
						events={payload.events}
						selection={selection}
						highlight_ids={highlight_ids}
						on_select={set_selection}
					/>
				</ResizablePanel>

				<ResizableHandle />

				{/* Right: List + Inspector */}
				<ResizablePanel defaultSize="65%" minSize="35%" className="min-w-0">
					<ResizablePanelGroup orientation="horizontal" className="min-h-0">
						<ResizablePanel
							defaultSize={selection ? "60%" : "100%"}
							minSize="40%"
							className="min-w-0"
						>
							<ExplorationGraph
								artifacts={payload.artifacts}
								relations={payload.relations}
								events={payload.events}
								selection={selection}
								highlight_ids={highlight_ids}
								on_select={set_selection}
							/>
						</ResizablePanel>

						{selection && (
							<>
								<ResizableHandle />
								<ResizablePanel
									defaultSize="40%"
									minSize="25%"
									maxSize="50%"
									className="min-w-0"
								>
									<ExplorationInspector
										selection={selection}
										payload={payload}
										related_relations={related_relations}
										on_select={set_selection}
										on_close={() => set_selection(null)}
									/>
								</ResizablePanel>
							</>
						)}
					</ResizablePanelGroup>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
