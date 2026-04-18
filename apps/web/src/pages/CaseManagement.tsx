import { useState, useEffect } from "react";
import { Folder, User, Calendar, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { CaseStatus } from "shared/types";

interface CaseRecord {
  id: string;
  caseNumber: string;
  pcnNumber: string;
  customerName: string;
  caseStatus: CaseStatus;
  decision: string | null;
  createdAt: string;
}

const caseStatusConfig: Record<CaseStatus, { label: string; variant: "low" | "medium" | "high" | "info" | "outline" }> = {
  OPEN: { label: "Open", variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "medium" },
  WAITING_RD: { label: "Waiting RD", variant: "high" },
  WAITING_CUSTOMER: { label: "Waiting Customer", variant: "medium" },
  CLOSED: { label: "Closed", variant: "outline" },
};

export function CaseManagement() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    // Will fetch from API once backend is running
    setLoading(false);
    setCases([]);
  }, [statusFilter]);

  const stats = {
    open: cases.filter((c) => c.caseStatus === "OPEN" || c.caseStatus === "IN_PROGRESS").length,
    waiting: cases.filter((c) => c.caseStatus === "WAITING_RD" || c.caseStatus === "WAITING_CUSTOMER").length,
    closed: cases.filter((c) => c.caseStatus === "CLOSED").length,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-title text-[var(--text-primary)]">Case Management</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-primary-50 dark:bg-primary-900/30">
              <AlertTriangle className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <p className="text-kpi font-semibold text-[var(--text-primary)]">{stats.open}</p>
              <p className="text-meta text-[var(--text-muted)]">Active Cases</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-amber-50 dark:bg-amber-900/30">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-kpi font-semibold text-[var(--text-primary)]">{stats.waiting}</p>
              <p className="text-meta text-[var(--text-muted)]">Waiting</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-green-50 dark:bg-green-900/30">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-kpi font-semibold text-[var(--text-primary)]">{stats.closed}</p>
              <p className="text-meta text-[var(--text-muted)]">Closed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter + Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-primary-500" />
              Cases
            </CardTitle>
            <div className="w-48">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "", label: "All Status" },
                  { value: "OPEN", label: "Open" },
                  { value: "IN_PROGRESS", label: "In Progress" },
                  { value: "WAITING_RD", label: "Waiting RD" },
                  { value: "WAITING_CUSTOMER", label: "Waiting Customer" },
                  { value: "CLOSED", label: "Closed" },
                ]}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
              Loading...
            </div>
          ) : cases.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <Folder className="h-10 w-10 text-[var(--text-muted)]" />
              <p className="text-body text-[var(--text-muted)]">
                No cases yet. Cases are created when PCN events trigger customer notifications.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case #</TableHead>
                  <TableHead>PCN</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => {
                  const cfg = caseStatusConfig[c.caseStatus];
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-primary-500">{c.caseNumber}</TableCell>
                      <TableCell>{c.pcnNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-[var(--text-muted)]" />
                          {c.customerName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell>{c.decision ?? "—"}</TableCell>
                      <TableCell className="text-meta text-[var(--text-muted)]">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(c.createdAt).toLocaleDateString("zh-TW")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
