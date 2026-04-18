import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardKpi } from "shared/types";
import {
  FileText,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Timer,
  Brain,
} from "lucide-react";

interface KpiStripProps {
  data: DashboardKpi | null;
  loading?: boolean;
}

const kpiConfig = [
  { key: "activePcns" as const, label: "Active PCNs", icon: FileText, format: (v: number) => String(v) },
  { key: "eolAlerts" as const, label: "EOL Alerts", icon: AlertTriangle, badgeVariant: "critical" as const },
  { key: "highRisk" as const, label: "High Risk", icon: ShieldAlert, badgeVariant: "high" as const },
  { key: "pendingReview" as const, label: "Pending CE Review", icon: Clock },
  { key: "avgResolutionDays" as const, label: "Avg. Resolution Time", icon: Timer, suffix: " days" },
  { key: "aiAccuracy" as const, label: "AI Accuracy", icon: Brain, suffix: "%", badgeVariant: "low" as const },
];

export function KpiStrip({ data, loading }: KpiStripProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpiConfig.map((kpi) => (
        <Card key={kpi.key} className="flex flex-col gap-1 p-4">
          <div className="flex items-center gap-2 text-meta text-[var(--text-muted)]">
            <kpi.icon className="h-4 w-4" />
            <span>{kpi.label}</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-kpi text-[var(--text-primary)]">
              {loading ? "—" : `${data?.[kpi.key] ?? 0}${kpi.suffix ?? ""}`}
            </span>
            {kpi.badgeVariant && data?.[kpi.key] !== undefined && (
              <Badge variant={kpi.badgeVariant} className="mb-1">
                {data[kpi.key]}
              </Badge>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
