import { useState, useEffect } from "react";
import type { VisibilityState } from "@tanstack/react-table";

/**
 * Returns column visibility state that hides certain columns at narrow widths.
 *
 * Breakpoints (matches Tailwind defaults):
 *   < 768px (md):  hide tools, model, project_name
 *   < 1024px (lg): hide tools, model
 *   >= 1024px:     show all
 */
export function use_responsive_columns(): VisibilityState {
  const [visibility, set_visibility] = useState<VisibilityState>(() => compute(window.innerWidth));

  useEffect(() => {
    const on_resize = () => set_visibility(compute(window.innerWidth));
    window.addEventListener("resize", on_resize);
    return () => window.removeEventListener("resize", on_resize);
  }, []);

  return visibility;
}

function compute(width: number): VisibilityState {
  if (width < 768) {
    return { tools: false, model: false, project_name: false };
  }
  if (width < 1024) {
    return { tools: false, model: false };
  }
  return {};
}
