import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  sub_label?: string;
}

export function StatCard({ label, value, sub_label }: StatCardProps) {
  return (
    <Card className="text-center min-w-0">
      <CardContent className="pt-6 px-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 truncate">{label}</p>
        <p className="text-xl md:text-2xl font-semibold text-foreground mb-1 truncate">{value}</p>
        {sub_label && <p className="text-[10px] text-muted-foreground">{sub_label}</p>}
      </CardContent>
    </Card>
  );
}
