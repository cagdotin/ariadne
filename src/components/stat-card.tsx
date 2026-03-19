interface StatCardProps {
  label: string;
  value: string;
  sub_label?: string;
}

export function StatCard({ label, value, sub_label }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub_label && <div className="sub-label">{sub_label}</div>}
    </div>
  );
}