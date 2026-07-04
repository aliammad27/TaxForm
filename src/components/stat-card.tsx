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
        <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        <p
          className={cn(
            "truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl",
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
