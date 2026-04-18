import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Brain,
  GitBranch,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { fetchEvents } from "@/services/api";
import { formatDate } from "@/lib/utils";
import type { PcnEvent, EventStatus, RiskLevel } from "shared/types";
import { EVENT_STATUS_LABELS, PCN_TYPE_LABELS } from "shared/constants";

const statusBadgeVariant = (status: EventStatus) => {
  switch (status) {
    case "PENDING_REVIEW": return "high" as const;
    case "PENDING": return "medium" as const;
    case "AI_ANALYZED": return "info" as const;
    case "CE_REVIEWED": return "info" as const;
    case "WHERE_USED_DONE": return "info" as const;
    case "NOTIFIED": return "low" as const;
    case "CLOSED": return "outline" as const;
    default: return "default" as const;
  }
};

const riskBadgeVariant = (risk?: RiskLevel) => {
  switch (risk) {
    case "LOW": return "low" as const;
    case "MEDIUM": return "medium" as const;
    case "HIGH": return "high" as const;
    case "CRITICAL": return "critical" as const;
    default: return "outline" as const;
  }
};

export function PCNEvents() {
  const [events, setEvents] = useState<PcnEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    setError("");
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    params.page = String(page);
    params.pageSize = String(pageSize);

    fetchEvents(params)
      .then((res) => {
        setEvents(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      })
      .catch((err) => setError(err.response?.data?.error?.message ?? err.message ?? "Failed to load events"))
      .finally(() => setLoading(false));
  }, [search, statusFilter, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-title text-[var(--text-primary)]">PCN Events</h1>
          <Link to="/pcn/upload">
            <Button>
              <Plus className="h-4 w-4" />
              Upload PCN
            </Button>
          </Link>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-panel border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <FileText className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-body text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  placeholder="Search by PCN number, vendor, title..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
              <div className="w-48">
                <Select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  options={[
                    { value: "", label: "All Status" },
                    ...Object.entries(EVENT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
                  ]}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Filter className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Advanced filters</TooltipContent>
              </Tooltip>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
                Loading...
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">No PCN events found</p>
                <Link to="/pcn/upload">
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4" />
                    Upload your first PCN
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PCN Number</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Link
                            to={`/pcn/${event.id}`}
                            className="font-medium text-primary-500 hover:underline"
                          >
                            {event.pcnNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{event.vendorName}</TableCell>
                        <TableCell className="max-w-[240px] truncate">
                          {event.pcnTitle}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {PCN_TYPE_LABELS[event.pcnType] ?? event.pcnType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={riskBadgeVariant(event.aiAnalysis?.riskLevel)}>
                            {event.aiAnalysis?.riskLevel ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(event.status)}>
                            {EVENT_STATUS_LABELS[event.status] ?? event.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-meta text-[var(--text-muted)]">
                          {formatDate(event.receivedDate)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/pcn/${event.id}`}>
                                  <Eye className="h-4 w-4 mr-2" /> View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/analysis/${event.id}`}>
                                  <Brain className="h-4 w-4 mr-2" /> AI Analysis
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link to={`/where-used/${event.id}`}>
                                  <GitBranch className="h-4 w-4 mr-2" /> Where-Used
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--surface-divider)] mt-4">
                  <p className="text-meta text-[var(--text-muted)]">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-meta text-[var(--text-secondary)] px-2">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
