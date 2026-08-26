import { Card, CardContent } from "@/components/ui/card";

export const KpiCard = ({ title, value, sub, icon: Icon, iconClass = "text-primary bg-primary/10", testId }) => (
  <Card className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p data-testid={testId} className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums font-heading truncate">
            {value}
          </p>
          {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        {Icon ? (
          <div className={`shrink-0 rounded-lg p-2.5 ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </CardContent>
  </Card>
);
