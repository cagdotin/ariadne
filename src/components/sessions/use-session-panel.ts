import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

export type SessionPanel = "tree" | "details" | "analytics";

const valid_panels: SessionPanel[] = ["tree", "details", "analytics"];

export function use_session_panel() {
  const search = useSearch({ strict: false }) as { panel?: string };
  const navigate = useNavigate();

  const panel = (
    valid_panels.includes(search.panel as SessionPanel)
      ? search.panel
      : null
  ) as SessionPanel | null;

  const set_panel = useCallback(
    (value: SessionPanel | null) => {
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) =>
          value ? { ...prev, panel: value } : { ...prev, panel: undefined },
        replace: true,
      });
    },
    [navigate],
  );

  const toggle_panel = useCallback(
    (value: SessionPanel) => {
      set_panel(panel === value ? null : value);
    },
    [panel, set_panel],
  );

  return { panel, set_panel, toggle_panel };
}
