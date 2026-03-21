import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  sub_label?: string;
  href?: string;
  info_tip?: ReactNode;
}

export function StatCard({ label, value, sub_label, href, info_tip }: StatCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className={`min-w-[140px] flex-1 basis-[calc(50%-0.375rem)] sm:basis-[calc(33.333%-0.5rem)] xl:basis-0 transition-colors ${href ? "cursor-pointer hover:bg-accent/50" : ""}`}
      onClick={href ? () => navigate({ to: href }) : undefined}
    >
      <CardContent className="pt-5 pb-4 px-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
          <span className="truncate">{label}</span>
          {info_tip}
        </p>
        <p className="text-xl font-semibold text-foreground truncate">{value}</p>
        {sub_label && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">{sub_label}</p>
        )}
      </CardContent>
    </Card>
  );
}
