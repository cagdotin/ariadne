interface CostBreakdownProps {
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_write_cost: number;
}

export function CostBreakdown({ 
  input_cost, 
  output_cost, 
  cache_read_cost, 
  cache_write_cost 
}: CostBreakdownProps) {
  const total_cost = input_cost + output_cost + cache_read_cost + cache_write_cost;
  
  const categories = [
    { name: 'Input', cost: input_cost, color: 'var(--blue)' },
    { name: 'Output', cost: output_cost, color: 'var(--green)' },
    { name: 'Cache Read', cost: cache_read_cost, color: 'var(--teal)' },
    { name: 'Cache Write', cost: cache_write_cost, color: 'var(--orange)' }
  ].filter(cat => cat.cost > 0);

  const format_cost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const get_percentage = (cost: number) => {
    if (total_cost === 0) return 0;
    return (cost / total_cost) * 100;
  };

  return (
    <div style={{ padding: '1rem', background: 'var(--bg-float)', borderRadius: '4px' }}>
      <h3 className="section-title">Cost Breakdown</h3>
      
      {/* Stacked bar */}
      <div style={{ 
        marginBottom: '1rem',
        height: '20px',
        background: 'var(--bg-highlight)',
        borderRadius: '4px',
        display: 'flex',
        overflow: 'hidden'
      }}>
        {categories.map((category) => {
          const width = get_percentage(category.cost);
          return (
            <div
              key={category.name}
              style={{
                width: `${width}%`,
                background: category.color,
                height: '100%'
              }}
              title={`${category.name}: ${format_cost(category.cost)} (${width.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="bar-chart">
        {categories.map((category) => {
          const percentage = get_percentage(category.cost);
          
          return (
            <div key={category.name} className="bar-item">
              <div className="bar-label" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                minWidth: '120px'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  background: category.color,
                  borderRadius: '2px'
                }} />
                {category.name}
              </div>
              <div className="bar-visual">
                <div 
                  className="bar-fill"
                  style={{ 
                    width: `${percentage}%`,
                    background: category.color
                  }}
                />
              </div>
              <div className="bar-count">
                {format_cost(category.cost)}
                <span style={{ color: 'var(--comment)', marginLeft: '4px' }}>
                  ({percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Total */}
      <div style={{ 
        marginTop: '1rem', 
        paddingTop: '1rem', 
        borderTop: '1px solid var(--bg-highlight)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ color: 'var(--text)', fontWeight: '600' }}>Total</span>
        <span style={{ color: 'var(--text)', fontWeight: '600' }}>
          {format_cost(total_cost)}
        </span>
      </div>
    </div>
  );
}