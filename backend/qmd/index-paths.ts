// ---- QMD index path resolution (ported from the legacy QMD command layer) --

import path from "node:path";
import os from "node:os";

const INDEX_NAME_RE = /^[a-z][a-z0-9-]*$/;
const MAX_INDEX_NAME_LENGTH = 32;
const RESERVED_NAMES = new Set(["index", "models"]);

export function resolve_cache_root(): string {
  const override_root = process.env["ARIADNE_QMD_CACHE_ROOT"];
  if (override_root) {
    return override_root;
  }
  const xdg = process.env["XDG_CACHE_HOME"];
  const base = xdg ?? path.join(os.homedir(), ".cache");
  return path.join(base, "qmd");
}

export function resolve_index_db_path(index_name: string): string {
  const file_stem = index_name === "default" ? "index" : index_name;
  return path.join(resolve_cache_root(), `${file_stem}.sqlite`);
}

export function validate_index_name(name: string): { valid: boolean; error?: string } {
  if (!INDEX_NAME_RE.test(name)) {
    return {
      valid: false,
      error:
        "Index name must start with a letter and contain only lowercase letters, digits, and hyphens",
    };
  }
  if (name.length > MAX_INDEX_NAME_LENGTH) {
    return {
      valid: false,
      error: "Index name must be 32 characters or less",
    };
  }
  if (RESERVED_NAMES.has(name)) {
    return {
      valid: false,
      error: `'${name}' is a reserved name`,
    };
  }
  return { valid: true };
}
