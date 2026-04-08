import { z } from "zod";

// ─── Folder picker ──────────────────────────────────────────────────────────
// Contract for the directory selection dialog.
// Currently backed by @tauri-apps/plugin-dialog, will be backed by Electron
// dialog.showOpenDialog via preload after migration.

export const pick_directory_request_schema = z.object({
  title: z.string(),
});
export type PickDirectoryRequest = z.infer<typeof pick_directory_request_schema>;

// Result is a single directory path string, or null if the user cancelled.
export const pick_directory_result_schema = z.string().nullable();
export type PickDirectoryResult = z.infer<typeof pick_directory_result_schema>;
