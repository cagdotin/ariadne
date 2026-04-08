// Type declarations for the window.ariadne preload API.

interface AriadneAnalyticsCommands {
  list_projects(): Promise<unknown>;
  get_analytics_overview(payload: { projectPath?: string | null; rangeDays?: number | null }): Promise<unknown>;
  get_session_detail(payload: { sessionId: string }): Promise<unknown>;
  get_all_sessions(payload: { projectPath?: string | null; rangeDays?: number | null }): Promise<unknown>;
  resync_sessions(): Promise<unknown>;
  get_project_file_stats(payload: { projectPath: string; rangeDays?: number | null }): Promise<unknown>;
  get_time_breakdown(payload: { rangeDays: number; projectPath?: string | null }): Promise<unknown>;
  get_session_entries(payload: { sessionId: string }): Promise<unknown>;
  get_tool_details(payload: { toolName: string; projectPath?: string | null; rangeDays?: number | null }): Promise<unknown>;
  get_file_sizes(payload: { paths: string[] }): Promise<unknown>;
}

interface AriadneQmdCommands {
  qmd_list_indexes(): Promise<unknown>;
  qmd_create_index(payload: { name: string }): Promise<unknown>;
  qmd_delete_index(payload: { name: string }): Promise<unknown>;
  qmd_rename_index(payload: { oldName: string; newName: string }): Promise<unknown>;
  qmd_check_availability(): Promise<unknown>;
  qmd_get_status(payload: { index: string }): Promise<unknown>;
  qmd_list_collections(payload: { index: string }): Promise<unknown>;
  qmd_get_collection_detail(payload: { index: string; name: string }): Promise<unknown>;
  qmd_add_collection(payload: { index: string; name: string; path: string; pattern?: string | null }): Promise<unknown>;
  qmd_remove_collection(payload: { index: string; name: string }): Promise<unknown>;
  qmd_rename_collection(payload: { index: string; oldName: string; newName: string }): Promise<unknown>;
  qmd_add_context(payload: { index: string; collection: string; path: string; text: string }): Promise<unknown>;
  qmd_remove_context(payload: { index: string; collection: string; path: string }): Promise<unknown>;
  qmd_set_global_context(payload: { index: string; text: string }): Promise<unknown>;
  qmd_reindex(payload: { index: string }): Promise<unknown>;
  qmd_embed(payload: { index: string }): Promise<unknown>;
  qmd_cleanup(payload: { index: string }): Promise<unknown>;
  qmd_scan_filesystem(payload: { index: string; collection: string }): Promise<unknown>;
  qmd_get_indexed_paths(payload: { index: string; collection: string }): Promise<unknown>;
  qmd_toggle_files(payload: { index: string; collection: string; repoRoot: string; adds: string[]; removes: string[] }): Promise<unknown>;
  qmd_search(payload: { index: string; query: string; collections?: string[] | null; limit?: number | null }): Promise<unknown>;
}

interface AriadneQmdLogsCommands {
  get_qmd_logs(payload: { projectPath?: string | null }): Promise<unknown>;
  get_qmd_log_stats(payload: { projectPath?: string | null }): Promise<unknown>;
}

interface AriadneProviderLimitsCommands {
  get_provider_limits(): Promise<unknown>;
  refresh_provider_limits(): Promise<unknown>;
}

interface AriadneCommands {
  analytics: AriadneAnalyticsCommands;
  qmd: AriadneQmdCommands;
  qmd_logs: AriadneQmdLogsCommands;
  provider_limits: AriadneProviderLimitsCommands;
}

interface AriadneDialogs {
  pick_directory(options: { title: string }): Promise<string | null>;
}

interface AriadneEvents {
  on(channel: string, callback: (payload: unknown) => void): string;
  off(subscription_id: string): void;
}

interface AriadneApi {
  commands: AriadneCommands;
  dialogs: AriadneDialogs;
  events: AriadneEvents;
}

declare global {
  interface Window {
    ariadne: AriadneApi;
  }
}

export {};
