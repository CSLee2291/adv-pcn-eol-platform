import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SecondaryCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Risk Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { level: "CRITICAL", count: 2, variant: "critical" as const },
            { level: "HIGH", count: 5, variant: "high" as const },
            { level: "MEDIUM", count: 8, variant: "medium" as const },
            { level: "LOW", count: 12, variant: "low" as const },
          ].map((item) => (
            <div key={item.level} className="flex items-center justify-between">
              <Badge variant={item.variant}>{item.level}</Badge>
              <span className="text-body font-medium text-[var(--text-primary)]">{item.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent PCN Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-meta text-[var(--text-muted)]">
            No events yet. Upload a PCN to get started.
          </p>
        </CardContent>
      </Card>

      {/* Top Vendors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Vendors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-meta text-[var(--text-muted)]">
            Vendor statistics will appear here.
          </p>
        </CardContent>
      </Card>

      {/* Pending Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-meta text-[var(--text-muted)]">
            No pending actions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
