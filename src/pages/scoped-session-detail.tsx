import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { use_project_scope } from "@/components/project-scope-provider";
import { get_session_detail } from "@/api/analytics";
import { SessionDetail } from "./session-detail";

/**
 * Thin scope guard around SessionDetail.
 *
 * When a project scope is active, verifies the session belongs to that project.
 * If it doesn't, redirects to /sessions. SessionDetail itself stays scope-agnostic.
 */
export function ScopedSessionDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { scope } = use_project_scope();
  const navigate = useNavigate();
  const [ready, set_ready] = useState(false);

  useEffect(() => {
    set_ready(false);

    // No scope → "All Projects" — every session is valid.
    if (!scope) {
      set_ready(true);
      return;
    }

    let cancelled = false;
    get_session_detail(id)
      .then((summary) => {
        if (cancelled) return;
        if (summary.project_path !== scope.project_path) {
          navigate({ to: "/sessions" });
        } else {
          set_ready(true);
        }
      })
      .catch(() => {
        // Let SessionDetail handle fetch errors.
        if (!cancelled) set_ready(true);
      });

    return () => { cancelled = true; };
  }, [id, scope, navigate]);

  if (!ready) return null;

  return <SessionDetail />;
}
