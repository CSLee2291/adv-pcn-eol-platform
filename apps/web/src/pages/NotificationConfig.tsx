import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Search, Users, Package, ShieldCheck, Check, X,
  ChevronLeft, ChevronRight, AlertTriangle, Loader2, Layers,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  fetchNotificationRules,
  searchNotificationCustomers,
  searchTrackedProducts,
  assignCustomerRule,
  removeCustomerRule,
  bulkAssignCustomerRule,
  bulkRemoveCustomerRule,
  assignProductRule,
  bulkAssignProductRule,
  bulkRemoveProductRule,
  fetchTemplates,
  applyTemplate,
} from "@/services/api";

/* ---------- types ---------- */
interface Rule { id: string; name: string; ruleType: string; isActive: boolean; requireCeReview: boolean }
interface CustomerItem { id: string; customerCode: string; customerName: string; contactEmail: string | null; customerRules: { rule: Rule; isActive: boolean }[] }
interface ProductItem { id: string; itemNumber: string; productName: string; productLifecycle: string; productLine: string | null; productRules: { rule: Rule; isActive: boolean }[] }
interface Template { id: string; name: string; description: string; ruleNames: string[] }
interface SearchResult<T> { items: T[]; total: number; page: number; limit: number; totalPages: number; stats: { total: number; withRules: number; withoutRules: number } }

