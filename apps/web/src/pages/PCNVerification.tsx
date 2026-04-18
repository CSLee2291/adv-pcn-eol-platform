import { useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck, Plus, Trash2, Play, RefreshCw, Loader2,
  CheckCircle2, XCircle, AlertCircle, Clock, Mail, TrendingUp,
  Search, ChevronDown,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  generateVerificationBatch, fetchVerificationBatches, fetchVerificationBatch,
  addPcnToBatch, removeVerificationRecord, markVerificationEmailReady,
  runVerificationRecord, runAllReadyInBatch, rerunVerificationBatch,
  fetchVerificationHistory, fetchExcelPcns,
} from "@/services/api";

interface Batch {
  id: string; batchNumber: string; runNumber: number; totalCount: number;
  passCount: number; failCount: number; pendingCount: number; accuracy: number | null;
  status: string; createdAt: string; completedAt: string | null;
  records?: Record_[];
}
interface Record_ {
  id: string; pcnNumber: string; batchId: string;
  excelVendor: string; excelAgent: string | null; excelTitle: string | null;
  excelCeOwner: string | null; excelCategory: string | null;
  excelCeComment: string | null; excelNotifyPm: string | null; excelFollowUp: string | null;
  excelFolder: string | null; excelMpnCount: number; excelItemCount: number;
  excelMpns: string[] | null; excelItems: string[] | null;
  appVendor: string | null; appPcnNumber: string | null; appRiskLevel: string | null;
  appFormChanged: boolean | null; appFitChanged: boolean | null; appFuncChanged: boolean | null;
  appMpnCount: number | null; appMpns: string[] | null;
  mpnMatchCount: number | null; mpnOnlyInExcel: string[] | null; mpnOnlyInApp: string[] | null;
  vendorMatch: boolean | null;
  status: string; emailFileName: string | null; notes: string | null;
}
interface ExcelPcn {
  pcnNumber: string; vendor: string; agent: string; title: string;
  ceOwner: string; mpnCount: number; itemCount: number; folder: string;
}

const statusBadge = (s: string) => {
  switch (s) {
    case "PASS": return <Badge variant="low"><CheckCircle2 className="h-3 w-3" /> PASS</Badge>;
    case "FAIL": return <Badge variant="high"><XCircle className="h-3 w-3" /> FAIL</Badge>;
    case "ERROR": return <Badge variant="critical"><AlertCircle className="h-3 w-3" /> ERROR</Badge>;
    case "EMAIL_READY": return <Badge variant="outline" className="text-blue-600 border-blue-300"><Mail className="h-3 w-3" /> Ready</Badge>;
    case "ANALYZING": return <Badge variant="medium"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge>;
    default: return <Badge variant="outline"><Clock className="h-3 w-3" /> Pending</Badge>;
  }
};

