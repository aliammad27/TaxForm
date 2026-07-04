import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "truncate font-heading text-2xl font-bold tracking-tight sm:text-3xl",
              valueClassName
            )}
          >
            {value}
          </p>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4.5" />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
