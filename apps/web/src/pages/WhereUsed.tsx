import { useState } from "react";
import {
  GitBranch,
  Search,
  Download,
  Loader2,
  Package,
  Cpu,
  AlertCircle,
  Database,
  Cloud,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { searchMpn, refreshMpn, getPartsInfo, getWhereUsedQuery, exportWhereUsedExcel } from "@/services/api";

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

export function WhereUsed() {
  const [mpnInput, setMpnInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [mpnResult, setMpnResult] = useState<MpnResult | null>(null);
  const [partsInfo, setPartsInfo] = useState<PartsInfoRecord[]>([]);
  const [whereUsed, setWhereUsed] = useState<WhereUsedRecord[]>([]);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!partsInfo.length && !whereUsed.length) return;
    setExporting(true);
    try {
      const response = await exportWhereUsedExcel(partsInfo, whereUsed);
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PCN_Analysis_${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleSearch = async () => {
    const mpns = mpnInput.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!mpns.length) return;

    setLoading(true);
    setError("");
    setSearched(true);
    setMpnResult(null);
    setPartsInfo([]);
    setWhereUsed([]);

    try {
      // Step 1: MPN → ITEM_NUMBER
      setStep("Searching MPN in Denodo...");
      const mpnData: MpnResult = await searchMpn(mpns);
      setMpnResult(mpnData);

      if (mpnData.total === 0) {
        setStep("");
        setLoading(false);
        return;
      }

      // Extract item numbers and build manufacture map
      const itemNumbers: string[] = [];
      const mfrMap: Record<string, { MPN: string; Manufacturer: string }> = {};
      for (const [mfr, recs] of Object.entries(mpnData.by_manufacturer)) {
        for (const r of recs) {
          if (!itemNumbers.includes(r.ITEM_NUMBER)) itemNumbers.push(r.ITEM_NUMBER);
          mfrMap[r.ITEM_NUMBER] = { MPN: r.MFR_PART_NUMBER, Manufacturer: mfr };
        }
      }

      // Step 2 & 3: Parts Info + Where-Used in parallel
      setStep("Querying Parts Info & Where-Used...");
      const [partsResult, whereUsedResult] = await Promise.all([
        getPartsInfo(itemNumbers, mfrMap),
        getWhereUsedQuery(itemNumbers),
      ]);

      setPartsInfo(partsResult.parts_info ?? []);
      setWhereUsed(whereUsedResult.where_used ?? []);
      setStep("");
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.message ?? "Query failed");
      setStep("");
    } finally {
      setLoading(false);
    }
  };

  const mpCount = whereUsed.filter((r) => r.Product_LifeCycle === "M/P").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title text-[var(--text-primary)]">Where-Used Analysis</h1>
        {searched && !loading && (partsInfo.length > 0 || whereUsed.length > 0) && (
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
            ) : (
              <><Download className="h-4 w-4" /> Export Excel</>
            )}
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Cpu className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                placeholder="Enter MPN(s) separated by comma (e.g., AMC1100DWVR, ISO1412DWR)"
                value={mpnInput}
                onChange={(e) => setMpnInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading || !mpnInput.trim()}>
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {step || "Searching..."}</>
              ) : (
                <><Search className="h-4 w-4" /> Search</>
              )}
            </Button>
          </div>
          <p className="text-meta text-[var(--text-muted)] mt-2">
            Query Denodo APIs: MPN → ITEM_NUMBER → Parts Info + Where-Used BOM
          </p>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-body text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* MPN Results Summary */}
      {mpnResult && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-primary-50 dark:bg-primary-900/30">
                <Cpu className="h-5 w-5 text-primary-500" />
              </div>
              <div>
                <p className="text-kpi font-semibold text-[var(--text-primary)]">{mpnResult.total}</p>
                <p className="text-meta text-[var(--text-muted)]">Item Numbers Found</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-green-50 dark:bg-green-900/30">
                <Package className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-kpi font-semibold text-[var(--text-primary)]">{whereUsed.length}</p>
                <p className="text-meta text-[var(--text-muted)]">Where-Used Records</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-amber-50 dark:bg-amber-900/30">
                <GitBranch className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-kpi font-semibold text-[var(--text-primary)]">{mpCount}</p>
                <p className="text-meta text-[var(--text-muted)]">Active (M/P) Products</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Tabs */}
      {searched && !loading && mpnResult && (
        <Tabs defaultValue="whereused">
          <TabsList>
            <TabsTrigger value="whereused" className="gap-1.5">
              <GitBranch className="h-4 w-4" /> Where-Used ({whereUsed.length})
            </TabsTrigger>
            <TabsTrigger value="parts" className="gap-1.5">
              <Cpu className="h-4 w-4" /> Parts Info ({partsInfo.length})
            </TabsTrigger>
            <TabsTrigger value="mpn" className="gap-1.5">
              <Search className="h-4 w-4" /> MPN Mapping ({mpnResult.total})
            </TabsTrigger>
          </TabsList>

          {/* Where-Used Tab */}
          <TabsContent value="whereused">
            <Card>
              <CardContent>
                {whereUsed.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <GitBranch className="h-10 w-10 text-[var(--text-muted)]" />
                    <p className="text-body text-[var(--text-muted)]">No where-used records found.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                          <TableCell className="font-medium">{r.Product_Name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.Product_Part_Cat}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.Product_LifeCycle === "M/P" ? "low" : r.Product_LifeCycle === "Phase Out" ? "medium" : "outline"}>
                              {r.Product_LifeCycle}
                            </Badge>
                          </TableCell>
                          <TableCell>{r["Model Name"] || "—"}</TableCell>
                          <TableCell className="text-meta">{r.Request_for_Plant || "—"}</TableCell>
                          <TableCell className="text-meta">{r.Product_Owner || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {whereUsed.length > 100 && (
                  <p className="text-meta text-[var(--text-muted)] mt-3 text-center">
                    Showing 100 of {whereUsed.length} records
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Parts Info Tab */}
          <TabsContent value="parts">
            <Card>
              <CardContent>
                {partsInfo.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <Cpu className="h-10 w-10 text-[var(--text-muted)]" />
                    <p className="text-body text-[var(--text-muted)]">No parts info found.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MPN</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Part Cat</TableHead>
                        <TableHead>Lifecycle</TableHead>
                        <TableHead>Material Category</TableHead>
                        <TableHead>CE Owner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partsInfo.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.MPN}</TableCell>
                          <TableCell>{p["Part Number"]}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{p.Description}</TableCell>
                          <TableCell><Badge variant="outline">{p.Part_Cat}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={p.LifeCycle_Phase?.includes("Active") || p.LifeCycle_Phase?.includes("Release") ? "low" : "medium"}>
                              {p.LifeCycle_Phase}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-meta">{p["Material Category"]}</TableCell>
                          <TableCell className="text-meta">{p["CE Owner"]}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MPN Mapping Tab */}
          <TabsContent value="mpn">
            <Card>
              <CardContent className="space-y-4">
                {/* Cache stats bar */}
                {mpnResult.cache_stats && (
                  <div className="flex items-center gap-4 text-meta text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Database className="h-3.5 w-3.5 text-blue-500" />
                      Cache: {mpnResult.cache_stats.from_cache}
                    </span>
                    <span className="flex items-center gap-1">
                      <Cloud className="h-3.5 w-3.5 text-amber-500" />
                      Denodo: {mpnResult.cache_stats.from_denodo}
                    </span>
                    {mpnResult.cache_stats.not_found.length > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        Not found: {mpnResult.cache_stats.not_found.join(", ")}
                      </span>
                    )}
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Search MPN</TableHead>
                      <TableHead>Item Number</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Lifecycle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(mpnResult.by_manufacturer).flatMap(([mfr, recs]) =>
                      recs.map((r, i) => (
                        <TableRow key={`${mfr}-${i}`}>
                          <TableCell className="font-medium">{r.search_mpn}</TableCell>
                          <TableCell className="font-mono">{r.ITEM_NUMBER}</TableCell>
                          <TableCell>{mfr}</TableCell>
                          <TableCell>
                            <Badge variant={r.MFR_PART_LIFECYCLE_PHASE === "Active" ? "low" : "medium"}>
                              {r.MFR_PART_LIFECYCLE_PHASE}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.PREDERRED_STATUS === "Preferred" ? "low" : "outline"}>
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
                    <p className="text-meta font-medium text-red-600 dark:text-red-400 mb-1">Errors:</p>
                    {mpnResult.errors.map((e, i) => (
                      <p key={i} className="text-meta text-red-500">{e.mpn}: {e.error}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