export function PCNVerification() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [currentBatch, setCurrentBatch] = useState<Batch | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [selectedRecord, setSelectedRecord] = useState<Record_ | null>(null);
  const [error, setError] = useState("");

  // Add PCN modal state
  const [showAddPcn, setShowAddPcn] = useState(false);
  const [excelPcns, setExcelPcns] = useState<ExcelPcn[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [loadingPcns, setLoadingPcns] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      const data = await fetchVerificationBatches();
      setBatches(data);
      // Always load latest batch on mount
      if (data.length > 0) {
        const latest = await fetchVerificationBatch(data[0].id);
        setCurrentBatch(latest);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [currentBatch]);

  const loadCurrentBatch = useCallback(async (batchId: string) => {
    const data = await fetchVerificationBatch(batchId);
    setCurrentBatch(data);
    setSelectedRecord(null);
  }, []);

  useEffect(() => { loadBatches(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const result = await generateVerificationBatch(20);
      setCurrentBatch({ ...result.batch, records: result.records });
      await loadBatches();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!currentBatch) return;
    await removeVerificationRecord(recordId);
    await loadCurrentBatch(currentBatch.id);
  };

  const handleRunSingle = async (recordId: string) => {
    setRunningIds((prev) => new Set(prev).add(recordId));
    try {
      await runVerificationRecord(recordId);
      if (currentBatch) await loadCurrentBatch(currentBatch.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunningIds((prev) => { const n = new Set(prev); n.delete(recordId); return n; });
    }
  };

  const handleRunAll = async () => {
    if (!currentBatch) return;
    setRunningAll(true);
    setError("");
    try {
      await runAllReadyInBatch(currentBatch.id);
      await loadCurrentBatch(currentBatch.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunningAll(false);
    }
  };

  const handleRerun = async () => {
    if (!currentBatch) return;
    setLoading(true);
    try {
      const newBatch = await rerunVerificationBatch(currentBatch.id);
      setCurrentBatch(newBatch);
      await loadBatches();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPcn = async (pcnNumber: string) => {
    if (!currentBatch) return;
    try {
      await addPcnToBatch(currentBatch.id, pcnNumber);
      await loadCurrentBatch(currentBatch.id);
      setShowAddPcn(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMarkReady = async (recordId: string) => {
    const fileName = prompt("Enter the .msg filename (in test-fixtures/vendor-emails/):");
    if (!fileName) return;
    await markVerificationEmailReady(recordId, fileName);
    if (currentBatch) await loadCurrentBatch(currentBatch.id);
  };

  const openAddPcnModal = async () => {
    setShowAddPcn(true);
    if (excelPcns.length === 0) {
      setLoadingPcns(true);
      try {
        const data = await fetchExcelPcns();
        setExcelPcns(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoadingPcns(false);
      }
    }
  };

  const records = currentBatch?.records || [];
  const readyCount = records.filter((r) => r.status === "EMAIL_READY").length;
  const compared = (currentBatch?.passCount || 0) + (currentBatch?.failCount || 0);

  const filteredPcns = addSearch
    ? excelPcns.filter((p) =>
        p.pcnNumber.toLowerCase().includes(addSearch.toLowerCase()) ||
        p.vendor.toLowerCase().includes(addSearch.toLowerCase())
      ).slice(0, 30)
    : excelPcns.slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title text-[var(--text-primary)]">PCN Verification</h1>
        <div className="flex gap-2">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><ClipboardCheck className="h-4 w-4" /> Generate 20 Random</>}
          </Button>
          {currentBatch && (
            <>
              <Button variant="outline" onClick={openAddPcnModal}><Plus className="h-4 w-4" /> Add PCN</Button>
              <Button variant="outline" onClick={handleRerun} disabled={loading}><RefreshCw className="h-4 w-4" /> Re-run Batch</Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-panel border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-body text-red-600 dark:text-red-400 flex-1">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setError("")}>&times;</Button>
        </div>
      )}

      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /> Current Batch</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><Clock className="h-4 w-4" /> Batch History ({batches.length})</TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5"><TrendingUp className="h-4 w-4" /> Accuracy Trend</TabsTrigger>
        </TabsList>

        {/* ---- Current Batch Tab ---- */}
        <TabsContent value="current">
          {!currentBatch ? (
            <Card><CardContent className="py-12 text-center">
              <ClipboardCheck className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-body text-[var(--text-muted)]">No batch yet. Click "Generate 20 Random" to start.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {/* Summary strip */}
              <div className="grid grid-cols-5 gap-3">
                <Card><CardContent className="py-3 text-center">
                  <p className="text-kpi font-bold">{currentBatch.batchNumber}</p>
                  <p className="text-meta text-[var(--text-muted)]">Run #{currentBatch.runNumber}</p>
                </CardContent></Card>
                <Card><CardContent className="py-3 text-center">
                  <p className="text-kpi font-bold">{records.length}</p>
                  <p className="text-meta text-[var(--text-muted)]">Total PCNs</p>
                </CardContent></Card>
                <Card><CardContent className="py-3 text-center">
                  <p className="text-kpi font-bold text-green-600">{currentBatch.passCount}</p>
                  <p className="text-meta text-[var(--text-muted)]">Pass</p>
                </CardContent></Card>
                <Card><CardContent className="py-3 text-center">
                  <p className="text-kpi font-bold text-red-600">{currentBatch.failCount}</p>
                  <p className="text-meta text-[var(--text-muted)]">Fail</p>
                </CardContent></Card>
                <Card><CardContent className="py-3 text-center">
                  <p className="text-kpi font-bold">{currentBatch.accuracy != null ? `${currentBatch.accuracy}%` : "—"}</p>
                  <p className="text-meta text-[var(--text-muted)]">Accuracy ({compared} compared)</p>
                </CardContent></Card>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-2">
                <Button onClick={handleRunAll} disabled={runningAll || readyCount === 0}>
                  {runningAll ? <><Loader2 className="h-4 w-4 animate-spin" /> Running...</> : <><Play className="h-4 w-4" /> Run All Ready ({readyCount})</>}
                </Button>
                <span className="text-meta text-[var(--text-muted)]">
                  {records.filter((r) => r.status === "PENDING").length} pending email
                </span>
              </div>

              {/* Records table */}
              <Card>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>PCN No.</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>MPNs</TableHead>
                          <TableHead>Folder</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((r) => (
                          <TableRow
                            key={r.id}
                            className={`cursor-pointer ${selectedRecord?.id === r.id ? "bg-primary-50 dark:bg-primary-900/20" : ""}`}
                            onClick={() => setSelectedRecord(selectedRecord?.id === r.id ? null : r)}
                          >
                            <TableCell>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="text-red-400 hover:text-red-600" title="Remove">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TableCell>
                            <TableCell className="font-mono font-medium">{r.pcnNumber}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{r.excelVendor}</TableCell>
                            <TableCell>{r.excelMpnCount}</TableCell>
                            <TableCell className="max-w-[180px] truncate text-meta">{r.excelFolder || "—"}</TableCell>
                            <TableCell className="text-meta">{r.emailFileName ? <span className="text-green-600">{r.emailFileName.substring(0, 25)}...</span> : "—"}</TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                {r.status === "PENDING" && (
                                  <Button variant="outline" size="sm" onClick={() => handleMarkReady(r.id)}>
                                    <Mail className="h-3 w-3" />
                                  </Button>
                                )}
                                {(r.status === "EMAIL_READY" || r.status === "ERROR") && (
                                  <Button variant="outline" size="sm" onClick={() => handleRunSingle(r.id)} disabled={runningIds.has(r.id)}>
                                    {runningIds.has(r.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Detail panel */}
              {selectedRecord && (selectedRecord.status === "PASS" || selectedRecord.status === "FAIL") && (
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle className="text-subtitle">Excel Reference</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-body">
                      <p><span className="text-[var(--text-muted)]">Vendor:</span> {selectedRecord.excelVendor}</p>
                      <p><span className="text-[var(--text-muted)]">Agent:</span> {selectedRecord.excelAgent || "—"}</p>
                      <p><span className="text-[var(--text-muted)]">MPNs:</span> {selectedRecord.excelMpnCount}</p>
                      <p><span className="text-[var(--text-muted)]">Items:</span> {selectedRecord.excelItemCount}</p>
                      <p><span className="text-[var(--text-muted)]">CE Owner:</span> {selectedRecord.excelCeOwner || "—"}</p>
                      <p><span className="text-[var(--text-muted)]">Category:</span> {selectedRecord.excelCategory || "—"}</p>
                      <p><span className="text-[var(--text-muted)]">CE Comment:</span> {selectedRecord.excelCeComment || "—"}</p>
                      <p><span className="text-[var(--text-muted)]">Notify PM:</span> {selectedRecord.excelNotifyPm || "—"}</p>
                      <p><span className="text-[var(--text-muted)]">Follow-up:</span> {selectedRecord.excelFollowUp || "—"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-subtitle">App Result</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-body">
                      <p><span className="text-[var(--text-muted)]">Vendor:</span> {selectedRecord.appVendor} {selectedRecord.vendorMatch ? <CheckCircle2 className="inline h-4 w-4 text-green-500" /> : <XCircle className="inline h-4 w-4 text-red-500" />}</p>
                      <p><span className="text-[var(--text-muted)]">PCN#:</span> {selectedRecord.appPcnNumber}</p>
                      <p><span className="text-[var(--text-muted)]">Risk:</span> <Badge variant={selectedRecord.appRiskLevel === "LOW" ? "low" : selectedRecord.appRiskLevel === "MEDIUM" ? "medium" : selectedRecord.appRiskLevel === "HIGH" ? "high" : "critical"}>{selectedRecord.appRiskLevel}</Badge></p>
                      <p><span className="text-[var(--text-muted)]">F/F/F:</span> {selectedRecord.appFormChanged ? "Changed" : "OK"} / {selectedRecord.appFitChanged ? "Changed" : "OK"} / {selectedRecord.appFuncChanged ? "Changed" : "OK"}</p>
                      <p><span className="text-[var(--text-muted)]">MPNs:</span> {selectedRecord.appMpnCount}</p>
                      <div className="mt-3 pt-3 border-t border-[var(--border)]">
                        <p className="font-medium mb-1">MPN Comparison</p>
                        <p className="text-green-600">Matched: {selectedRecord.mpnMatchCount}</p>
                        {(selectedRecord.mpnOnlyInExcel?.length ?? 0) > 0 && (
                          <p className="text-red-600">Only in Excel ({selectedRecord.mpnOnlyInExcel!.length}): {selectedRecord.mpnOnlyInExcel!.join(", ")}</p>
                        )}
                        {(selectedRecord.mpnOnlyInApp?.length ?? 0) > 0 && (
                          <p className="text-amber-600">Only in App ({selectedRecord.mpnOnlyInApp!.length}): {selectedRecord.mpnOnlyInApp!.slice(0, 10).join(", ")}{selectedRecord.mpnOnlyInApp!.length > 10 ? "..." : ""}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Notes / Findings (for FAIL, ERROR, and PENDING records with notes) */}
              {selectedRecord?.notes && (
                <Card className={
                  selectedRecord.status === "ERROR" ? "border-red-300 dark:border-red-800" :
                  selectedRecord.status === "FAIL" ? "border-amber-300 dark:border-amber-800" :
                  "border-blue-300 dark:border-blue-800"
                }>
                  <CardHeader>
                    <CardTitle className="text-subtitle flex items-center gap-2">
                      <AlertCircle className={`h-4 w-4 ${
                        selectedRecord.status === "ERROR" ? "text-red-500" :
                        selectedRecord.status === "FAIL" ? "text-amber-500" : "text-blue-500"
                      }`} />
                      {selectedRecord.status === "ERROR" ? "Error Details" :
                       selectedRecord.status === "FAIL" ? "Root Cause Analysis" : "Notes"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-body whitespace-pre-wrap ${
                      selectedRecord.status === "ERROR" ? "text-red-600 dark:text-red-400" :
                      selectedRecord.status === "FAIL" ? "text-amber-700 dark:text-amber-300" :
                      "text-blue-700 dark:text-blue-300"
                    }`}>
                      {selectedRecord.notes}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Summary of all FAIL/ERROR findings at the bottom */}
              {records.some(r => (r.status === "FAIL" || r.status === "ERROR") && r.notes) && (
                <Card className="border-amber-300 dark:border-amber-800">
                  <CardHeader>
                    <CardTitle className="text-subtitle flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      Failure Analysis Report ({records.filter(r => r.status === "FAIL" || r.status === "ERROR").length} issues)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {records.filter(r => (r.status === "FAIL" || r.status === "ERROR") && r.notes).map((r) => (
                      <div key={r.id} className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2 mb-1">
                          {r.status === "FAIL" ? (
                            <Badge variant="high"><XCircle className="h-3 w-3" /> FAIL</Badge>
                          ) : (
                            <Badge variant="critical"><AlertCircle className="h-3 w-3" /> ERROR</Badge>
                          )}
                          <span className="font-mono font-medium">{r.pcnNumber}</span>
                          <span className="text-meta text-[var(--text-muted)]">
                            Excel: {r.excelMpnCount} MPNs | App: {r.appMpnCount ?? 0} MPNs | Match: {r.mpnMatchCount ?? 0}
                          </span>
                        </div>
                        <p className="text-body text-amber-700 dark:text-amber-300 ml-6">{r.notes}</p>
                        {(r.mpnOnlyInExcel as string[] | null)?.length ? (
                          <p className="text-meta text-red-600 dark:text-red-400 ml-6 mt-1">
                            Missing MPNs: {(r.mpnOnlyInExcel as string[]).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ---- Batch History Tab ---- */}
        <TabsContent value="history">
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Run #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Pass</TableHead>
                    <TableHead>Fail</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono">{b.batchNumber}</TableCell>
                      <TableCell>{b.runNumber}</TableCell>
                      <TableCell className="text-meta">{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{b.totalCount}</TableCell>
                      <TableCell className="text-green-600">{b.passCount}</TableCell>
                      <TableCell className="text-red-600">{b.failCount}</TableCell>
                      <TableCell className="font-bold">{b.accuracy != null ? `${b.accuracy}%` : "—"}</TableCell>
                      <TableCell><Badge variant={b.status === "COMPLETED" ? "low" : "outline"}>{b.status}</Badge></TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => loadCurrentBatch(b.id)}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {batches.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-[var(--text-muted)] py-8">No batches yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Accuracy Trend Tab ---- */}
        <TabsContent value="trend">
          <Card>
            <CardHeader><CardTitle className="text-subtitle">Accuracy Trend Across Runs</CardTitle></CardHeader>
            <CardContent>
              {batches.filter((b) => b.accuracy != null).length === 0 ? (
                <p className="text-center text-[var(--text-muted)] py-8">No completed runs yet. Run verifications to see the trend.</p>
              ) : (
                <div className="space-y-3">
                  {batches.filter((b) => b.accuracy != null).reverse().map((b, i) => (
                    <div key={b.id} className="flex items-center gap-3">
                      <span className="text-meta w-20">Run #{b.runNumber}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-bold text-white ${b.accuracy! >= 90 ? "bg-green-500" : b.accuracy! >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${b.accuracy}%` }}
                        >
                          {b.accuracy}%
                        </div>
                      </div>
                      <span className="text-meta w-24">{b.passCount}/{b.passCount + b.failCount} pass</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add PCN Modal */}
      {showAddPcn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowAddPcn(false)}>
          <div className="bg-[var(--surface-window)] rounded-window shadow-lg w-[600px] max-h-[500px] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)] flex items-center gap-3">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <Input
                placeholder="Search PCN# or vendor..."
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                autoFocus
              />
              <Button variant="outline" size="sm" onClick={() => setShowAddPcn(false)}>&times;</Button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {loadingPcns ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                filteredPcns.map((p) => (
                  <button
                    key={p.pcnNumber}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-panel flex items-center justify-between"
                    onClick={() => handleAddPcn(p.pcnNumber)}
                  >
                    <div>
                      <span className="font-mono font-medium">{p.pcnNumber}</span>
                      <span className="text-meta text-[var(--text-muted)] ml-2">{p.vendor.substring(0, 30)}</span>
                    </div>
                    <span className="text-meta">{p.mpnCount} MPNs</span>
                  </button>
                ))
              )}
              {!loadingPcns && filteredPcns.length === 0 && (
                <p className="text-center text-[var(--text-muted)] py-4">No matching PCN#</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
