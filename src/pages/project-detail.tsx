import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { SessionSummary } from "../schemas/session";
import { get_project_sessions } from "../api/analytics";
import { format_cost, format_tokens, format_number } from "../lib/format";
import { StatCard } from "../components/stat-card";
import { SessionTable } from "../components/session-table";

export function ProjectDetail() {
  const { name } = useParams<{ name: string }>();
  const [sessions, set_sessions] = useState<SessionSummary[]>([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;

    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const project_sessions = await get_project_sessions(name);
        set_sessions(project_sessions);
      } catch (err) {
        set_error(err instanceof Error ? err.message : 'Failed to load project sessions');
      } finally {
        set_loading(false);
      }
    };

    fetch_data();
  }, [name]);

  if (!name) {
    return <div className="error">Project name not provided</div>;
  }

  if (loading) {
    return <div className="loading">Loading project data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Calculate aggregated stats from sessions
  const total_cost = sessions.reduce((sum, session) => sum + session.total_cost, 0);
  const total_tokens = sessions.reduce((sum, session) => sum + session.total_tokens, 0);
  const session_count = sessions.length;

  return (
    <div>
      <h1 className="section-title" style={{ marginBottom: '2rem' }}>
        {decodeURIComponent(name)}
      </h1>
      
      {/* Project Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard 
          label="Sessions"
          value={format_number(session_count)}
        />
        <StatCard 
          label="Total Cost"
          value={format_cost(total_cost)}
        />
        <StatCard 
          label="Total Tokens"
          value={format_tokens(total_tokens)}
        />
      </div>

      {/* Sessions Table */}
      <div style={{ marginTop: '2rem' }}>
        <h2 className="section-title">Sessions</h2>
        {sessions.length > 0 ? (
          <SessionTable 
            sessions={sessions} 
            show_project={false}
          />
        ) : (
          <p style={{ color: 'var(--subtext1)' }}>No sessions found for this project.</p>
        )}
      </div>
    </div>
  );
}