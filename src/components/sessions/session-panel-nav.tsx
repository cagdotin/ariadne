import { GitBranch, Info, BarChart3, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { use_session_panel } from "./use-session-panel";
import type { SessionPanel } from "./use-session-panel";

interface SessionPanelNavProps {
  has_analytics?: boolean;
  variant?: "conversation" | "traces";
  disabled_panels?: SessionPanel[];
}

const conversation_tabs: { value: SessionPanel; label: string; icon: typeof GitBranch }[] = [
  { value: "details", label: "Details", icon: Info },
  { value: "tree", label: "Tree", icon: GitBranch },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
];

const traces_tabs: { value: SessionPanel; label: string; icon: typeof GitBranch }[] = [
  { value: "inspector", label: "Inspector", icon: PanelRight },
];

export function SessionPanelNav({ has_analytics, variant = "conversation", disabled_panels = [] }: SessionPanelNavProps) {
  const { panel, toggle_panel } = use_session_panel();

  const base_tabs = variant === "traces" ? traces_tabs : conversation_tabs;
  const visible_tabs = has_analytics
    ? base_tabs
    : base_tabs.filter((t) => t.value !== "analytics");

  return (
    <div className="flex items-center gap-1">
      {visible_tabs.map((tab) => {
        const Icon = tab.icon;
        const is_active = panel === tab.value;
        const is_disabled = disabled_panels.includes(tab.value);
        return (
          <Button
            key={tab.value}
            variant={is_active ? "outline" : "ghost"}
            size="xs"
            disabled={is_disabled}
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
