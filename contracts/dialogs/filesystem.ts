import { z } from "zod";

// ─── Folder picker ──────────────────────────────────────────────────────────
// Contract for the directory selection dialog.
// Backed by Electron's dialog.showOpenDialog through the preload bridge.

export const pick_directory_request_schema = z.object({
  title: z.string(),
});
export type PickDirectoryRequest = z.infer<typeof pick_directory_request_schema>;

// Result is a single directory path string, or null if the user cancelled.
export const pick_directory_result_schema = z.string().nullable();
export type PickDirectoryResult = z.infer<typeof pick_directory_result_schema>;
