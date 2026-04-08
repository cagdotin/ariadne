/**
 * QMD log command handlers — wire cache into the request router.
 */

import { register_handler } from "../runtime/request-router.js";
import { qmd_log_cache } from "./cache.js";

register_handler("get_qmd_logs", async (payload) => {
  const project_path =
    typeof payload.projectPath === "string" ? payload.projectPath : null;
  return qmd_log_cache.get_qmd_logs(project_path);
});

register_handler("get_qmd_log_stats", async (payload) => {
  const project_path =
    typeof payload.projectPath === "string" ? payload.projectPath : null;
  return qmd_log_cache.get_qmd_log_stats(project_path);
});
