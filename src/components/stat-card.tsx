import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </p>
        <p
          className={cn(
            "truncate text-[30px] font-semibold tracking-[-0.02em] tabular-nums",
            valueClassName
          )}
        >
          {value}
        </p>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
