import { useEffect, useMemo, useState } from "react";
import { get_project_file_stats } from "@/api/analytics";
import { error_message } from "@/lib/utils";
import type { UseScopedFileAnalyticsState } from "./types";
import {
  get_active_file_list,
  get_hidden_count,
  is_excluded,
  parse_excludes,
  recompute_directory_stats,
} from "./utils";

export function use_scoped_file_analytics(
  project_path: string,
): UseScopedFileAnalyticsState {
  const [file_stats, set_file_stats] = useState<UseScopedFileAnalyticsState["file_stats"]>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [exclude_paths, set_exclude_paths] = useState("");
  const [active_tab, set_active_tab] = useState<UseScopedFileAnalyticsState["active_tab"]>("read");

  useEffect(() => {
    set_exclude_paths("");
    set_active_tab("read");

    let cancelled = false;

    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const stats = await get_project_file_stats(project_path);
        if (cancelled) return;
        set_file_stats(stats);
      } catch (err) {
        if (cancelled) return;
        set_error(error_message(err, "Failed to load file analytics"));
      } finally {
        if (!cancelled) set_loading(false);
      }
    };

    fetch_data();

    return () => {
      cancelled = true;
    };
  }, [project_path]);

  const excludes = useMemo(() => parse_excludes(exclude_paths), [exclude_paths]);

  const filtered_read = useMemo(
    () => (file_stats?.read_files ?? []).filter((file) => !is_excluded(file.name, excludes)),
    [file_stats, excludes],
  );

  const filtered_edit = useMemo(
    () => (file_stats?.edit_files ?? []).filter((file) => !is_excluded(file.name, excludes)),
    [file_stats, excludes],
  );

  const filtered_write = useMemo(
    () => (file_stats?.write_files ?? []).filter((file) => !is_excluded(file.name, excludes)),
    [file_stats, excludes],
  );

  const filtered_dirs = useMemo(
    () =>
      file_stats
        ? recompute_directory_stats(
            file_stats.read_files,
            file_stats.edit_files,
            file_stats.write_files,
            excludes,
          )
        : [],
    [file_stats, excludes],
  );

  const hidden_count = useMemo(
    () => get_hidden_count(file_stats, excludes),
    [file_stats, excludes],
  );

  const active_file_list = useMemo(
    () =>
      get_active_file_list(
        active_tab,
        filtered_read,
        filtered_edit,
        filtered_write,
      ),
    [active_tab, filtered_read, filtered_edit, filtered_write],
  );

  return {
    file_stats,
    loading,
    error,
    exclude_paths,
    active_tab,
    filtered_read,
    filtered_edit,
    filtered_write,
    filtered_dirs,
    hidden_count,
    active_file_list,
    set_exclude_paths,
    set_active_tab,
  };
}
