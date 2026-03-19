import type { ToolAggregate } from "../schemas/analytics";

interface ToolUsageBarProps {
  tools: ToolAggregate[];
}

export function ToolUsageBar({ tools }: ToolUsageBarProps) {
  const sorted_tools = [...tools].sort((a, b) => b.total_calls - a.total_calls);
  const max_calls = sorted_tools[0]?.total_calls || 1;

  return (
    <div style={{ padding: '1rem', background: 'var(--bg-float)', borderRadius: '4px' }}>
      <h3 className="section-title">Tool Usage</h3>
      <div className="bar-chart">
        {sorted_tools.map((tool) => {
          const success_calls = tool.total_calls - tool.total_errors;
          const success_width = (success_calls / max_calls) * 100;
          const error_width = (tool.total_errors / max_calls) * 100;
          
          return (
            <div key={tool.name} className="bar-item">
              <div className="bar-label" style={{ minWidth: '120px' }}>
                {tool.name}
              </div>
              <div className="bar-visual">
                {/* Success portion */}
                <div 
                  className="bar-fill"
                  style={{ 
                    width: `${success_width}%`,
                    background: 'var(--blue)',
                    position: 'absolute',
                    left: 0
                  }}
                />
                {/* Error portion */}
                {tool.total_errors > 0 && (
                  <div 
                    className="bar-fill"
                    style={{ 
                      width: `${error_width}%`,
                      background: 'var(--red)',
                      position: 'absolute',
                      left: `${success_width}%`
                    }}
                  />
                )}
              </div>
              <div className="bar-count">
                {tool.total_calls}
                {tool.total_errors > 0 && (
                  <span style={{ color: 'var(--red)', marginLeft: '4px' }}>
                    ({tool.total_errors})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}