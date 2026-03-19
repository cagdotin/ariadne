import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectSummary } from "../schemas/analytics";
import { get_analytics_overview } from "../api/analytics";
import { format_cost, format_tokens, format_number, format_date_relative } from "../lib/format";

export function Projects() {
  const [projects, set_projects] = useState<ProjectSummary[]>([]);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch_data = async () => {
      try {
        set_loading(true);
        set_error(null);
        const overview = await get_analytics_overview();
        set_projects(overview.projects);
      } catch (err) {
        set_error(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        set_loading(false);
      }
    };

    fetch_data();
  }, []);

  const handle_project_click = (project: ProjectSummary) => {
    navigate(`/projects/${encodeURIComponent(project.name)}`);
  };

  if (loading) {
    return <div className="loading">Loading projects...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (projects.length === 0) {
    return (
      <div>
        <h1 className="section-title">Projects</h1>
        <p style={{ color: 'var(--subtext1)' }}>No projects found.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="section-title" style={{ marginBottom: '2rem' }}>Projects</h1>
      
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sessions</th>
            <th>Cost</th>
            <th>Tokens</th>
            <th>Last Active</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr 
              key={project.path} 
              onClick={() => handle_project_click(project)}
              className="clickable"
            >
              <td>
                <div>
                  <div style={{ color: 'var(--text)', fontWeight: '500' }}>
                    {project.name}
                  </div>
                  <div style={{ color: 'var(--comment)', fontSize: '0.75rem' }}>
                    {project.path}
                  </div>
                </div>
              </td>
              <td>{format_number(project.session_count)}</td>
              <td>{format_cost(project.total_cost)}</td>
              <td>{format_tokens(project.total_tokens)}</td>
              <td style={{ color: 'var(--subtext1)' }}>
                {format_date_relative(project.last_active)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}