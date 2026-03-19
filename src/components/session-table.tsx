import { useState } from "react";
import type { SessionSummary } from "../schemas/session";

interface SessionTableProps {
  sessions: SessionSummary[];
  show_project?: boolean;
  on_click?: (session: SessionSummary) => void;
}

type SortKey = 'title' | 'duration_seconds' | 'total_cost' | 'total_tokens' | 'project_name';
type SortDirection = 'asc' | 'desc';

export function SessionTable({ sessions, show_project = false, on_click }: SessionTableProps) {
  const [sort_key, set_sort_key] = useState<SortKey>('duration_seconds');
  const [sort_direction, set_sort_direction] = useState<SortDirection>('desc');

  const handle_sort = (key: SortKey) => {
    if (sort_key === key) {
      set_sort_direction(sort_direction === 'asc' ? 'desc' : 'asc');
    } else {
      set_sort_key(key);
      set_sort_direction('desc');
    }
  };

  const sorted_sessions = [...sessions].sort((a, b) => {
    let a_val, b_val;
    
    switch (sort_key) {
      case 'title':
        a_val = a.title || a.id.slice(0, 50);
        b_val = b.title || b.id.slice(0, 50);
        break;
      case 'project_name':
        a_val = a.project_name;
        b_val = b.project_name;
        break;
      case 'duration_seconds':
        a_val = a.duration_seconds || 0;
        b_val = b.duration_seconds || 0;
        break;
      case 'total_cost':
        a_val = a.total_cost;
        b_val = b.total_cost;
        break;
      case 'total_tokens':
        a_val = a.total_tokens;
        b_val = b.total_tokens;
        break;
      default:
        return 0;
    }

    if (typeof a_val === 'string' && typeof b_val === 'string') {
      return sort_direction === 'asc' 
        ? a_val.localeCompare(b_val)
        : b_val.localeCompare(a_val);
    }
    
    return sort_direction === 'asc' 
      ? (a_val as number) - (b_val as number)
      : (b_val as number) - (a_val as number);
  });

  const get_sort_indicator = (key: SortKey) => {
    if (sort_key !== key) return '';
    return sort_direction === 'asc' ? ' ↑' : ' ↓';
  };

  const format_duration = (seconds: number | null) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const format_cost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const format_tokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const get_top_tools = (tool_calls: Record<string, { name: string; calls: number; errors: number }>) => {
    const tools = Object.values(tool_calls)
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 3)
      .map(tool => tool.name);
    return tools.join(', ') || '-';
  };

  const get_primary_model = (models_used: Array<{ model_id: string; provider: string; message_count: number }>) => {
    if (models_used.length === 0) return '-';
    const primary = models_used.reduce((max, model) => 
      model.message_count > max.message_count ? model : max
    );
    return primary.model_id;
  };

  return (
    <table className="data-table">
      <thead>
        <tr>
          {show_project && (
            <th onClick={() => handle_sort('project_name')}>
              Project{get_sort_indicator('project_name')}
            </th>
          )}
          <th onClick={() => handle_sort('title')}>
            Title{get_sort_indicator('title')}
          </th>
          <th onClick={() => handle_sort('duration_seconds')}>
            Duration{get_sort_indicator('duration_seconds')}
          </th>
          <th onClick={() => handle_sort('total_cost')}>
            Cost{get_sort_indicator('total_cost')}
          </th>
          <th onClick={() => handle_sort('total_tokens')}>
            Tokens{get_sort_indicator('total_tokens')}
          </th>
          <th>Tools</th>
          <th>Model</th>
        </tr>
      </thead>
      <tbody>
        {sorted_sessions.map((session) => (
          <tr 
            key={session.id} 
            onClick={() => on_click?.(session)}
            className={on_click ? 'clickable' : ''}
          >
            {show_project && <td>{session.project_name}</td>}
            <td>{session.title || session.id.slice(0, 50) + '...'}</td>
            <td>{format_duration(session.duration_seconds)}</td>
            <td>{format_cost(session.total_cost)}</td>
            <td>{format_tokens(session.total_tokens)}</td>
            <td>{get_top_tools(session.tool_calls)}</td>
            <td>{get_primary_model(session.models_used)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}