// ─── IPC command signatures ─────────────────────────────────────────────────
// Shared type definitions for the preload ↔ renderer boundary.
// These types are the single source of truth for window.ariadne.commands,
// replacing raw `Promise<unknown>` with contract-backed response types.
//
// NOTE: Renderer-side Zod validation is intentionally preserved as a runtime
// safety net — these types provide compile-time guarantees only.

import type { FileSizeResult, ProjectFileStats } from "./analytics/files";
import type { AnalyticsOverview } from "./analytics/overview";
import type { TimeBreakdown } from "./analytics/time";
import type { ToolDetailResponse } from "./analytics/tools";
import type {
	PickDirectoryRequest,
	PickDirectoryResult,
} from "./dialogs/filesystem";
import type { ProviderLimitsResponse } from "./provider-limits/snapshots";
import type { QmdAvailability } from "./qmd/availability";
import type {
	QmdCollection,
	QmdCollectionDetail,
	QmdStatus,
} from "./qmd/collections";
import type {
	QmdEmbedProgress,
	QmdSearchProgress,
	QmdUpdateProgress,
} from "./qmd/events";
import type { QmdIndex } from "./qmd/indexes";
import type { QmdCommandResult, QmdToggleFilesResult } from "./qmd/mutations";
import type { QmdSearchResult } from "./qmd/search";
import type { QmdLogEntry, QmdLogStats } from "./qmd-logs/entries";
import type { SessionEntriesResponse } from "./sessions/replay";
import type { SessionSummary } from "./sessions/summary";
import type { ProjectSummary } from "./shared/primitives";

// ─── Analytics commands ─────────────────────────────────────────────────────

export interface AnalyticsCommandSignatures {
	list_projects(): Promise<ProjectSummary[]>;
	get_analytics_overview(payload: {
		projectPath?: string | null;
		rangeDays?: number | null;
	}): Promise<AnalyticsOverview>;
	get_session_detail(payload: { sessionId: string }): Promise<SessionSummary>;
	get_all_sessions(payload: {
		projectPath?: string | null;
		rangeDays?: number | null;
	}): Promise<SessionSummary[]>;
	resync_sessions(): Promise<AnalyticsOverview>;
	get_project_file_stats(payload: {
		projectPath: string;
		rangeDays?: number | null;
	}): Promise<ProjectFileStats>;
	get_time_breakdown(payload: {
		rangeDays: number;
		projectPath?: string | null;
	}): Promise<TimeBreakdown>;
	get_session_entries(payload: {
		sessionId: string;
	}): Promise<SessionEntriesResponse>;
	get_tool_details(payload: {
		toolName: string;
		projectPath?: string | null;
		rangeDays?: number | null;
	}): Promise<ToolDetailResponse>;
	get_file_sizes(payload: { paths: string[] }): Promise<FileSizeResult[]>;
}

// ─── QMD commands ───────────────────────────────────────────────────────────

export interface QmdCommandSignatures {
	qmd_list_indexes(): Promise<QmdIndex[]>;
	qmd_create_index(payload: { name: string }): Promise<QmdCommandResult>;
	qmd_delete_index(payload: { name: string }): Promise<QmdCommandResult>;
	qmd_rename_index(payload: {
		oldName: string;
		newName: string;
	}): Promise<QmdCommandResult>;
	qmd_check_availability(): Promise<QmdAvailability>;
	qmd_get_status(payload: { index: string }): Promise<QmdStatus>;
	qmd_list_collections(payload: { index: string }): Promise<QmdCollection[]>;
	qmd_get_collection_detail(payload: {
		index: string;
		name: string;
	}): Promise<QmdCollectionDetail>;
	qmd_add_collection(payload: {
		index: string;
		name: string;
		path: string;
		pattern?: string | null;
	}): Promise<QmdCommandResult>;
	qmd_remove_collection(payload: {
		index: string;
		name: string;
	}): Promise<QmdCommandResult>;
	qmd_rename_collection(payload: {
		index: string;
		oldName: string;
		newName: string;
	}): Promise<QmdCommandResult>;
	qmd_add_context(payload: {
		index: string;
		collection: string;
		path: string;
		text: string;
	}): Promise<QmdCommandResult>;
	qmd_remove_context(payload: {
		index: string;
		collection: string;
		path: string;
	}): Promise<QmdCommandResult>;
	qmd_set_global_context(payload: {
		index: string;
		text: string;
	}): Promise<QmdCommandResult>;
	qmd_reindex(payload: { index: string }): Promise<QmdCommandResult>;
	qmd_embed(payload: { index: string }): Promise<QmdCommandResult>;
	qmd_cleanup(payload: { index: string }): Promise<QmdCommandResult>;
	qmd_scan_filesystem(payload: {
		index: string;
		collection: string;
	}): Promise<string[]>;
	qmd_get_indexed_paths(payload: {
		index: string;
		collection: string;
	}): Promise<string[]>;
	qmd_toggle_files(payload: {
		index: string;
		collection: string;
		repoRoot: string;
		adds: string[];
		removes: string[];
	}): Promise<QmdToggleFilesResult>;
	qmd_search(payload: {
		index: string;
		query: string;
		collections?: string[] | null;
		limit?: number | null;
	}): Promise<QmdSearchResult>;
}

// ─── QMD logs commands ──────────────────────────────────────────────────────

export interface QmdLogsCommandSignatures {
	get_qmd_logs(payload: {
		projectPath?: string | null;
	}): Promise<QmdLogEntry[]>;
	get_qmd_log_stats(payload: {
		projectPath?: string | null;
	}): Promise<QmdLogStats>;
}

// ─── Provider limits commands ───────────────────────────────────────────────

export interface ProviderLimitsCommandSignatures {
	get_provider_limits(): Promise<ProviderLimitsResponse>;
	refresh_provider_limits(): Promise<ProviderLimitsResponse>;
}

// ─── Dialogs ────────────────────────────────────────────────────────────────

export interface DialogSignatures {
	pick_directory(options: PickDirectoryRequest): Promise<PickDirectoryResult>;
}

// ─── Event channels ─────────────────────────────────────────────────────────
// Maps known event channel names to their payload types.

export interface EventChannelPayloads {
	"qmd:update-progress": QmdUpdateProgress;
	"qmd:embed-progress": QmdEmbedProgress;
	"qmd:search-progress": QmdSearchProgress;
}

export type EventChannel = keyof EventChannelPayloads;

// ─── Events ─────────────────────────────────────────────────────────────────

export interface EventSignatures {
	on<C extends EventChannel>(
		channel: C,
		callback: (payload: EventChannelPayloads[C]) => void,
	): string;
	on(channel: string, callback: (payload: unknown) => void): string;
	off(subscription_id: string): void;
}

// ─── Aggregated command namespaces ──────────────────────────────────────────

export interface CommandSignatures {
	analytics: AnalyticsCommandSignatures;
	qmd: QmdCommandSignatures;
	qmd_logs: QmdLogsCommandSignatures;
	provider_limits: ProviderLimitsCommandSignatures;
}

// ─── Full preload API surface ───────────────────────────────────────────────

export interface AriadnePreloadApi {
	commands: CommandSignatures;
	dialogs: DialogSignatures;
	events: EventSignatures;
}
