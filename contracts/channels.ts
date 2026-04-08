// ─── Stable IPC channel / event names ───────────────────────────────────────
// All event channel names used between backend and renderer.
// Import these constants instead of using string literals.

export const QMD_UPDATE_PROGRESS = "qmd:update-progress" as const;
export const QMD_EMBED_PROGRESS = "qmd:embed-progress" as const;
export const QMD_SEARCH_PROGRESS = "qmd:search-progress" as const;
