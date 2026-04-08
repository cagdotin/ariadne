/**
 * Normalization helpers for parity testing.
 *
 * These functions mirror the normalization rules used when the frozen golden
 * files were recorded. They must produce identical output so that golden file
 * comparisons succeed.
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Recursively sort all object keys alphabetically. Recurse into arrays. */
export function normalize(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => normalize(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const sorted_keys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const key of sorted_keys) {
      result[key] = normalize(obj[key]);
    }
    return result;
  }
  return val;
}

/** Sort an array of objects by a given string field. */
function sort_array_by_key(arr: unknown[], key: string): void {
  arr.sort((a, b) => {
    const ka =
      a !== null && typeof a === "object" ? String((a as Record<string, unknown>)[key] ?? "") : "";
    const kb =
      b !== null && typeof b === "object" ? String((b as Record<string, unknown>)[key] ?? "") : "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

// ─── Redactors ───────────────────────────────────────────────────────────────

/** Replace `fixture_root` substring in any `db_path` field with `<FIXTURE_ROOT>`. */
export function redact_db_path(val: unknown, fixture_root: string): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => redact_db_path(item, fixture_root));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "db_path" && typeof value === "string") {
        result[key] = value.replaceAll(fixture_root, "<FIXTURE_ROOT>");
      } else {
        result[key] = redact_db_path(value, fixture_root);
      }
    }
    return result;
  }
  return val;
}

/** Replace any `db_size_bytes` field value with `"__unstable__"`. */
export function redact_db_size_bytes(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => redact_db_size_bytes(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "db_size_bytes") {
        result[key] = "__unstable__";
      } else {
        result[key] = redact_db_size_bytes(value);
      }
    }
    return result;
  }
  return val;
}

/** Replace any `file_size_bytes` field value with `"__unstable__"`. */
export function redact_file_size_bytes(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => redact_file_size_bytes(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "file_size_bytes") {
        result[key] = "__unstable__";
      } else {
        result[key] = redact_file_size_bytes(value);
      }
    }
    return result;
  }
  return val;
}

/** Replace any `days_since_update` field value with `"__unstable__"`. */
export function redact_days_since_update(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => redact_days_since_update(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "days_since_update") {
        result[key] = "__unstable__";
      } else {
        result[key] = redact_days_since_update(value);
      }
    }
    return result;
  }
  return val;
}

/**
 * For arrays of objects that have both `last_modified` and `file_stem` fields,
 * replace `last_modified` with `"__unstable__"`.
 */
export function redact_last_modified_on_indexes(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (item !== null && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if ("last_modified" in obj && "file_stem" in obj) {
          return { ...obj, last_modified: "__unstable__" };
        }
      }
      return item;
    });
  }
  return val;
}

/** Replace any `fetched_at` field value with `"__unstable__"`. */
export function redact_fetched_at(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => redact_fetched_at(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "fetched_at") {
        result[key] = "__unstable__";
      } else {
        result[key] = redact_fetched_at(value);
      }
    }
    return result;
  }
  return val;
}

// ─── Sorters ─────────────────────────────────────────────────────────────────

/** Sort `models_used` and `models` arrays by `model_id`. */
export function sort_models_used(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => sort_models_used(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if ((key === "models_used" || key === "models") && Array.isArray(value)) {
        const copy = [...value];
        sort_array_by_key(copy, "model_id");
        result[key] = copy.map((item) => sort_models_used(item));
      } else {
        result[key] = sort_models_used(value);
      }
    }
    return result;
  }
  return val;
}

/** Sort `tools` and `tool_distribution` arrays by `name`. */
export function sort_tools(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => sort_tools(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if ((key === "tools" || key === "tool_distribution") && Array.isArray(value)) {
        const copy = [...value];
        sort_array_by_key(copy, "name");
        result[key] = copy.map((item) => sort_tools(item));
      } else {
        result[key] = sort_tools(value);
      }
    }
    return result;
  }
  return val;
}

/** Sort `projects` array by `path`. */
export function sort_projects(val: unknown): unknown {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "projects" && Array.isArray(value)) {
        const copy = [...value];
        sort_array_by_key(copy, "path");
        result[key] = copy;
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return val;
}

/**
 * Sort NameCount-style arrays by count descending, then name ascending.
 * Applies to: top_bash_commands, top_read_files, top_edit_files, top_write_files,
 * bash_commands, read_files, edit_files, write_files, items, directory_stats, file_insights.
 */
const NAME_COUNT_FIELDS = new Set([
  "top_bash_commands",
  "top_read_files",
  "top_edit_files",
  "top_write_files",
  "bash_commands",
  "read_files",
  "edit_files",
  "write_files",
  "items",
  "directory_stats",
  "file_insights",
]);

export function sort_name_count_arrays(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => sort_name_count_arrays(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (NAME_COUNT_FIELDS.has(key) && Array.isArray(value)) {
        const copy = [...value];
        copy.sort((a, b) => {
          const ao = a as Record<string, unknown>;
          const bo = b as Record<string, unknown>;
          const ca = Number(ao["count"] ?? ao["total_count"] ?? ao["total"] ?? 0);
          const cb = Number(bo["count"] ?? bo["total_count"] ?? bo["total"] ?? 0);
          if (cb !== ca) return cb - ca;
          const na = String(ao["name"] ?? ao["path"] ?? "");
          const nb = String(bo["name"] ?? bo["path"] ?? "");
          return na < nb ? -1 : na > nb ? 1 : 0;
        });
        result[key] = copy.map((item) => sort_name_count_arrays(item));
      } else {
        result[key] = sort_name_count_arrays(value);
      }
    }
    return result;
  }
  return val;
}

/** Sort `by_project` arrays by `project_path`. */
export function sort_by_project(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => sort_by_project(item));
  }
  if (val !== null && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "by_project" && Array.isArray(value)) {
        const copy = [...value];
        sort_array_by_key(copy, "project_path");
        result[key] = copy.map((item) => sort_by_project(item));
      } else {
        result[key] = sort_by_project(value);
      }
    }
    return result;
  }
  return val;
}

// ─── Composite normalizers ───────────────────────────────────────────────────

/** Normalize analytics data. */
export function normalize_analytics(val: unknown): unknown {
  let result = val;
  result = redact_file_size_bytes(result);
  result = sort_models_used(result);
  result = sort_tools(result);
  result = sort_projects(result);
  result = sort_name_count_arrays(result);
  result = sort_by_project(result);
  result = normalize(result);
  return result;
}

/** Normalize QMD data. */
export function normalize_qmd(val: unknown, fixture_root: string): unknown {
  let result = val;
  result = redact_db_path(result, fixture_root);
  result = redact_db_size_bytes(result);
  result = redact_days_since_update(result);
  result = normalize(result);
  return result;
}

/** Normalize QMD index listings. */
export function normalize_qmd_indexes(val: unknown, fixture_root: string): unknown {
  let result = val;
  result = redact_db_path(result, fixture_root);
  result = redact_db_size_bytes(result);
  result = redact_last_modified_on_indexes(result);
  result = normalize(result);
  return result;
}

/** Normalize provider limits data. */
export function normalize_provider_limits(val: unknown): unknown {
  let result = val;
  result = redact_fetched_at(result);
  result = normalize(result);
  return result;
}

/** Normalize QMD log data. */
export function normalize_qmd_logs(val: unknown): unknown {
  return normalize(val);
}

/** Normalize replay data (entries are ordered, don't sort them). */
export function normalize_replay(val: unknown): unknown {
  return normalize(val);
}
