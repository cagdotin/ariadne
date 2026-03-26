import type {
  DirectoryStat,
  NameCount,
  ProjectFileStats,
} from "@/schemas/analytics";

export type FileTab = "read" | "edit" | "write";

export interface UseScopedFileAnalyticsState {
  file_stats: ProjectFileStats | null;
  loading: boolean;
  error: string | null;
  exclude_paths: string;
  active_tab: FileTab;
  filtered_read: NameCount[];
  filtered_edit: NameCount[];
  filtered_write: NameCount[];
  filtered_dirs: DirectoryStat[];
  hidden_count: number;
  active_file_list: NameCount[];
  set_exclude_paths: (value: string) => void;
  set_active_tab: (tab: FileTab) => void;
}
