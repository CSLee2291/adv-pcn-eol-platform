import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Brain,
  GitBranch,
  ShieldCheck,
  Calendar,
  Building2,
  User,
  FileText,
  Loader2,
  Cpu,
  Package,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Database,
  Cloud,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  fetchEvent,
  updateEvent,
  triggerAnalysis,
  triggerRules,
  searchMpn,
  refreshMpn,
  getPartsInfo,
  getWhereUsedQuery,
  streamWhereUsedQuery,
  exportExcelFromCache,
  createCeAssessment,
  suggestRd,
  createRdTask,
  fetchRdTasks as fetchRdTasksApi,
  respondRdTask,
  remindRdTask,
  fetchCeAssessments,
  translateAnalysis,
  exportWhereUsedExcel,
} from "@/services/api";
import { Languages, Download } from "lucide-react";
import { Pencil, Save, X, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { PcnEvent, RiskLevel } from "shared/types";
import { EVENT_STATUS_LABELS, PCN_TYPE_LABELS } from "shared/constants";

/* ---------- types for Denodo data ---------- */

interface MpnRecord {
  ITEM_NUMBER: string;
  MANUFACTURE_NAME: string;
  MFR_PART_NUMBER: string;
  MFR_PART_LIFECYCLE_PHASE: string;
  PREDERRED_STATUS: string;
  search_mpn: string;
  source?: "cache" | "denodo";
}

interface MpnResult {
  total: number;
  by_manufacturer: Record<string, MpnRecord[]>;
  errors: { mpn: string; error: string }[];
  cache_stats?: {
    from_cache: number;
    from_denodo: number;
    not_found: string[];
  };
}

interface PartsInfoRecord {
  MPN: string;
  Manufacturer: string;
  "Part Number": string;
  Part_Cat: string;
  Description: string;
  LifeCycle_Phase: string;
  "Material Category": string;
  QC_Control: string;
  "Replaced by": string;
  Comment: string;
  "Approve Date": string;
  "CE Owner": string;
}

interface WhereUsedRecord {
  Component: string;
  Part_Cat: string;
  Item_Desc: string;
  LifeCycle_Phase: string;
  Product_Name: string;
  Product_Part_Cat: string;
  Product_LifeCycle: string;
  "Model Name": string;
  Request_for_Plant: string;
  Product_Line: string;
  PG: string;
  PD: string;
  Product_Owner: string;
  EMAIL: string;
}

interface RuleResult {
  ruleName: string;
  triggered: boolean;
  severity: "INFO" | "WARNING" | "CRITICAL";
  actions: string[];
  message: string;
}

interface RuleEvaluation {
  eventId: string;
  results: RuleResult[];
  executedActions: string[];
}

/* ---------- helpers ---------- */

const riskVariant = (r?: RiskLevel) => {
  switch (r) {
    case "LOW":
      return "low" as const;
    case "MEDIUM":
      return "medium" as const;
    case "HIGH":
      return "high" as const;
    case "CRITICAL":
      return "critical" as const;
    default:
      return "outline" as const;
  }
};

const severityIcon = (sev: string, triggered: boolean) => {
  if (!triggered) return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  switch (sev) {
    case "CRITICAL":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "WARNING":
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    default:
      return <Info className="h-5 w-5 text-blue-500" />;
  }
};

const ruleDisplayName: Record<string, string> = {
  EOL_DETECTION: "EOL Detection",
  HIGH_RISK_IC: "High Risk IC",
  RD_VERIFICATION_REQUIRED: "RD Verification Required",
  CUSTOMER_NOTIFICATION: "Customer Notification",
};

const actionDisplayName: Record<string, string> = {
  NOTIFY_PM: "Notify PM",
  REQUIRE_RD_VERIFICATION: "Require RD Verification",
  NOTIFY_CUSTOMER: "Notify Customer",
  LAST_TIME_BUY: "Last Time Buy",
  FLAG_HIGH_RISK: "Flag High Risk",
  AUTO_CLOSE: "Auto Close",
};

/* ---------- component ---------- */

export function PCNDetail() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<PcnEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Rules state
  const [ruleEval, setRuleEval] = useState<RuleEvaluation | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);

  // Affected Parts state (MPN → ITEM_NUMBER mapping)
  const [mpnResult, setMpnResult] = useState<MpnResult | null>(null);
  const [partsInfo, setPartsInfo] = useState<PartsInfoRecord[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsStep, setPartsStep] = useState("");

  // Where-Used state
  const [whereUsed, setWhereUsed] = useState<WhereUsedRecord[]>([]);
  const [whereUsedLoading, setWhereUsedLoading] = useState(false);
  const [whereUsedQueried, setWhereUsedQueried] = useState(false);
  const [wuProgress, setWuProgress] = useState<{ step: string; current: number; total: number; cached?: number; queried?: number; itemNumber?: string } | null>(null);
  const [wuCacheStats, setWuCacheStats] = useState<{ from_cache: number; from_denodo: number; cached_at?: string } | null>(null);

  // Refresh state
  const [refreshingMpns, setRefreshingMpns] = useState<Set<string>>(new Set());

  // CE Assessment state
  const [assessments, setAssessments] = useState<any[]>([]);
  const [assessmentForm, setAssessmentForm] = useState({
    assessorName: "",
    ceDecision: "ACCEPT" as string,
    comments: "",
    overrideRiskLevel: "" as string,
    needRdVerification: false,
  });
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);
  const [assessmentSuccess, setAssessmentSuccess] = useState("");
  const [exporting, setExporting] = useState(false);

  // RD Verification state
  const [rdTasks, setRdTasks] = useState<any[]>([]);
  const [rdSuggestions, setRdSuggestions] = useState<any[]>([]);
  const [rdAssigning, setRdAssigning] = useState(false);
  const [rdForm, setRdForm] = useState({ assignedRdName: "", assignedRdEmail: "", priority: "NORMAL", assignedBy: "" });

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ vendorName: "", pcnType: "", receivedDate: "", ceOwnerName: "" });
  const [saving, setSaving] = useState(false);

  // User-added MPNs state
  const [newMpnInput, setNewMpnInput] = useState("");

  // Translation state
  const [translation, setTranslation] = useState<{ summary: string; changeDescription: string; riskReason: string } | null>(null);
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!ai || translating) return;
    setTranslating(true);
    try {
      const result = await translateAnalysis({
        summary: ai.summary || "",
        changeDescription: ai.changeDescription || "",
        riskReason: ai.riskReason || "",
      });
      setTranslation(result);
    } catch (err) {
      console.error("Translation failed:", err);
    } finally {
      setTranslating(false);
    }
  };

  const startEdit = () => {
    if (!event) return;
    setEditForm({
      vendorName: event.vendorName || "",
      pcnType: event.pcnType || "OTHER",
      receivedDate: event.receivedDate ? event.receivedDate.substring(0, 10) : "",
      ceOwnerName: event.ceOwnerName || "",
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); };

  const saveEdit = async () => {
    if (!id || !event) return;
    setSaving(true);
    try {
      const data: Record<string, any> = {
        vendorName: editForm.vendorName,
        pcnType: editForm.pcnType,
        ceOwnerName: editForm.ceOwnerName || null,
      };
      if (editForm.receivedDate) data.receivedDate = new Date(editForm.receivedDate).toISOString();
      const updated = await updateEvent(id, data);
      setEvent(updated);
      setEditing(false);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const addUserMpn = async () => {
    if (!id || !event || !newMpnInput.trim()) return;
    const currentMpns = (event.userAddedMpns as string[]) || [];
    const mpn = newMpnInput.trim().toUpperCase();
    if (currentMpns.includes(mpn)) return;
    const updated = await updateEvent(id, { userAddedMpns: [...currentMpns, mpn] });
    setEvent(updated);
    setNewMpnInput("");
  };

  const removeUserMpn = async (mpn: string) => {
    if (!id || !event) return;
    const currentMpns = (event.userAddedMpns as string[]) || [];
    const updated = await updateEvent(id, { userAddedMpns: currentMpns.filter((m) => m !== mpn) });
    setEvent(updated);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchEvent(id)
      .then(setEvent)
      .catch(console.error)
      .finally(() => setLoading(false));
    // Auto-load assessments so tab badge shows count immediately
    fetchCeAssessments(id).then(setAssessments).catch(console.error);
  }, [id]);

  const handleAnalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      await triggerAnalysis(id);
      const rulesResult = await triggerRules(id);
      setRuleEval(rulesResult);
      const updated = await fetchEvent(id);
      setEvent(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Load rules when tab is clicked and we have AI results
  const loadRules = useCallback(async () => {
    if (!id || ruleEval || rulesLoading) return;
    setRulesLoading(true);
    try {
      const result = await triggerRules(id);
      setRuleEval(result);
    } catch (err) {
      console.error("Failed to load rules:", err);
    } finally {
      setRulesLoading(false);
    }
  }, [id, ruleEval, rulesLoading]);

  // Load CE assessments
  const loadAssessments = useCallback(async () => {
    if (!id) return;
    try {
      const result = await fetchCeAssessments(id);
      setAssessments(result);
    } catch (err) {
      console.error("Failed to load assessments:", err);
    }
  }, [id]);

  const handleSubmitAssessment = async () => {
    if (!id || !assessmentForm.assessorName || assessmentSubmitting) return;
    setAssessmentSubmitting(true);
    setAssessmentSuccess("");
    try {
      await createCeAssessment(id, {
        assessorName: assessmentForm.assessorName,
        ceDecision: assessmentForm.ceDecision,
        comments: assessmentForm.comments || undefined,
        overrideRiskLevel: assessmentForm.overrideRiskLevel || undefined,
        needRdVerification: assessmentForm.needRdVerification,
      });
      const decision = assessmentForm.ceDecision;
      setAssessmentForm({ assessorName: "", ceDecision: "ACCEPT", comments: "", overrideRiskLevel: "", needRdVerification: false });
      await loadAssessments();
      const updated = await fetchEvent(id);
      setEvent(updated);
      // Show success with next-step guidance
      if (decision === "NEED_EVALUATION") {
        setAssessmentSuccess("Assessment submitted. Next: Review Affected Parts / Where-Used tabs, then coordinate RD verification.");
      } else if (decision === "LAST_TIME_BUY") {
        setAssessmentSuccess("Assessment submitted. Next: Review Where-Used tab to identify impacted products for Last-Time Buy.");
      } else if (decision === "REJECT") {
        setAssessmentSuccess("Assessment submitted (REJECT). Coordinate with vendor for alternative solutions.");
      } else {
        setAssessmentSuccess("Assessment submitted. Proceed to Affected Parts / Where-Used tabs to review component impact.");
      }
    } catch (err) {
      console.error("Failed to submit assessment:", err);
    } finally {
      setAssessmentSubmitting(false);
    }
  };

  // RD Verification functions
  const loadRdTasks = useCallback(async () => {
    if (!id) return;
    try {
      const tasks = await fetchRdTasksApi({ pcnEventId: id });
      setRdTasks(tasks);
    } catch (err) {
      console.error("Failed to load RD tasks:", err);
    }
  }, [id]);

  const loadRdSuggestions = useCallback(async (assessmentId: string) => {
    try {
      const suggestions = await suggestRd(assessmentId);
      setRdSuggestions(suggestions);
      if (suggestions.length > 0) {
        setRdForm((f) => ({ ...f, assignedRdName: suggestions[0].rdName, assignedRdEmail: suggestions[0].rdEmail }));
      }
    } catch (err) {
      console.error("Failed to load RD suggestions:", err);
    }
  }, []);

  const handleAssignRd = async () => {
    if (!id || !rdForm.assignedRdName || !rdForm.assignedRdEmail || !rdForm.assignedBy || rdAssigning) return;
    const latestAssessment = assessments[0];
    if (!latestAssessment) return;
    setRdAssigning(true);
    try {
      await createRdTask({
        ceAssessmentId: latestAssessment.id,
        pcnEventId: id,
        assignedRdName: rdForm.assignedRdName,
        assignedRdEmail: rdForm.assignedRdEmail,
        assignedBy: rdForm.assignedBy,
        priority: rdForm.priority,
      });
      setRdForm({ assignedRdName: "", assignedRdEmail: "", priority: "NORMAL", assignedBy: "" });
      await loadRdTasks();
    } catch (err) {
      console.error("Failed to assign RD:", err);
    } finally {
      setRdAssigning(false);
    }
  };

  const handleRdRespond = async (taskId: string, decision: string) => {
    try {
      await respondRdTask(taskId, { rdDecision: decision });
      await loadRdTasks();
    } catch (err) {
      console.error("Failed to respond RD task:", err);
    }
  };

  const handleExportExcel = async (includeWhereUsed = true) => {
    if (exporting) return;
    setExporting(true);
    try {
      // Server-side export from cache — only sends itemNumbers, not 10K+ records
      const itemNumbers = await getItemNumbers();
      if (!itemNumbers.length) { setExporting(false); return; }

      let response;
      if (includeWhereUsed) {
        // Server builds Excel from cached where-used + frontend-loaded parts info
        // This avoids: (1) uploading 10K records, (2) re-querying Denodo for parts info
        response = await exportExcelFromCache(itemNumbers, { parts_info: partsInfo.length > 0 ? partsInfo : undefined });
      } else {
        // Parts-only export — small payload
        response = await exportWhereUsedExcel(partsInfo, []);
      }

      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PCN_${event?.pcnNumber ?? "export"}_Analysis_${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  // Load affected parts from AI-extracted MPNs via Denodo
  const loadAffectedParts = useCallback(async () => {
    const aiMpns = (event?.aiAnalysis?.affectedParts || []).map((p: any) => p.mpn).filter(Boolean);
    const userMpns = (event?.userAddedMpns as string[]) || [];
    const allMpns = [...new Set([...aiMpns, ...userMpns])];
    if (!allMpns.length || partsLoading) return;
    // Skip if both mpnResult and partsInfo are already loaded
    if (mpnResult && partsInfo.length > 0) return;

    setPartsLoading(true);
    try {
      // Step 1: MPN → ITEM_NUMBER (reuse if already loaded) — includes AI + user-added MPNs
      let currentMpn = mpnResult;
      if (!currentMpn) {
        if (!allMpns.length) return;
        setPartsStep("Searching MPN in Denodo...");
        currentMpn = await searchMpn(allMpns);
        setMpnResult(currentMpn);
      }

      if (!currentMpn || currentMpn.total === 0) {
        setPartsStep("");
        return;
      }

      // Extract item numbers and build manufacture map
      const itemNumbers: string[] = [];
      const mfrMap: Record<string, { MPN: string; Manufacturer: string }> = {};
      for (const [mfr, recs] of Object.entries(currentMpn.by_manufacturer)) {
        for (const r of recs) {
          if (!itemNumbers.includes(r.ITEM_NUMBER)) itemNumbers.push(r.ITEM_NUMBER);
          mfrMap[r.ITEM_NUMBER] = { MPN: r.MFR_PART_NUMBER, Manufacturer: mfr };
        }
      }

      // Step 2: Parts Info (skip if already loaded)
      if (partsInfo.length === 0) {
        setPartsStep("Querying Parts Info...");
        const partsResult = await getPartsInfo(itemNumbers, mfrMap);
        setPartsInfo(partsResult.parts_info ?? []);
      }
      setPartsStep("");
    } catch (err) {
      console.error("Failed to load affected parts:", err);
      setPartsStep("");
    } finally {
      setPartsLoading(false);
    }
  }, [event, mpnResult, partsInfo.length, partsLoading]);

  // Resolve item numbers from MPN result (shared helper)
  const getItemNumbers = useCallback(async () => {
    const ai = event?.aiAnalysis;
    if (!ai?.affectedParts?.length) return [];

    let currentMpn = mpnResult;
    if (!currentMpn) {
      const mpns = ai.affectedParts.map((p: any) => p.mpn).filter(Boolean);
      const userMpns = (event?.userAddedMpns as string[]) || [];
      const allMpns = [...new Set([...mpns, ...userMpns])];
      if (!allMpns.length) return [];
      currentMpn = await searchMpn(allMpns);
      setMpnResult(currentMpn);
    }
    if (!currentMpn || currentMpn.total === 0) return [];

    const items: string[] = [];
    for (const recs of Object.values(currentMpn.by_manufacturer)) {
      for (const r of recs) {
        if (!items.includes(r.ITEM_NUMBER)) items.push(r.ITEM_NUMBER);
      }
    }
    return items;
  }, [event, mpnResult]);

  // Load where-used with SSE streaming progress + cache
  const loadWhereUsed = useCallback(async (refresh = false) => {
    if (whereUsedLoading) return;
    if (!refresh && whereUsedQueried) return;

    setWhereUsedLoading(true);
    setWhereUsedQueried(true);
    setWuProgress(null);
    setWuCacheStats(null);

    try {
      const itemNumbers = await getItemNumbers();
      if (!itemNumbers.length) {
        setWhereUsedLoading(false);
        return;
      }

      // Use SSE streaming for progress, then fetch full data from cache
      streamWhereUsedQuery(itemNumbers, {
        refresh,
        onProgress: (evt) => {
          setWuProgress({
            step: evt.step,
            current: evt.current,
            total: evt.total,
            cached: evt.cached,
            queried: evt.queried,
          });
        },
        onComplete: async (metadata) => {
          // SSE only sends metadata; fetch full dataset from the now-cached endpoint
          setWuProgress({ step: "loading", current: 1, total: 1 });
          try {
            const result = await getWhereUsedQuery(itemNumbers);
            setWhereUsed(result.where_used ?? []);
            setWuCacheStats(metadata.cache_stats ?? result.cache_stats ?? null);
          } catch (err) {
            console.error("Failed to fetch where-used data:", err);
          }
          setWuProgress(null);
          setWhereUsedLoading(false);
        },
        onError: (msg) => {
          console.error("Where-used stream error:", msg);
          setWuProgress(null);
          setWhereUsedLoading(false);
          setWhereUsedQueried(false);
        },
      });
    } catch (err) {
      console.error("Failed to load where-used:", err);
      setWhereUsedQueried(false);
      setWhereUsedLoading(false);
    }
  }, [event, mpnResult, whereUsedQueried, whereUsedLoading, getItemNumbers]);

  // Re-search specific MPNs from Denodo (force refresh)
  const handleRefreshMpns = useCallback(async (mpnsToRefresh: string[]) => {
    setRefreshingMpns(new Set(mpnsToRefresh));
    try {
      const freshResult: MpnResult = await refreshMpn(mpnsToRefresh);

      // Merge fresh results into existing mpnResult
      if (mpnResult) {
        const merged = { ...mpnResult };
        // Remove old entries for refreshed MPNs
        for (const [mfr, recs] of Object.entries(merged.by_manufacturer)) {
          merged.by_manufacturer[mfr] = recs.filter(
            (r) => !mpnsToRefresh.includes(r.search_mpn)
          );
          if (merged.by_manufacturer[mfr].length === 0) delete merged.by_manufacturer[mfr];
        }
        // Add fresh entries
        for (const [mfr, recs] of Object.entries(freshResult.by_manufacturer)) {
          if (!merged.by_manufacturer[mfr]) merged.by_manufacturer[mfr] = [];
          merged.by_manufacturer[mfr].push(...recs);
        }
        // Update cache stats
        const oldNotFound = mpnResult.cache_stats?.not_found?.filter(
          (m) => !mpnsToRefresh.includes(m)
        ) ?? [];
        merged.cache_stats = {
          from_cache: (mpnResult.cache_stats?.from_cache ?? 0),
          from_denodo: (mpnResult.cache_stats?.from_denodo ?? 0) + mpnsToRefresh.length,
          not_found: [...oldNotFound, ...(freshResult.cache_stats?.not_found ?? [])],
        };
        merged.total = Object.values(merged.by_manufacturer).flat().length;
        merged.errors = [
          ...(mpnResult.errors?.filter((e) => !mpnsToRefresh.includes(e.mpn)) ?? []),
          ...(freshResult.errors ?? []),
        ];
        setMpnResult(merged);
      } else {
        setMpnResult(freshResult);
      }

      // Refresh parts info if needed
      if (freshResult.total > 0) {
        const itemNumbers: string[] = [];
        const mfrMap: Record<string, { MPN: string; Manufacturer: string }> = {};
        for (const [mfr, recs] of Object.entries(freshResult.by_manufacturer)) {
          for (const r of recs) {
            if (!itemNumbers.includes(r.ITEM_NUMBER)) itemNumbers.push(r.ITEM_NUMBER);
            mfrMap[r.ITEM_NUMBER] = { MPN: r.MFR_PART_NUMBER, Manufacturer: mfr };
          }
        }
        const partsResult = await getPartsInfo(itemNumbers, mfrMap);
        if (partsResult.parts_info?.length) {
          setPartsInfo((prev) => {
            const existing = prev.filter((p) => !itemNumbers.includes(p["Part Number"]));
            return [...existing, ...partsResult.parts_info];
          });
        }
      }
    } catch (err) {
      console.error("Failed to refresh MPNs:", err);
    } finally {
      setRefreshingMpns(new Set());
    }
  }, [mpnResult]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-4">
        <p className="text-body text-[var(--text-muted)]">Event not found.</p>
        <Link to="/pcn">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to list
          </Button>
        </Link>
      </div>
    );
  }

  const ai = event.aiAnalysis;
  const affectedMpns = ai?.affectedParts?.map((p: any) => p.mpn).filter(Boolean) ?? [];
  const mpCount = whereUsed.filter((r) => r.Product_LifeCycle === "M/P").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            to="/pcn"
            className="inline-flex items-center gap-1 text-meta text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to events
          </Link>
          <h1 className="text-title text-[var(--text-primary)]">{event.pcnNumber}</h1>
          <p className="text-body text-[var(--text-secondary)]">{event.pcnTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          <Badge variant={riskVariant(ai?.riskLevel)}>
            {ai?.riskLevel ?? "Unanalyzed"}
          </Badge>
          <Badge variant="outline">{EVENT_STATUS_LABELS[event.status]}</Badge>
          {assessments.length > 0 && (
            <Badge variant={
              assessments[0].ceDecision === "ACCEPT" ? "low" :
              assessments[0].ceDecision === "REJECT" ? "high" :
              assessments[0].ceDecision === "LAST_TIME_BUY" ? "critical" : "medium"
            }>
              CE: {assessments[0].ceDecision}
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Info — editable when in edit mode */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-meta text-[var(--text-muted)]">Vendor</p>
              {editing ? (
                <Input value={editForm.vendorName} onChange={(e) => setEditForm({ ...editForm, vendorName: e.target.value })} className="h-7 text-body" />
              ) : (
                <p className="text-body font-medium text-[var(--text-primary)]">{event.vendorName}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-meta text-[var(--text-muted)]">Type</p>
              {editing ? (
                <select className="w-full h-7 rounded-input border border-[var(--border)] bg-[var(--surface-window)] px-2 text-body" value={editForm.pcnType} onChange={(e) => setEditForm({ ...editForm, pcnType: e.target.value })}>
                  <option value="PCN">PCN</option>
                  <option value="EOL">EOL</option>
                  <option value="PDN">PDN</option>
                  <option value="OTHER">OTHER</option>
                </select>
              ) : (
                <p className="text-body font-medium text-[var(--text-primary)]">{PCN_TYPE_LABELS[event.pcnType]}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-meta text-[var(--text-muted)]">Received</p>
              {editing ? (
                <input type="date" className="w-full h-7 rounded-input border border-[var(--border)] bg-[var(--surface-window)] px-2 text-body" value={editForm.receivedDate} onChange={(e) => setEditForm({ ...editForm, receivedDate: e.target.value })} />
              ) : (
                <p className="text-body font-medium text-[var(--text-primary)]">{formatDate(event.receivedDate)}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <User className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-meta text-[var(--text-muted)]">CE Owner</p>
              {editing ? (
                <Input value={editForm.ceOwnerName} onChange={(e) => setEditForm({ ...editForm, ceOwnerName: e.target.value })} className="h-7 text-body" placeholder="e.g., Albee.Chang" />
              ) : (
                <p className="text-body font-medium text-[var(--text-primary)]">{event.ceOwnerName ?? "\u2014"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {editing && (
        <div className="flex items-center gap-2">
          <Button onClick={saveEdit} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </Button>
          <Button variant="outline" size="sm" onClick={cancelEdit}><X className="h-3.5 w-3.5" /> Cancel</Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis" className="gap-1.5">
            <Brain className="h-4 w-4" /> AI Analysis
          </TabsTrigger>
          <TabsTrigger
            value="parts"
            className="gap-1.5"
            onClick={() => ai && loadAffectedParts()}
          >
            <Cpu className="h-4 w-4" /> Affected Parts
            {mpnResult && (
              <span className="ml-1 text-meta">({mpnResult.total})</span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="whereused"
            className="gap-1.5"
            onClick={() => ai && loadWhereUsed()}
          >
            <GitBranch className="h-4 w-4" /> Where-Used
            {whereUsed.length > 0 && (
              <span className="ml-1 text-meta">({whereUsed.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="rules"
            className="gap-1.5"
            onClick={() => ai && loadRules()}
          >
            <ShieldCheck className="h-4 w-4" /> Rules
          </TabsTrigger>
          <TabsTrigger
            value="assessment"
            className="gap-1.5"
            onClick={() => loadAssessments()}
          >
            <User className="h-4 w-4" /> CE Assessment ({assessments.length})
          </TabsTrigger>
          <TabsTrigger
            value="rdverification"
            className="gap-1.5"
            onClick={() => loadRdTasks()}
          >
            <ShieldCheck className="h-4 w-4" /> RD Verification
            {rdTasks.length > 0 && (
              <span className="ml-1 text-meta">({rdTasks.length})</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ---- AI Analysis Tab ---- */}
        <TabsContent value="analysis">
          {ai ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>AI Analysis Result</CardTitle>
                <Button variant="outline" size="sm" onClick={handleTranslate} disabled={translating}>
                  {translating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Translating...</> : <><Languages className="h-3.5 w-3.5" /> {translation ? "Re-translate" : "Translate 繁中"}</>}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-meta text-[var(--text-muted)] mb-1">Risk Level</p>
                    <Badge variant={riskVariant(ai.riskLevel)}>{ai.riskLevel}</Badge>
                  </div>
                  <div>
                    <p className="text-meta text-[var(--text-muted)] mb-1">
                      Form / Fit / Function
                    </p>
                    <div className="flex gap-2">
                      <Badge variant={ai.formChanged ? "high" : "low"}>
                        Form: {ai.formChanged ? "Changed" : "OK"}
                      </Badge>
                      <Badge variant={ai.fitChanged ? "high" : "low"}>
                        Fit: {ai.fitChanged ? "Changed" : "OK"}
                      </Badge>
                      <Badge variant={ai.functionChanged ? "high" : "low"}>
                        Func: {ai.functionChanged ? "Changed" : "OK"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-meta text-[var(--text-muted)] mb-1">Summary / 摘要</p>
                  <p className="text-body text-[var(--text-primary)]">{ai.summary}</p>
                  {translation?.summary && (
                    <p className="text-body text-blue-700 dark:text-blue-300 mt-1 pl-3 border-l-2 border-blue-300 dark:border-blue-700">{translation.summary}</p>
                  )}
                </div>
                <div>
                  <p className="text-meta text-[var(--text-muted)] mb-1">Change Description / 變更說明</p>
                  <p className="text-body text-[var(--text-primary)]">{ai.changeDescription}</p>
                  {translation?.changeDescription && (
                    <p className="text-body text-blue-700 dark:text-blue-300 mt-1 pl-3 border-l-2 border-blue-300 dark:border-blue-700">{translation.changeDescription}</p>
                  )}
                </div>
                {ai.riskReason && (
                  <div>
                    <p className="text-meta text-[var(--text-muted)] mb-1">Risk Reason / 風險原因</p>
                    <p className="text-body text-[var(--text-primary)]">{ai.riskReason}</p>
                    {translation?.riskReason && (
                      <p className="text-body text-blue-700 dark:text-blue-300 mt-1 pl-3 border-l-2 border-blue-300 dark:border-blue-700">{translation.riskReason}</p>
                    )}
                  </div>
                )}
                {ai.affectedParts && ai.affectedParts.length > 0 && (
                  <div>
                    <p className="text-meta text-[var(--text-muted)] mb-1">
                      Affected Parts ({ai.affectedParts.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ai.affectedParts.map((p: any, i: number) => (
                        <Badge key={i} variant="outline">
                          {p.mpn}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-4 text-meta text-[var(--text-muted)]">
                  <span>Model: {ai.aiModelVersion}</span>
                  <span>Confidence: {(ai.confidence * 100).toFixed(0)}%</span>
                  <span>Analyzed: {formatDateTime(ai.analyzedAt)}</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <Brain className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  No AI analysis yet for this event.
                </p>
                <Button onClick={handleAnalyze} disabled={analyzing}>
                  {analyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4" /> Run AI Analysis
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---- Affected Parts Tab (MPN → Advantech Part Number) ---- */}
        <TabsContent value="parts">
          {!ai && !(event.userAddedMpns as string[] | undefined)?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <Cpu className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  Run AI analysis first to extract affected MPNs, or add MPNs manually below.
                </p>
                {/* User-Added MPNs — always visible */}
                <Card className="border-blue-200 dark:border-blue-800 w-full mt-4">
                  <CardHeader>
                    <CardTitle className="text-subtitle flex items-center gap-2">
                      <Plus className="h-4 w-4 text-blue-500" /> Additional MPNs (User Added)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input placeholder="Enter MPN (e.g., NCP5901MNTBG)" value={newMpnInput} onChange={(e) => setNewMpnInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUserMpn()} className="flex-1" />
                      <Button size="sm" onClick={addUserMpn} disabled={!newMpnInput.trim()} className="text-white"><Plus className="h-3.5 w-3.5" /> Add</Button>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          ) : partsLoading ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                <p className="text-body text-[var(--text-muted)]">
                  {partsStep || "Loading affected parts..."}
                </p>
              </CardContent>
            </Card>
          ) : !mpnResult ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <Search className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  {affectedMpns.length} MPN(s) extracted from AI analysis.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {affectedMpns.map((mpn: string, i: number) => (
                    <Badge key={i} variant="outline">
                      {mpn}
                    </Badge>
                  ))}
                </div>
                <Button onClick={loadAffectedParts}>
                  <Search className="h-4 w-4" /> Search in Denodo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-primary-50 dark:bg-primary-900/30">
                      <Search className="h-5 w-5 text-primary-500" />
                    </div>
                    <div>
                      <p className="text-kpi font-semibold text-[var(--text-primary)]">
                        {affectedMpns.length}
                      </p>
                      <p className="text-meta text-[var(--text-muted)]">MPNs from PCN</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-green-50 dark:bg-green-900/30">
                      <Cpu className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-kpi font-semibold text-[var(--text-primary)]">
                        {mpnResult.total}
                      </p>
                      <p className="text-meta text-[var(--text-muted)]">
                        Advantech Parts Found
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-blue-50 dark:bg-blue-900/30">
                      <Database className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-kpi font-semibold text-[var(--text-primary)]">
                        {mpnResult.cache_stats?.from_cache ?? 0}
                      </p>
                      <p className="text-meta text-[var(--text-muted)]">From Cache</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-amber-50 dark:bg-amber-900/30">
                      <Cloud className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-kpi font-semibold text-[var(--text-primary)]">
                        {mpnResult.cache_stats?.from_denodo ?? 0}
                      </p>
                      <p className="text-meta text-[var(--text-muted)]">From Denodo</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Not-found MPNs with re-search option */}
              {(mpnResult.cache_stats?.not_found?.length ?? 0) > 0 && (
                <Card className="border-amber-300 dark:border-amber-800">
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <p className="text-body font-medium text-[var(--text-primary)]">
                          {mpnResult.cache_stats!.not_found.length} MPN(s) not found in Advantech system
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRefreshMpns(mpnResult.cache_stats!.not_found)}
                        disabled={refreshingMpns.size > 0}
                      >
                        {refreshingMpns.size > 0 ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...</>
                        ) : (
                          <><RefreshCw className="h-3.5 w-3.5" /> Re-search All from Denodo</>
                        )}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mpnResult.cache_stats!.not_found.map((mpn, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300">
                            {mpn}
                          </Badge>
                          <button
                            onClick={() => handleRefreshMpns([mpn])}
                            disabled={refreshingMpns.has(mpn)}
                            className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                            title={`Re-search ${mpn} from Denodo`}
                          >
                            {refreshingMpns.has(mpn) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* MPN Mapping Table */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-body">
                      MPN to Advantech Part Number Mapping
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefreshMpns(affectedMpns)}
                      disabled={refreshingMpns.size > 0}
                    >
                      {refreshingMpns.size > 0 ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing...</>
                      ) : (
                        <><RefreshCw className="h-3.5 w-3.5" /> Force Refresh All</>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Search MPN</TableHead>
                        <TableHead>Advantech Part Number</TableHead>
                        <TableHead>Manufacturer</TableHead>
                        <TableHead>Lifecycle</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(mpnResult.by_manufacturer).flatMap(
                        ([mfr, recs]) =>
                          recs.map((r, i) => (
                            <TableRow key={`${mfr}-${i}`}>
                              <TableCell className="font-medium whitespace-nowrap">
                                {r.search_mpn}
                              </TableCell>
                              <TableCell className="font-mono whitespace-nowrap">
                                {r.ITEM_NUMBER}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{mfr}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    r.MFR_PART_LIFECYCLE_PHASE === "Active"
                                      ? "low"
                                      : "medium"
                                  }
                                >
                                  {r.MFR_PART_LIFECYCLE_PHASE}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    r.PREDERRED_STATUS === "Preferred"
                                      ? "low"
                                      : "outline"
                                  }
                                >
                                  {r.PREDERRED_STATUS}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {r.source === "cache" ? (
                                  <Badge variant="outline" className="gap-1 text-blue-600 dark:text-blue-400 border-blue-300">
                                    <Database className="h-3 w-3" /> Cache
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400 border-amber-300">
                                    <Cloud className="h-3 w-3" /> Denodo
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                  {mpnResult.errors.length > 0 && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-panel">
                      <p className="text-meta font-medium text-red-600 dark:text-red-400 mb-1">
                        Query errors:
                      </p>
                      {mpnResult.errors.map((e, i) => (
                        <p key={i} className="text-meta text-red-500">
                          {e.mpn}: {e.error}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Parts Info Table */}
              {partsInfo.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-body">
                      Parts Detail Info
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={() => handleExportExcel(false)} disabled={exporting}>
                      {exporting ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
                      ) : (
                        <><Download className="h-3.5 w-3.5" /> Export Excel</>
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>MPN</TableHead>
                          <TableHead>Part Number</TableHead>
                          <TableHead>CE Owner</TableHead>
                          <TableHead>Part Cat</TableHead>
                          <TableHead>Lifecycle</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Material Category</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {partsInfo.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium whitespace-nowrap">{p.MPN}</TableCell>
                            <TableCell className="font-mono whitespace-nowrap">
                              {p["Part Number"]}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-primary-600 dark:text-primary-400 font-medium">
                              {p["CE Owner"] || "\u2014"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{p.Part_Cat}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  p.LifeCycle_Phase?.includes("Active") ||
                                  p.LifeCycle_Phase?.includes("Release")
                                    ? "low"
                                    : "medium"
                                }
                              >
                                {p.LifeCycle_Phase}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {p.Description}
                            </TableCell>
                            <TableCell className="text-meta whitespace-nowrap">
                              {p["Material Category"]}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* User-Added MPNs Section */}
              <Card className="border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="text-subtitle flex items-center gap-2">
                    <Plus className="h-4 w-4 text-blue-500" />
                    Additional MPNs (User Added)
                    {(event.userAddedMpns as string[] | undefined)?.length ? (
                      <Badge variant="outline" className="text-blue-600">{(event.userAddedMpns as string[]).length}</Badge>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Enter MPN (e.g., NCP5901MNTBG)"
                      value={newMpnInput}
                      onChange={(e) => setNewMpnInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addUserMpn()}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={addUserMpn} disabled={!newMpnInput.trim()}>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                  {(event.userAddedMpns as string[] | undefined)?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {(event.userAddedMpns as string[]).map((mpn) => (
                        <Badge key={mpn} variant="outline" className="gap-1 text-blue-600 dark:text-blue-400 border-blue-300 py-1 px-2">
                          {mpn}
                          <button onClick={() => removeUserMpn(mpn)} className="ml-1 text-red-400 hover:text-red-600">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-meta text-[var(--text-muted)]">
                      No additional MPNs added. Use this to supplement AI-extracted parts when the AI missed some affected MPNs.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ---- Where-Used Tab ---- */}
        <TabsContent value="whereused">
          {!ai ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <GitBranch className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  Run AI analysis first to extract affected MPNs.
                </p>
              </CardContent>
            </Card>
          ) : whereUsedLoading || partsLoading ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-6 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                {wuProgress ? (
                  <div className="w-full max-w-md space-y-3">
                    <p className="text-body text-[var(--text-primary)] text-center font-medium">
                      {wuProgress.step === "query"
                        ? `Querying item ${wuProgress.current} of ${wuProgress.total}${wuProgress.cached ? ` (${wuProgress.cached} from cache)` : ""}...`
                        : wuProgress.step === "enrich"
                          ? `Enriching product info (${wuProgress.current}/${wuProgress.total})...`
                          : wuProgress.step === "loading"
                            ? "Loading results..."
                            : "Preparing data..."}
                    </p>
                    {/* Progress bar */}
                    <div className="w-full bg-[var(--border)] rounded-full h-2.5">
                      <div
                        className="bg-primary-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((wuProgress.current / Math.max(wuProgress.total, 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-meta text-[var(--text-muted)] text-center">
                      {Math.round((wuProgress.current / Math.max(wuProgress.total, 1)) * 100)}%
                      {wuProgress.itemNumber && (
                        <span className="ml-2 font-mono">{wuProgress.itemNumber}</span>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-body text-[var(--text-muted)]">
                    Querying Where-Used BOM from Denodo...
                  </p>
                )}
              </CardContent>
            </Card>
          ) : !whereUsedQueried ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <GitBranch className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  Query where these parts are used in Advantech products.
                </p>
                <p className="text-meta text-[var(--text-muted)]">
                  Results are cached for 24 hours. Subsequent queries will be instant.
                </p>
                <Button onClick={() => loadWhereUsed()}>
                  <GitBranch className="h-4 w-4" /> Run Where-Used Query
                </Button>
              </CardContent>
            </Card>
          ) : whereUsed.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <GitBranch className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  No where-used records found for these parts.
                </p>
                <Button variant="outline" onClick={() => { setWhereUsedQueried(false); }}>
                  <GitBranch className="h-4 w-4" /> Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Cache indicator + Export + Refresh */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {wuCacheStats && (
                    <>
                      {wuCacheStats.from_cache > 0 && (
                        <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300 gap-1">
                          <Database className="h-3 w-3" />
                          Cached {wuCacheStats.cached_at ? new Date(wuCacheStats.cached_at).toLocaleString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </Badge>
                      )}
                      {wuCacheStats.from_denodo > 0 && (
                        <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 gap-1">
                          <Cloud className="h-3 w-3" />
                          {wuCacheStats.from_denodo} from Denodo
                        </Badge>
                      )}
                      {wuCacheStats.from_cache > 0 && wuCacheStats.from_denodo === 0 && (
                        <span className="text-meta text-[var(--text-muted)]">All items from 24h cache</span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setWhereUsedQueried(false); setWhereUsed([]); setWuCacheStats(null); setTimeout(() => loadWhereUsed(true), 0); }}
                    disabled={whereUsedLoading}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh from Denodo
                  </Button>
                  <Button variant="outline" onClick={() => handleExportExcel()} disabled={exporting}>
                    {exporting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
                    ) : (
                      <><Download className="h-4 w-4" /> Export Excel</>
                    )}
                  </Button>
                </div>
              </div>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-primary-50 dark:bg-primary-900/30">
                      <GitBranch className="h-5 w-5 text-primary-500" />
                    </div>
                    <div>
                      <p className="text-kpi font-semibold text-[var(--text-primary)]">
                        {whereUsed.length}
                      </p>
                      <p className="text-meta text-[var(--text-muted)]">
                        Where-Used Records
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-green-50 dark:bg-green-900/30">
                      <Package className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-kpi font-semibold text-[var(--text-primary)]">
                        {mpCount}
                      </p>
                      <p className="text-meta text-[var(--text-muted)]">
                        Active (M/P) Products
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-amber-50 dark:bg-amber-900/30">
                      <Package className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-kpi font-semibold text-[var(--text-primary)]">
                        {new Set(whereUsed.map((r) => r.Product_Line).filter(Boolean)).size}
                      </p>
                      <p className="text-meta text-[var(--text-muted)]">
                        Product Lines
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Where-Used Table */}
              <Card>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Lifecycle</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Plant</TableHead>
                        <TableHead>Owner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {whereUsed.slice(0, 100).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-meta">
                            {r.Component}
                          </TableCell>
                          <TableCell className="font-medium">
                            {r.Product_Name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.Product_Part_Cat}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.Product_LifeCycle === "M/P"
                                  ? "low"
                                  : r.Product_LifeCycle === "Phase Out"
                                    ? "medium"
                                    : "outline"
                              }
                            >
                              {r.Product_LifeCycle}
                            </Badge>
                          </TableCell>
                          <TableCell>{r["Model Name"] || "\u2014"}</TableCell>
                          <TableCell className="text-meta">
                            {r.Request_for_Plant || "\u2014"}
                          </TableCell>
                          <TableCell className="text-meta">
                            {r.Product_Owner || "\u2014"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {whereUsed.length > 100 && (
                    <p className="text-meta text-[var(--text-muted)] mt-3 text-center">
                      Showing 100 of {whereUsed.length} records
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ---- Rules Tab ---- */}
        <TabsContent value="rules">
          {!ai ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <ShieldCheck className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  Run AI analysis first to trigger the rule engine.
                </p>
              </CardContent>
            </Card>
          ) : rulesLoading ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                <p className="text-body text-[var(--text-muted)]">
                  Evaluating rules...
                </p>
              </CardContent>
            </Card>
          ) : !ruleEval ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <ShieldCheck className="h-10 w-10 text-[var(--text-muted)]" />
                <p className="text-body text-[var(--text-muted)]">
                  Click to evaluate business rules for this event.
                </p>
                <Button onClick={loadRules}>
                  <ShieldCheck className="h-4 w-4" /> Evaluate Rules
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Rule Results */}
              <div className="grid gap-3">
                {ruleEval.results.map((rule, i) => (
                  <Card
                    key={i}
                    className={
                      rule.triggered
                        ? rule.severity === "CRITICAL"
                          ? "border-red-300 dark:border-red-800"
                          : "border-amber-300 dark:border-amber-800"
                        : ""
                    }
                  >
                    <CardContent className="flex items-start gap-4">
                      <div className="mt-0.5">
                        {severityIcon(rule.severity, rule.triggered)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-body font-medium text-[var(--text-primary)]">
                            {ruleDisplayName[rule.ruleName] ?? rule.ruleName}
                          </p>
                          <Badge
                            variant={
                              rule.triggered
                                ? rule.severity === "CRITICAL"
                                  ? "critical"
                                  : "high"
                                : "low"
                            }
                          >
                            {rule.triggered ? rule.severity : "PASS"}
                          </Badge>
                        </div>
                        <p className="text-meta text-[var(--text-secondary)]">
                          {rule.message}
                        </p>
                        {rule.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {rule.actions.map((a, j) => (
                              <Badge key={j} variant="outline" className="text-meta">
                                {actionDisplayName[a] ?? a}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Actions Summary */}
              {ruleEval.executedActions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-body">Executed Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {ruleEval.executedActions.map((a, i) => (
                        <Badge key={i} variant="medium">
                          {actionDisplayName[a] ?? a}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ---- CE Assessment Tab ---- */}
        <TabsContent value="assessment">
          <div className="space-y-4">
            {/* Workflow guidance */}
            {ai && assessments.length === 0 && (
              <div className="flex items-start gap-3 rounded-panel border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
                <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-body font-medium text-blue-800 dark:text-blue-200">AI analysis complete — CE review required</p>
                  <p className="text-meta text-blue-600 dark:text-blue-400 mt-1">
                    Review the AI Analysis tab results (risk level, F/F/F changes, affected parts), then submit your assessment below.
                  </p>
                </div>
              </div>
            )}

            {/* Success feedback */}
            {assessmentSuccess && (
              <div className="flex items-start gap-3 rounded-panel border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-body font-medium text-green-800 dark:text-green-200">{assessmentSuccess}</p>
                </div>
              </div>
            )}

            {/* Submit Assessment Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-subtitle">Submit CE Assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">CE Assessor Name *</label>
                    <Input
                      placeholder="e.g., Albee.Chang"
                      value={assessmentForm.assessorName}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, assessorName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">Decision *</label>
                    <select
                      className="w-full h-9 rounded-input border border-[var(--border)] bg-[var(--surface-window)] px-3 text-body"
                      value={assessmentForm.ceDecision}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, ceDecision: e.target.value })}
                    >
                      <option value="ACCEPT">ACCEPT - No impact, approve as-is</option>
                      <option value="NEED_EVALUATION">NEED_EVALUATION - Requires RD verification</option>
                      <option value="REJECT">REJECT - Cannot accept change</option>
                      <option value="LAST_TIME_BUY">LAST_TIME_BUY - Trigger last-time buy</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">Override Risk Level (optional)</label>
                    <select
                      className="w-full h-9 rounded-input border border-[var(--border)] bg-[var(--surface-window)] px-3 text-body"
                      value={assessmentForm.overrideRiskLevel}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, overrideRiskLevel: e.target.value })}
                    >
                      <option value="">-- Keep AI assessment --</option>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <input
                      type="checkbox"
                      id="needRd"
                      checked={assessmentForm.needRdVerification}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, needRdVerification: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <label htmlFor="needRd" className="text-body text-[var(--text-secondary)]">Requires RD Verification</label>
                  </div>
                </div>
                <div>
                  <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">Comments</label>
                  <textarea
                    className="w-full rounded-input border border-[var(--border)] bg-[var(--surface-window)] px-3 py-2 text-body min-h-[80px]"
                    placeholder="Assessment notes, justification, follow-up actions..."
                    value={assessmentForm.comments}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, comments: e.target.value })}
                  />
                </div>
                <Button
                  onClick={handleSubmitAssessment}
                  disabled={!assessmentForm.assessorName || assessmentSubmitting}
                >
                  {assessmentSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4" /> Submit Assessment</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Assessment History */}
            {assessments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-subtitle">Assessment History ({assessments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Assessor</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead>Override Risk</TableHead>
                        <TableHead>RD Required</TableHead>
                        <TableHead>Comments</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assessments.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-meta">{formatDateTime(a.assessedAt)}</TableCell>
                          <TableCell className="font-medium">{a.assessorName}</TableCell>
                          <TableCell>
                            <Badge variant={
                              a.ceDecision === "ACCEPT" ? "low" :
                              a.ceDecision === "REJECT" ? "high" :
                              a.ceDecision === "LAST_TIME_BUY" ? "critical" : "medium"
                            }>
                              {a.ceDecision}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {a.overrideRiskLevel ? (
                              <Badge variant={
                                a.overrideRiskLevel === "LOW" ? "low" :
                                a.overrideRiskLevel === "MEDIUM" ? "medium" :
                                a.overrideRiskLevel === "HIGH" ? "high" : "critical"
                              }>
                                {a.overrideRiskLevel}
                              </Badge>
                            ) : <span className="text-[var(--text-muted)]">--</span>}
                          </TableCell>
                          <TableCell>{a.needRdVerification ? <Badge variant="medium">Yes</Badge> : "No"}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{a.comments || "--"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ---- RD Verification Tab ---- */}
        <TabsContent value="rdverification">
          <div className="space-y-4">
            {/* Existing tasks */}
            {rdTasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-subtitle">Verification Tasks ({rdTasks.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned RD</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Assigned By</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rdTasks.map((task: any) => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <Badge variant={
                              task.taskStatus === "COMPLETED" ? "low" :
                              task.taskStatus === "CANCELLED" ? "outline" :
                              task.taskStatus === "IN_PROGRESS" ? "medium" : "high"
                            }>
                              {task.taskStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{task.assignedRdName}</TableCell>
                          <TableCell>
                            <Badge variant={task.priority === "URGENT" ? "critical" : task.priority === "HIGH" ? "high" : "outline"}>
                              {task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>{task.assignedBy}</TableCell>
                          <TableCell>
                            {task.rdDecision ? (
                              <Badge variant={task.rdDecision === "PASS" ? "low" : task.rdDecision === "FAIL" ? "high" : "medium"}>
                                {task.rdDecision}
                              </Badge>
                            ) : <span className="text-[var(--text-muted)]">--</span>}
                          </TableCell>
                          <TableCell className="text-meta">{formatDateTime(task.createdAt)}</TableCell>
                          <TableCell>
                            {task.taskStatus === "PENDING" && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => handleRdRespond(task.id, "PASS")}>
                                  <CheckCircle2 className="h-3 w-3" /> Pass
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleRdRespond(task.id, "FAIL")}>
                                  <XCircle className="h-3 w-3" /> Fail
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleRdRespond(task.id, "CONDITIONAL")}>
                                  Conditional
                                </Button>
                              </div>
                            )}
                            {task.taskStatus === "COMPLETED" && task.rdComments && (
                              <span className="text-meta">{task.rdComments}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Assign RD form — show when CE flagged needRdVerification */}
            <Card>
              <CardHeader>
                <CardTitle className="text-subtitle">Assign RD Verification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Auto-suggestions */}
                {assessments.length > 0 && rdSuggestions.length === 0 && (
                  <Button variant="outline" size="sm" onClick={() => loadRdSuggestions(assessments[0].id)}>
                    <Search className="h-3.5 w-3.5" /> Auto-Suggest RD from Product Owners
                  </Button>
                )}
                {rdSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-meta font-medium text-[var(--text-secondary)]">Suggested RD Engineers (by affected product count)</p>
                    <div className="flex flex-wrap gap-2">
                      {rdSuggestions.slice(0, 5).map((s: any, i: number) => (
                        <Button
                          key={i}
                          variant={rdForm.assignedRdEmail === s.rdEmail ? "default" : "outline"}
                          size="sm"
                          onClick={() => setRdForm({ ...rdForm, assignedRdName: s.rdName, assignedRdEmail: s.rdEmail })}
                        >
                          {s.rdName.split("(")[0].trim()} ({s.productCount} products)
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">RD Engineer Name *</label>
                    <Input
                      placeholder="e.g., Yusuke.Yorikane"
                      value={rdForm.assignedRdName}
                      onChange={(e) => setRdForm({ ...rdForm, assignedRdName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">RD Email *</label>
                    <Input
                      placeholder="e.g., yusuke.yorikane@advantech.co.jp"
                      value={rdForm.assignedRdEmail}
                      onChange={(e) => setRdForm({ ...rdForm, assignedRdEmail: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">Assigned By (Your Name) *</label>
                    <Input
                      placeholder="e.g., Albee.Chang"
                      value={rdForm.assignedBy}
                      onChange={(e) => setRdForm({ ...rdForm, assignedBy: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-meta font-medium text-[var(--text-secondary)] mb-1 block">Priority</label>
                    <select
                      className="w-full h-9 rounded-input border border-[var(--border)] bg-[var(--surface-window)] px-3 text-body"
                      value={rdForm.priority}
                      onChange={(e) => setRdForm({ ...rdForm, priority: e.target.value })}
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                </div>
                <Button
                  onClick={handleAssignRd}
                  disabled={!rdForm.assignedRdName || !rdForm.assignedRdEmail || !rdForm.assignedBy || rdAssigning || assessments.length === 0}
                >
                  {rdAssigning ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Assigning...</>
                  ) : (
                    <><ShieldCheck className="h-4 w-4" /> Assign &amp; Notify via Teams</>
                  )}
                </Button>
                {assessments.length === 0 && (
                  <p className="text-meta text-amber-600">Submit a CE Assessment first before assigning RD verification.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
