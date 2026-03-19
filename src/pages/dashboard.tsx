import { useState, useEffect } from "react";
import type { AnalyticsOverview } from "../schemas/analytics";
import { get_analytics_overview } from "../api/analytics";
import { format_cost, format_tokens, format_number } from "../lib/format";
import { StatCard } from "../components/stat-card";
import { ActivityHeatmap } from "../components/activity-heatmap";
import { ToolUsageBar } from "../components/tool-usage-bar";
import { ModelDistribution } from "../components/model-distribution";
import { CostBreakdown } from "../components/cost-breakdown";
import { SessionTable } from "../components/session-table";

export function Dashboard() {
  const [data, set_data] = useState<AnalyticsOverview | null>(null);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const overview = await get_analytics_overview();
        set_data(overview);
      } catch (err) {
        set_error(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        set_loading(false);
      }
    };

    fetch_data();
  }, []);

  if (loading) {
    return <div className="loading">Loading analytics...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!data) {
    return <div className="error">No data available</div>;
  }

  // Calculate cost breakdown from recent sessions
  const total_input_cost = data.recent_sessions.reduce((sum, session) => sum + session.input_cost, 0);
  const total_output_cost = data.recent_sessions.reduce((sum, session) => sum + session.output_cost, 0);
  const total_cache_read_cost = data.recent_sessions.reduce((sum, session) => sum + session.cache_read_cost, 0);
  const total_cache_write_cost = data.recent_sessions.reduce((sum, session) => sum + session.cache_write_cost, 0);

  return (
    <div>
      <h1 className="section-title" style={{ marginBottom: '2rem' }}>Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard 
          label="Total Sessions"
          value={format_number(data.total_sessions)}
        />
        <StatCard 
          label="Total Cost"
          value={format_cost(data.total_cost)}
        />
        <StatCard 
          label="Total Tokens"
          value={format_tokens(data.total_tokens)}
        />
        <StatCard 
          label="Projects"
          value={format_number(data.total_projects)}
        />
      </div>

      {/* Activity Heatmap */}
      <ActivityHeatmap data={data.sessions_by_date} />

      {/* Two Column Layout */}
      <div className="two-column">
        <ToolUsageBar tools={data.tools} />
        <ModelDistribution models={data.models} />
      </div>

      {/* Cost Breakdown */}
      <CostBreakdown 
        input_cost={total_input_cost}
        output_cost={total_output_cost}
        cache_read_cost={total_cache_read_cost}
        cache_write_cost={total_cache_write_cost}
      />

      {/* Recent Sessions */}
      <div style={{ marginTop: '2rem' }}>
        <h2 className="section-title">Recent Sessions</h2>
        <SessionTable 
          sessions={data.recent_sessions} 
          show_project={true}
        />
      </div>
    </div>
  );
}