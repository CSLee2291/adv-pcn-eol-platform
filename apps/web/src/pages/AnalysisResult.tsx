import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Brain, ArrowLeft, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAnalysis, fetchEvents } from "@/services/api";
import { formatDateTime } from "@/lib/utils";
import type { PcnEvent, AiAnalysisResult, RiskLevel } from "shared/types";

const riskVariant = (r: RiskLevel) => {
  switch (r) {
    case "LOW": return "low" as const;
    case "MEDIUM": return "medium" as const;
    case "HIGH": return "high" as const;
    case "CRITICAL": return "critical" as const;
  }
};

export function AnalysisResult() {
  const { eventId } = useParams<{ eventId: string }>();
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [recentEvents, setRecentEvents] = useState<PcnEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    if (eventId) {
      fetchAnalysis(eventId)
        .then(setAnalysis)
        .catch((err) => setError(err.response?.data?.error?.message ?? err.message ?? "Failed to load analysis"))
        .finally(() => setLoading(false));
    } else {
      fetchEvents({ pageSize: "10" })
        .then((res) => setRecentEvents(res.data ?? []))
        .catch((err) => setError(err.response?.data?.error?.message ?? err.message ?? "Failed to load events"))
        .finally(() => setLoading(false));
    }
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="text-body text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  // Single analysis view
  if (eventId && analysis) {
    return (
      <div className="space-y-6">
        <Link
          to="/analysis"
          className="inline-flex items-center gap-1 text-meta text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>

        <div className="flex items-center justify-between">
          <h1 className="text-title text-[var(--text-primary)]">AI Analysis Result</h1>
          <Badge variant={riskVariant(analysis.riskLevel)}>{analysis.riskLevel}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Form / Fit / Function</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(["form", "fit", "function"] as const).map((key) => {
                const changed = analysis[`${key}Changed` as keyof AiAnalysisResult] as boolean;
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-[var(--surface-divider)] last:border-0">
                    <span className="text-body text-[var(--text-primary)] capitalize">{key}</span>
                    <div className="flex items-center gap-2">
                      {changed ? (
                        <><XCircle className="h-4 w-4 text-red-500" /><span className="text-meta text-red-500 font-medium">Changed</span></>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 text-green-500" /><span className="text-meta text-green-500 font-medium">No Change</span></>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Analysis Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-meta text-[var(--text-muted)]">Model</p>
                <p className="text-body text-[var(--text-primary)]">{analysis.aiModelVersion}</p>
              </div>
              <div>
                <p className="text-meta text-[var(--text-muted)]">Confidence</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{ width: `${analysis.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-meta text-[var(--text-secondary)]">
                    {(analysis.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-meta text-[var(--text-muted)]">Analyzed</p>
                <p className="text-body text-[var(--text-primary)]">{formatDateTime(analysis.analyzedAt)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-body text-[var(--text-primary)]">{analysis.summary}</p>
            <div>
              <p className="text-meta text-[var(--text-muted)] mb-1">Change Description</p>
              <p className="text-body text-[var(--text-primary)]">{analysis.changeDescription}</p>
            </div>
            {analysis.riskReason && (
              <div>
                <p className="text-meta text-[var(--text-muted)] mb-1">Risk Reason</p>
                <p className="text-body text-[var(--text-primary)]">{analysis.riskReason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {analysis.affectedParts && analysis.affectedParts.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Affected Parts ({analysis.affectedParts.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {analysis.affectedParts.map((p, i) => (
                  <Badge key={i} variant="outline">{p.mpn}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // No eventId — list view
  if (!eventId) {
    const analyzed = recentEvents.filter((e) => e.aiAnalysis);
    return (
      <div className="space-y-6">
        <h1 className="text-title text-[var(--text-primary)]">AI Analysis</h1>
        {analyzed.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <Brain className="h-10 w-10 text-[var(--text-muted)]" />
              <p className="text-body text-[var(--text-muted)]">
                No AI analysis results yet. Upload a PCN document to get started.
              </p>
              <Link to="/pcn/upload"><Button>Upload PCN</Button></Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analyzed.map((e) => (
              <Link key={e.id} to={`/analysis/${e.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-body font-medium text-[var(--text-primary)]">{e.pcnNumber}</span>
                      <Badge variant={riskVariant(e.aiAnalysis!.riskLevel)}>
                        {e.aiAnalysis!.riskLevel}
                      </Badge>
                    </div>
                    <p className="text-meta text-[var(--text-secondary)]">{e.vendorName}</p>
                    <p className="text-meta text-[var(--text-muted)] line-clamp-2">{e.aiAnalysis!.summary}</p>
                    <div className="flex gap-2 pt-1">
                      <Badge variant={e.aiAnalysis!.formChanged ? "high" : "low"} className="text-[11px]">Form</Badge>
                      <Badge variant={e.aiAnalysis!.fitChanged ? "high" : "low"} className="text-[11px]">Fit</Badge>
                      <Badge variant={e.aiAnalysis!.functionChanged ? "high" : "low"} className="text-[11px]">Function</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-body text-[var(--text-muted)]">Analysis not found.</p>
      </CardContent>
    </Card>
  );
}
