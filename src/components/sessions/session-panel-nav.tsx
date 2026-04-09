import { GitBranch, Info, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { use_session_panel } from "./use-session-panel";
import type { SessionPanel } from "./use-session-panel";

interface SessionPanelNavProps {
  has_analytics?: boolean;
}

const panel_tabs: { value: SessionPanel; label: string; icon: typeof GitBranch }[] = [
  { value: "tree", label: "Tree", icon: GitBranch },
  { value: "details", label: "Details", icon: Info },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
];

export function SessionPanelNav({ has_analytics }: SessionPanelNavProps) {
  const { panel, toggle_panel } = use_session_panel();

  const visible_tabs = has_analytics
    ? panel_tabs
    : panel_tabs.filter((t) => t.value !== "analytics");

  return (
    <div className="flex items-center gap-1">
      {visible_tabs.map((tab) => {
        const Icon = tab.icon;
        const is_active = panel === tab.value;
        return (
          <Button
            key={tab.value}
            variant={is_active ? "outline" : "ghost"}
            size="xs"
            onClick={() => toggle_panel(tab.value)}
          >
            <Icon data-icon="inline-start" />
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}