/* ---------- component ---------- */
export function NotificationConfig() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Customer state
  const [custResult, setCustResult] = useState<SearchResult<CustomerItem> | null>(null);
  const [custSearch, setCustSearch] = useState("");
  const [custPage, setCustPage] = useState(1);
  const [custFilter, setCustFilter] = useState("all");
  const [custSelected, setCustSelected] = useState<Set<string>>(new Set());
  const [custActive, setCustActive] = useState<string | null>(null);

  // Product state
  const [prodResult, setProdResult] = useState<SearchResult<ProductItem> | null>(null);
  const [prodSearch, setProdSearch] = useState("");
  const [prodPage, setProdPage] = useState(1);
  const [prodFilter, setProdFilter] = useState("all");
  const [prodSelected, setProdSelected] = useState<Set<string>>(new Set());
  const [prodActive, setProdActive] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // Load rules + templates once
  useEffect(() => {
    Promise.all([fetchNotificationRules(), fetchTemplates()]).then(([r, t]) => {
      setRules(r.filter((x: Rule) => x.isActive));
      setTemplates(t);
    });
  }, []);

  // Search customers
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await searchNotificationCustomers({ search: custSearch || undefined, hasRules: custFilter === "all" ? undefined : custFilter, page: custPage, limit: 20 });
      setCustResult(data);
    } finally { setLoading(false); }
  }, [custSearch, custPage, custFilter]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // Search products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await searchTrackedProducts({ search: prodSearch || undefined, hasRules: prodFilter === "all" ? undefined : prodFilter, page: prodPage, limit: 50 });
      setProdResult(data);
    } finally { setLoading(false); }
  }, [prodSearch, prodPage, prodFilter]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Debounced search
  const [custDebounce, setCustDebounce] = useState("");
  useEffect(() => { const t = setTimeout(() => { setCustSearch(custDebounce); setCustPage(1); }, 300); return () => clearTimeout(t); }, [custDebounce]);
  const [prodDebounce, setProdDebounce] = useState("");
  useEffect(() => { const t = setTimeout(() => { setProdSearch(prodDebounce); setProdPage(1); }, 300); return () => clearTimeout(t); }, [prodDebounce]);

  // ---- Customer rule handlers ----
  const handleCustRuleToggle = async (custId: string, ruleId: string, assigned: boolean) => {
    if (assigned) await removeCustomerRule(custId, ruleId);
    else await assignCustomerRule(custId, ruleId);
    await loadCustomers();
  };

  const handleCustBulkAssign = async (ruleId: string) => {
    if (custSelected.size === 0) return;
    await bulkAssignCustomerRule([...custSelected], ruleId);
    setCustSelected(new Set());
    await loadCustomers();
  };

  const handleCustBulkRemove = async (ruleId: string) => {
    if (custSelected.size === 0) return;
    await bulkRemoveCustomerRule([...custSelected], ruleId);
    setCustSelected(new Set());
    await loadCustomers();
  };

  const handleCustTemplate = async (templateId: string) => {
    const ids = custActive ? [custActive] : [...custSelected];
    if (ids.length === 0) return;
    await applyTemplate(templateId, "customer", ids);
    await loadCustomers();
  };

  // ---- Product rule handlers ----
  const handleProdRuleToggle = async (prodId: string, ruleId: string, assigned: boolean) => {
    if (assigned) {
      // Find the productRule to remove
      const prod = prodResult?.items.find(p => p.id === prodId);
      const pr = prod?.productRules.find(r => r.rule.id === ruleId);
      if (pr) {
        // Use bulk remove with single item
        await bulkRemoveProductRule([prodId], ruleId);
      }
    } else {
      await assignProductRule(prodId, ruleId);
    }
    await loadProducts();
  };

  const handleProdBulkAssign = async (ruleId: string) => {
    if (prodSelected.size === 0) return;
    await bulkAssignProductRule([...prodSelected], ruleId);
    setProdSelected(new Set());
    await loadProducts();
  };

  const handleProdTemplate = async (templateId: string) => {
    const ids = prodActive ? [prodActive] : [...prodSelected];
    if (ids.length === 0) return;
    await applyTemplate(templateId, "product", ids);
    await loadProducts();
  };

  // ---- Selection helpers ----
  const toggleCustSelect = (id: string) => {
    const next = new Set(custSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    setCustSelected(next);
  };

  const toggleProdSelect = (id: string) => {
    const next = new Set(prodSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    setProdSelected(next);
  };

  const toggleCustSelectAll = () => {
    if (!custResult) return;
    const allIds = custResult.items.map(c => c.id);
    const allSelected = allIds.every(id => custSelected.has(id));
    setCustSelected(allSelected ? new Set() : new Set(allIds));
  };

  const toggleProdSelectAll = () => {
    if (!prodResult) return;
    const allIds = prodResult.items.map(p => p.id);
    const allSelected = allIds.every(id => prodSelected.has(id));
    setProdSelected(allSelected ? new Set() : new Set(allIds));
  };

  // Active item (right panel)
  const activeCust = custResult?.items.find(c => c.id === custActive);
  const activeProd = prodResult?.items.find(p => p.id === prodActive);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/notifications" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-title text-[var(--text-primary)]">Rule Configuration</h1>
        </div>
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers" className="gap-1.5">
            <Users className="h-4 w-4" /> Customer Rules
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-4 w-4" /> Product Rules
          </TabsTrigger>
        </TabsList>

        {/* ==================== CUSTOMER CONFIG ==================== */}
        <TabsContent value="customers">
          {/* Stats Bar */}
          {custResult?.stats && (
            <div className="flex items-center gap-6 text-meta text-[var(--text-muted)] mb-3 px-1">
              <span>Total: <strong>{custResult.stats.total}</strong></span>
              <span className="text-green-600">With rules: <strong>{custResult.stats.withRules}</strong></span>
              <span className={custResult.stats.withoutRules > 0 ? "text-amber-600" : ""}>
                No rules: <strong>{custResult.stats.withoutRules}</strong>
                {custResult.stats.withoutRules > 0 && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
            {/* LEFT: Customer List */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <Input placeholder="Search customers..." value={custDebounce} onChange={(e) => setCustDebounce(e.target.value)} className="pl-9" />
                  </div>
                  <select className="text-meta border rounded px-2 py-2 bg-transparent" value={custFilter} onChange={(e) => { setCustFilter(e.target.value); setCustPage(1); }}>
                    <option value="all">All</option>
                    <option value="yes">Has Rules</option>
                    <option value="no">No Rules</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Select All + Bulk Actions */}
                <div className="flex items-center justify-between mb-2 text-meta">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={custResult?.items.length ? custResult.items.every(c => custSelected.has(c.id)) : false} onChange={toggleCustSelectAll} className="rounded" />
                    Select All ({custSelected.size} selected)
                  </label>
                  {custSelected.size > 0 && (
                    <div className="flex gap-1">
                      <select className="text-meta border rounded px-1.5 py-1 bg-transparent" onChange={(e) => { if (e.target.value) handleCustBulkAssign(e.target.value); e.target.value = ""; }} defaultValue="">
                        <option value="">+ Assign Rule</option>
                        {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <select className="text-meta border rounded px-1.5 py-1 bg-transparent" onChange={(e) => { if (e.target.value) handleCustBulkRemove(e.target.value); e.target.value = ""; }} defaultValue="">
                        <option value="">- Remove Rule</option>
                        {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <select className="text-meta border rounded px-1.5 py-1 bg-transparent" onChange={(e) => { if (e.target.value) handleCustTemplate(e.target.value); e.target.value = ""; }} defaultValue="">
                        <option value="">Apply Template</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Customer list */}
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {custResult?.items.map((cust) => {
                    const ruleCount = cust.customerRules.filter(cr => cr.isActive).length;
                    return (
                      <div key={cust.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-panel cursor-pointer transition-colors ${custActive === cust.id ? "bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800" : "hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}
                        onClick={() => setCustActive(custActive === cust.id ? null : cust.id)}
                      >
                        <input type="checkbox" checked={custSelected.has(cust.id)} onChange={(e) => { e.stopPropagation(); toggleCustSelect(cust.id); }} className="rounded" onClick={(e) => e.stopPropagation()} />
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium text-[var(--text-primary)] truncate">{cust.customerName}</p>
                          <p className="text-meta text-[var(--text-muted)]">{cust.customerCode}</p>
                        </div>
                        {ruleCount > 0 ? (
                          <Badge variant="low">{ruleCount} rules</Badge>
                        ) : (
                          <Badge variant="high" className="gap-1"><AlertTriangle className="h-3 w-3" /> 0</Badge>
                        )}
                      </div>
                    );
                  })}
                  {custResult?.items.length === 0 && (
                    <p className="text-center text-meta text-[var(--text-muted)] py-8">No customers found</p>
                  )}
                </div>

                {/* Pagination */}
                {custResult && custResult.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 text-meta text-[var(--text-muted)]">
                    <span>Page {custResult.page} of {custResult.totalPages} ({custResult.total} total)</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={custPage <= 1} onClick={() => setCustPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" disabled={custPage >= custResult.totalPages} onClick={() => setCustPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RIGHT: Rule Assignment Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-body">
                  {activeCust ? `Rules for: ${activeCust.customerName}` : "Select a customer"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeCust ? (
                  <div className="space-y-3">
                    {rules.map((rule) => {
                      const assigned = activeCust.customerRules.some(cr => cr.rule.id === rule.id && cr.isActive);
                      return (
                        <label key={rule.id} className="flex items-center gap-3 p-3 rounded-panel border cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                          <input type="checkbox" checked={assigned} onChange={() => handleCustRuleToggle(activeCust.id, rule.id, assigned)} className="rounded h-4 w-4" />
                          <div className="flex-1">
                            <p className="text-body font-medium text-[var(--text-primary)]">{rule.name}</p>
                            <div className="flex items-center gap-2 text-meta text-[var(--text-muted)]">
                              <Badge variant="outline" className="text-meta">{rule.ruleType.replace("_", " ")}</Badge>
                              {rule.requireCeReview && <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-amber-500" /> CE Review</span>}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                    <hr className="my-2" />
                    <div>
                      <p className="text-meta text-[var(--text-muted)] mb-2">Quick Apply Template:</p>
                      <div className="flex flex-wrap gap-2">
                        {templates.map((t) => (
                          <Button key={t.id} size="sm" variant="outline" onClick={() => handleCustTemplate(t.id)} title={t.description}>
                            <Layers className="h-3.5 w-3.5" /> {t.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-12 text-[var(--text-muted)]">
                    <Users className="h-10 w-10" />
                    <p className="text-body">Click a customer to view and edit rule assignments</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== PRODUCT CONFIG ==================== */}
        <TabsContent value="products">
          {/* Stats Bar */}
          {prodResult?.stats && (
            <div className="flex items-center gap-6 text-meta text-[var(--text-muted)] mb-3 px-1">
              <span>Total: <strong>{prodResult.stats.total}</strong></span>
              <span className="text-green-600">With rules: <strong>{prodResult.stats.withRules}</strong></span>
              <span className={prodResult.stats.withoutRules > 0 ? "text-amber-600" : ""}>
                No rules: <strong>{prodResult.stats.withoutRules}</strong>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
            {/* LEFT: Product List */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <Input placeholder="Search item number or product name..." value={prodDebounce} onChange={(e) => setProdDebounce(e.target.value)} className="pl-9" />
                  </div>
                  <select className="text-meta border rounded px-2 py-2 bg-transparent" value={prodFilter} onChange={(e) => { setProdFilter(e.target.value); setProdPage(1); }}>
                    <option value="all">All</option>
                    <option value="yes">Has Rules</option>
                    <option value="no">No Rules</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between mb-2 text-meta">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={prodResult?.items.length ? prodResult.items.every(p => prodSelected.has(p.id)) : false} onChange={toggleProdSelectAll} className="rounded" />
                    Select All ({prodSelected.size} selected)
                  </label>
                  {prodSelected.size > 0 && (
                    <div className="flex gap-1">
                      <select className="text-meta border rounded px-1.5 py-1 bg-transparent" onChange={(e) => { if (e.target.value) handleProdBulkAssign(e.target.value); e.target.value = ""; }} defaultValue="">
                        <option value="">+ Assign Rule</option>
                        {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <select className="text-meta border rounded px-1.5 py-1 bg-transparent" onChange={(e) => { if (e.target.value) handleProdTemplate(e.target.value); e.target.value = ""; }} defaultValue="">
                        <option value="">Apply Template</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {prodResult?.items.map((prod) => {
                    const ruleCount = prod.productRules.filter(pr => pr.isActive).length;
                    return (
                      <div key={prod.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-panel cursor-pointer transition-colors ${prodActive === prod.id ? "bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800" : "hover:bg-neutral-50 dark:hover:bg-neutral-800"}`}
                        onClick={() => setProdActive(prodActive === prod.id ? null : prod.id)}
                      >
                        <input type="checkbox" checked={prodSelected.has(prod.id)} onChange={(e) => { e.stopPropagation(); toggleProdSelect(prod.id); }} className="rounded" onClick={(e) => e.stopPropagation()} />
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium text-[var(--text-primary)] truncate">{prod.itemNumber}</p>
                          <p className="text-meta text-[var(--text-muted)] truncate">{prod.productName}</p>
                        </div>
                        <Badge variant="low">{prod.productLifecycle}</Badge>
                        {ruleCount > 0 ? (
                          <Badge variant="low">{ruleCount}</Badge>
                        ) : (
                          <Badge variant="high" className="gap-1"><AlertTriangle className="h-3 w-3" /> 0</Badge>
                        )}
                      </div>
                    );
                  })}
                  {prodResult?.items.length === 0 && (
                    <p className="text-center text-meta text-[var(--text-muted)] py-8">No products found. Add products from the Notifications page.</p>
                  )}
                </div>

                {prodResult && prodResult.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 text-meta text-[var(--text-muted)]">
                    <span>Page {prodResult.page} of {prodResult.totalPages} ({prodResult.total} total)</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={prodPage <= 1} onClick={() => setProdPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" disabled={prodPage >= prodResult.totalPages} onClick={() => setProdPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RIGHT: Rule Assignment Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-body">
                  {activeProd ? `Rules for: ${activeProd.itemNumber}` : "Select a product"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeProd ? (
                  <div className="space-y-3">
                    {rules.map((rule) => {
                      const assigned = activeProd.productRules.some(pr => pr.rule.id === rule.id && pr.isActive);
                      return (
                        <label key={rule.id} className="flex items-center gap-3 p-3 rounded-panel border cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                          <input type="checkbox" checked={assigned} onChange={() => handleProdRuleToggle(activeProd.id, rule.id, assigned)} className="rounded h-4 w-4" />
                          <div className="flex-1">
                            <p className="text-body font-medium text-[var(--text-primary)]">{rule.name}</p>
                            <Badge variant="outline" className="text-meta">{rule.ruleType.replace("_", " ")}</Badge>
                          </div>
                        </label>
                      );
                    })}
                    <hr className="my-2" />
                    <div>
                      <p className="text-meta text-[var(--text-muted)] mb-2">Quick Apply Template:</p>
                      <div className="flex flex-wrap gap-2">
                        {templates.map((t) => (
                          <Button key={t.id} size="sm" variant="outline" onClick={() => handleProdTemplate(t.id)} title={t.description}>
                            <Layers className="h-3.5 w-3.5" /> {t.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-12 text-[var(--text-muted)]">
                    <Package className="h-10 w-10" />
                    <p className="text-body">Click a product to view and edit rule assignments</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
