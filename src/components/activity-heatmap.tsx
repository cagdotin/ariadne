import type { DayCount } from "../schemas/analytics";

interface ActivityHeatmapProps {
  data: DayCount[];
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  // Generate a 52-week grid (52 columns × 7 rows)
  const weeks = 52;
  const days_per_week = 7;
  
  // Create a map for quick lookups
  const data_map = new Map<string, number>();
  data.forEach(item => {
    data_map.set(item.date, item.count);
  });

  // Get current date and calculate start date (52 weeks ago)
  const today = new Date();
  const start_date = new Date(today);
  start_date.setDate(start_date.getDate() - (weeks * days_per_week - 1));

  // Generate grid data
  const grid_data: Array<{ date: string; count: number; day: number; week: number }> = [];
  
  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < days_per_week; day++) {
      const current_date = new Date(start_date);
      current_date.setDate(start_date.getDate() + (week * days_per_week + day));
      
      const date_string = current_date.toISOString().split('T')[0];
      const count = data_map.get(date_string) || 0;
      
      grid_data.push({
        date: date_string,
        count,
        day,
        week
      });
    }
  }

  const get_level = (count: number) => {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 10) return 3;
    return 4;
  };

  // Generate month labels
  const month_labels: Array<{ month: string; week: number }> = [];
  let current_month = '';
  
  for (let week = 0; week < weeks; week++) {
    const week_start = new Date(start_date);
    week_start.setDate(start_date.getDate() + (week * 7));
    const month = week_start.toLocaleDateString('en', { month: 'short' });
    
    if (month !== current_month && week % 4 === 0) {
      month_labels.push({ month, week });
      current_month = month;
    }
  }

  const day_labels = ['Mon', 'Wed', 'Fri'];

  return (
    <div style={{ padding: '1rem', background: 'var(--bg-float)', borderRadius: '4px' }}>
      <h3 className="section-title">Activity</h3>
      
      {/* Month labels */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `20px repeat(${weeks}, 12px)`, 
        gap: '2px',
        marginBottom: '4px'
      }}>
        <div></div>
        {Array.from({ length: weeks }, (_, week) => {
          const label = month_labels.find(m => m.week === week);
          return (
            <div 
              key={week} 
              style={{ 
                fontSize: '10px', 
                color: 'var(--subtext0)',
                textAlign: 'center'
              }}
            >
              {label?.month || ''}
            </div>
          );
        })}
      </div>

      {/* Heatmap grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `20px repeat(${weeks}, 12px)`, 
        gap: '2px' 
      }}>
        {/* Day labels column */}
        {Array.from({ length: days_per_week }, (_, day) => {
          const label = day_labels[Math.floor(day / 2)] || '';
          return (
            <div 
              key={`day-label-${day}`}
              style={{ 
                fontSize: '10px', 
                color: 'var(--subtext0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '12px'
              }}
            >
              {day % 2 === 0 ? label : ''}
            </div>
          );
        })}

        {/* Heatmap cells */}
        {Array.from({ length: weeks }, (_, week) =>
          Array.from({ length: days_per_week }, (_, day) => {
            const cell = grid_data.find(d => d.week === week && d.day === day);
            const level = cell ? get_level(cell.count) : 0;
            
            return (
              <div
                key={`${week}-${day}`}
                className={`heatmap-cell level-${level}`}
                title={cell ? `${cell.date}: ${cell.count} sessions` : ''}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '2px'
                }}
              />
            );
          })
        ).flat()}
      </div>

      {/* Legend */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginTop: '8px',
        fontSize: '10px',
        color: 'var(--subtext0)'
      }}>
        <span>Less</span>
        {[0, 1, 2, 3, 4].map(level => (
          <div
            key={level}
            className={`heatmap-cell level-${level}`}
            style={{ width: '10px', height: '10px' }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}