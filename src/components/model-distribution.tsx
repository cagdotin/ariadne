import type { ModelAggregate } from "../schemas/analytics";

interface ModelDistributionProps {
  models: ModelAggregate[];
}

export function ModelDistribution({ models }: ModelDistributionProps) {
  const sorted_models = [...models].sort((a, b) => b.message_count - a.message_count);
  const max_count = sorted_models[0]?.message_count || 1;
  
  // Colors cycle through different Tokyo Night colors
  const colors = [
    'var(--blue)',
    'var(--magenta)', 
    'var(--teal)',
    'var(--orange)',
    'var(--purple)',
    'var(--cyan)',
    'var(--green)',
    'var(--yellow)'
  ];

  const format_cost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div style={{ padding: '1rem', background: 'var(--bg-float)', borderRadius: '4px' }}>
      <h3 className="section-title">Model Distribution</h3>
      <div className="bar-chart">
        {sorted_models.map((model, index) => {
          const width = (model.message_count / max_count) * 100;
          const color = colors[index % colors.length];
          
          return (
            <div key={`${model.model_id}-${model.provider}`} className="bar-item">
              <div className="bar-label" style={{ minWidth: '150px' }}>
                <div style={{ color: 'var(--text)', fontSize: '0.8rem' }}>
                  {model.model_id}
                </div>
                <div style={{ color: 'var(--comment)', fontSize: '0.65rem' }}>
                  {model.provider}
                </div>
              </div>
              <div className="bar-visual">
                <div 
                  className="bar-fill"
                  style={{ 
                    width: `${width}%`,
                    background: color
                  }}
                />
              </div>
              <div className="bar-count" style={{ minWidth: '100px', textAlign: 'right' }}>
                <div style={{ color: 'var(--text)', fontSize: '0.75rem' }}>
                  {model.message_count} msgs
                </div>
                <div style={{ color: 'var(--comment)', fontSize: '0.65rem' }}>
                  {format_cost(model.total_cost)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}