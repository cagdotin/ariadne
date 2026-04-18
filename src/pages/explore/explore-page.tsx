import type { FileSessionDetail } from "@contracts/analytics/file-sessions";
import { useNavigate } from "@tanstack/react-router";
import { Compass, FileText, MessageSquare } from "lucide-react";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OPERATION_LENS_OPTIONS, type OperationLens } from "@/lib/file-analytics";
import { ExploreTreemap } from "./explore-treemap";
import { use_explore_context } from "./explore-context";
import { explore_session_columns } from "./explore-session-columns";

function OperationLensPicker({ value, on_change }: { value: OperationLens; on_change: (v: OperationLens) => void }) {
	return (
		<Tabs value={value} onValueChange={(v) => on_change(v as OperationLens)} className="shrink-0">
			<TabsList>
				{OPERATION_LENS_OPTIONS.map((opt) => (
					<TabsTrigger key={opt.value} value={opt.value}>{opt.label}</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

function ScopeSummary() {
	const { selected_path, filtered_insights, visible_sessions, loading_sessions, selected_session_id } = use_explore_context();
	const scope_label = selected_path || "All files";
	const file_count = selected_path
		? filtered_insights.filter((i) => i.path === selected_path || i.path.startsWith(selected_path + "/")).length
		: filtered_insights.length;

	return (
		<div className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-2">
			<FileText className="size-4 text-muted-foreground shrink-0" />
			<div className="flex items-center gap-2 text-sm">
				<span className="text-muted-foreground">Scope:</span>
				<span className="font-medium">{scope_label}</span>
				<Badge variant="secondary" className="text-xs">{file_count} {file_count === 1 ? "file" : "files"}</Badge>
				{loading_sessions ? (
					<Badge variant="outline" className="text-xs animate-pulse">loading…</Badge>
				) : (
					<Badge variant="outline" className="text-xs">
						{visible_sessions.length} {visible_sessions.length === 1 ? "session" : "sessions"}
					</Badge>
				)}
			</div>
			{selected_session_id && (
				<div className="flex items-center gap-2 text-sm border-l pl-3">
					<span className="text-muted-foreground">Session:</span>
					<span className="font-mono text-xs">{selected_session_id.slice(0, 12)}…</span>
				</div>
			)}
		</div>
	);
}

function ExploreSessionsTable() {
	const nav = useNavigate();
	const { selected_session_id, select_session, visible_sessions, loading_sessions, sessions_error } = use_explore_context();

	const handle_row_click = useCallback(
		(session: FileSessionDetail) => {
			select_session(selected_session_id === session.session_id ? null : session.session_id);
		},
		[selected_session_id, select_session],
	);

	const handle_explore = useCallback(
		(id: string) => nav({ to: "/sessions/$id/exploration", params: { id } }),
		[nav],
	);
	const handle_conversation = useCallback(
		(id: string) => nav({ to: "/sessions/$id/conversation", params: { id } }),
		[nav],
	);

	const columns_with_actions = useMemo(
		() => [
			...explore_session_columns,
			{
				id: "actions",
				header: "",
				size: 80,
				cell: ({ row }: { row: { original: FileSessionDetail } }) => (
					<div className="flex items-center gap-1">
						<Button variant="ghost" size="sm" className="h-6 w-6 p-0"
							onClick={(e) => { e.stopPropagation(); handle_conversation(row.original.session_id); }}
							title="View Conversation">
							<MessageSquare className="size-3.5" />
						</Button>
						<Button variant="ghost" size="sm" className="h-6 w-6 p-0"
							onClick={(e) => { e.stopPropagation(); handle_explore(row.original.session_id); }}
							title="View Exploration">
							<Compass className="size-3.5" />
						</Button>
					</div>
				),
			},
		],
		[handle_explore, handle_conversation],
	);

	if (sessions_error) {
		return (
			<div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
				<p className="text-destructive text-sm">{sessions_error}</p>
			</div>
		);
	}

	if (loading_sessions) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 5 }).map((_, i) => (
					<Skeleton key={i} className="h-7 w-full" />
				))}
			</div>
		);
	}

	if (visible_sessions.length === 0) {
		return (
			<div className="rounded-md border border-dashed p-8 text-center">
				<p className="text-sm text-muted-foreground">No sessions found for this scope.</p>
			</div>
		);
	}

	return <DataTable columns={columns_with_actions} data={visible_sessions} on_row_click={handle_row_click} />;
}

export function ExplorePage() {
	const { project_path, file_stats, filtered_insights, all_insights, loading_file_stats, error, lens, set_lens, exclude_paths, set_exclude_paths } = use_explore_context();

	if (!project_path) {
		return (
			<div className="rounded-md border bg-card p-8 text-center">
				<p className="text-muted-foreground">Select a project to explore file ↔ session relationships.</p>
			</div>
		);
	}
	if (error) return <p className="text-destructive text-sm">{error}</p>;
	if (loading_file_stats) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-64 w-full" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}
	if (!file_stats) {
		return (
			<div className="rounded-md border bg-card p-8 text-center">
				<p className="text-muted-foreground">Select a project to explore file ↔ session relationships.</p>
			</div>
		);
	}

	const hidden_count = all_insights.length - filtered_insights.length;

	return (
		<div className="space-y-4">
			<div className="flex min-w-0 flex-wrap items-center gap-3">
				<OperationLensPicker value={lens} on_change={set_lens} />
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<label className="shrink-0 text-sm text-muted-foreground" htmlFor="explore-exclude-paths">Exclude:</label>
					<Input id="explore-exclude-paths" value={exclude_paths} onChange={(e) => set_exclude_paths(e.target.value)}
						placeholder="node_modules, .git, dist (comma-separated)" className="min-w-0 flex-1" />
					{hidden_count > 0 && <Badge variant="secondary">{hidden_count} hidden</Badge>}
				</div>
			</div>
			<ExploreTreemap />
			<ScopeSummary />
			<ExploreSessionsTable />
		</div>
	);
}
