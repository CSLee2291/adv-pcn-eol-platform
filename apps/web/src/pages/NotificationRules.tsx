import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  ShieldCheck,
  Users,
  Settings,
  Package,
  ListTodo,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
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
  fetchNotificationRules,
  createNotificationRule,
  updateNotificationRule,
  deleteNotificationRule,
  seedNotificationRules,
  fetchNotificationCustomers,
  createNotificationCustomer,
  assignCustomerRule,
  removeCustomerRule,
  fetchTrackedProducts,
  createTrackedProduct,
  assignProductRule,
  fetchNotificationQueue,
  approveNotification,
  skipNotification,
} from "@/services/api";

/* ---------- types ---------- */

interface Rule {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  conditions: any;
  requireCeReview: boolean;
  isSystem: boolean;
  isActive: boolean;
  priority: number;
  _count?: { customerRules: number; productRules: number };
}

interface Customer {
  id: string;
  customerCode: string;
  customerName: string;
  contactEmail: string | null;
  contactName: string | null;
  isActive: boolean;
  customerRules: { id: string; rule: Rule; isActive: boolean }[];
  _count?: { customerRules: number };
}

interface Product {
  id: string;
  itemNumber: string;
  productName: string;
  productLifecycle: string;
  productLine: string | null;
  productOwner: string | null;
  isActive: boolean;
  productRules: { id: string; rule: Rule; customer: Customer | null; isActive: boolean }[];
  _count?: { productRules: number };
}

interface QueueEntry {
  id: string;
  status: string;
  triggerSource: string;
  triggeredAt: string;
  ceReviewedBy: string | null;
  pcnEvent: { pcnNumber: string; vendorName: string; pcnTitle: string };
  triggeredRule: { name: string; ruleType: string };
}

const RULE_TYPE_LABELS: Record<string, string> = {
  RISK_THRESHOLD: "Risk Threshold",
  EOL_ALERT: "EOL/Critical Alert",
  FFF_CHANGE: "F/F/F Change",
  ALWAYS: "Always Notify",
  CUSTOM: "Custom",
};

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: any }> = {
  PENDING_CE_REVIEW: { label: "CE Review", variant: "high", icon: Clock },
  PENDING_SEND: { label: "Ready to Send", variant: "medium", icon: Send },
  SENT: { label: "Sent", variant: "low", icon: CheckCircle2 },
  SKIPPED: { label: "Skipped", variant: "outline", icon: X },
};

/* ---------- component ---------- */

export function NotificationRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ customerCode: "", customerName: "", contactEmail: "" });
  const [newProduct, setNewProduct] = useState({ itemNumber: "", productName: "", productLine: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, p, q] = await Promise.all([
        fetchNotificationRules(),
        fetchNotificationCustomers(),
        fetchTrackedProducts(),
        fetchNotificationQueue(),
      ]);
      setRules(r);
      setCustomers(c);
      setProducts(p);
      setQueue(q);
    } catch (err) {
      console.error("Failed to load notification data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSeedRules = async () => {
    await seedNotificationRules();
    await loadAll();
  };

  // ==================== Rules Tab ====================
  const handleToggleRule = async (rule: Rule) => {
    await updateNotificationRule(rule.id, { isActive: !rule.isActive });
    await loadAll();
  };

  const handleToggleCeReview = async (rule: Rule) => {
    await updateNotificationRule(rule.id, { requireCeReview: !rule.requireCeReview });
    await loadAll();
  };

  const handleDeleteRule = async (rule: Rule) => {
    if (rule.isSystem) return;
    await deleteNotificationRule(rule.id);
    await loadAll();
  };

  // ==================== Customer Tab ====================
  const handleAddCustomer = async () => {
    if (!newCustomer.customerCode || !newCustomer.customerName) return;
    await createNotificationCustomer(newCustomer);
    setNewCustomer({ customerCode: "", customerName: "", contactEmail: "" });
    setShowAddCustomer(false);
    await loadAll();
  };

  const handleAssignCustomerRule = async (customerId: string, ruleId: string) => {
    await assignCustomerRule(customerId, ruleId);
    await loadAll();
  };

  const handleRemoveCustomerRule = async (customerId: string, ruleId: string) => {
    await removeCustomerRule(customerId, ruleId);
    await loadAll();
  };

  // ==================== Product Tab ====================
  const handleAddProduct = async () => {
    if (!newProduct.itemNumber || !newProduct.productName) return;
    await createTrackedProduct({ ...newProduct, productLifecycle: "M/P", source: "MANUAL" });
    setNewProduct({ itemNumber: "", productName: "", productLine: "" });
    setShowAddProduct(false);
    await loadAll();
  };

  const handleAssignProductRule = async (productId: string, ruleId: string) => {
    await assignProductRule(productId, ruleId);
    await loadAll();
  };

  // ==================== Queue Tab ====================
  const handleApprove = async (id: string) => {
    await approveNotification(id, "CE.Admin");
    await loadAll();
  };

  const handleSkip = async (id: string) => {
    await skipNotification(id, "CE.Admin");
    await loadAll();
  };

  if (loading && rules.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const pendingReviewCount = queue.filter((q) => q.status === "PENDING_CE_REVIEW").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-title text-[var(--text-primary)]">Notification Rules</h1>
        <div className="flex gap-2">
          {rules.length === 0 && (
            <Button onClick={handleSeedRules}>
              <RefreshCw className="h-4 w-4" /> Seed System Rules
            </Button>
          )}
          <Link to="/notifications/config">
            <Button variant="outline">
              <Settings className="h-4 w-4" /> Configure Rules
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-primary-50 dark:bg-primary-900/30">
              <ShieldCheck className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <p className="text-kpi font-semibold text-[var(--text-primary)]">{rules.filter((r) => r.isActive).length}</p>
              <p className="text-meta text-[var(--text-muted)]">Active Rules</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-green-50 dark:bg-green-900/30">
              <Users className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-kpi font-semibold text-[var(--text-primary)]">{customers.length}</p>
              <p className="text-meta text-[var(--text-muted)]">Customers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-blue-50 dark:bg-blue-900/30">
              <Package className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-kpi font-semibold text-[var(--text-primary)]">{products.length}</p>
              <p className="text-meta text-[var(--text-muted)]">Tracked Products</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-amber-50 dark:bg-amber-900/30">
              <Bell className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-kpi font-semibold text-[var(--text-primary)]">{pendingReviewCount}</p>
              <p className="text-meta text-[var(--text-muted)]">Pending CE Review</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Rules ({rules.length})
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5">
            <Users className="h-4 w-4" /> Customers ({customers.length})
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-4 w-4" /> Products ({products.length})
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5">
            <ListTodo className="h-4 w-4" /> Queue
            {pendingReviewCount > 0 && (
              <Badge variant="high" className="ml-1">{pendingReviewCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ==================== Rules Tab ==================== */}
        <TabsContent value="rules">
          <div className="space-y-3">
            {rules.map((rule) => (
              <Card key={rule.id} className={!rule.isActive ? "opacity-50" : ""}>
                <CardContent className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-body font-medium text-[var(--text-primary)]">{rule.name}</p>
                      <Badge variant="outline">{RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}</Badge>
                      {rule.isSystem && <Badge variant="outline" className="text-blue-500 border-blue-300">System</Badge>}
                      {!rule.isActive && <Badge variant="outline" className="text-red-500 border-red-300">Disabled</Badge>}
                    </div>
                    <p className="text-meta text-[var(--text-muted)]">{rule.description}</p>
                    <div className="flex items-center gap-4 mt-1 text-meta text-[var(--text-muted)]">
                      <span>{rule._count?.customerRules ?? 0} customers</span>
                      <span>{rule._count?.productRules ?? 0} products</span>
                      <span className="flex items-center gap-1">
                        {rule.requireCeReview ? (
                          <><ShieldCheck className="h-3.5 w-3.5 text-amber-500" /> CE Review Required</>
                        ) : (
                          <><Send className="h-3.5 w-3.5 text-green-500" /> Auto-send</>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleCeReview(rule)}
                      title={rule.requireCeReview ? "Disable CE Review" : "Enable CE Review"}
                    >
                      <ShieldCheck className={`h-3.5 w-3.5 ${rule.requireCeReview ? "text-amber-500" : "text-neutral-400"}`} />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleToggleRule(rule)}>
                      {rule.isActive ? <Check className="h-3.5 w-3.5 text-green-500" /> : <X className="h-3.5 w-3.5 text-red-500" />}
                    </Button>
                    {!rule.isSystem && (
                      <Button variant="outline" size="sm" onClick={() => handleDeleteRule(rule)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ==================== Customers Tab ==================== */}
        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-body">Customer Notification Assignments</CardTitle>
                <Button size="sm" onClick={() => setShowAddCustomer(!showAddCustomer)}>
                  <Plus className="h-3.5 w-3.5" /> Add Customer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showAddCustomer && (
                <div className="flex gap-2 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-panel">
                  <Input placeholder="Customer Code" value={newCustomer.customerCode} onChange={(e) => setNewCustomer({ ...newCustomer, customerCode: e.target.value })} className="w-32" />
                  <Input placeholder="Customer Name" value={newCustomer.customerName} onChange={(e) => setNewCustomer({ ...newCustomer, customerName: e.target.value })} className="flex-1" />
                  <Input placeholder="Contact Email" value={newCustomer.contactEmail} onChange={(e) => setNewCustomer({ ...newCustomer, contactEmail: e.target.value })} className="w-48" />
                  <Button size="sm" onClick={handleAddCustomer}><Check className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddCustomer(false)}><X className="h-4 w-4" /></Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Assigned Rules</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((cust) => (
                    <TableRow key={cust.id}>
                      <TableCell className="font-medium">{cust.customerName}</TableCell>
                      <TableCell className="font-mono text-meta">{cust.customerCode}</TableCell>
                      <TableCell className="text-meta">{cust.contactEmail || "\u2014"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cust.customerRules.filter((cr) => cr.isActive).map((cr) => (
                            <Badge key={cr.id} variant="outline" className="gap-1">
                              {cr.rule.name}
                              <button onClick={() => handleRemoveCustomerRule(cust.id, cr.rule.id)} className="hover:text-red-500">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                          {cust.customerRules.filter((cr) => cr.isActive).length === 0 && (
                            <span className="text-meta text-amber-500 flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" /> No rules assigned
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <select
                          className="text-meta border rounded px-2 py-1 bg-transparent"
                          onChange={(e) => { if (e.target.value) { handleAssignCustomerRule(cust.id, e.target.value); e.target.value = ""; } }}
                          defaultValue=""
                        >
                          <option value="">+ Add Rule</option>
                          {rules.filter((r) => r.isActive && !cust.customerRules.some((cr) => cr.rule.id === r.id && cr.isActive)).map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {customers.length === 0 && (
                <p className="text-center text-meta text-[var(--text-muted)] py-4">No customers added yet. Click "Add Customer" to start.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== Products Tab ==================== */}
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-body">Tracked Products (M/P)</CardTitle>
                <Button size="sm" onClick={() => setShowAddProduct(!showAddProduct)}>
                  <Plus className="h-3.5 w-3.5" /> Add Product
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showAddProduct && (
                <div className="flex gap-2 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-panel">
                  <Input placeholder="Item Number" value={newProduct.itemNumber} onChange={(e) => setNewProduct({ ...newProduct, itemNumber: e.target.value })} className="w-40" />
                  <Input placeholder="Product Name" value={newProduct.productName} onChange={(e) => setNewProduct({ ...newProduct, productName: e.target.value })} className="flex-1" />
                  <Input placeholder="Product Line" value={newProduct.productLine} onChange={(e) => setNewProduct({ ...newProduct, productLine: e.target.value })} className="w-32" />
                  <Button size="sm" onClick={handleAddProduct}><Check className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddProduct(false)}><X className="h-4 w-4" /></Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Number</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    <TableHead>Product Line</TableHead>
                    <TableHead>Assigned Rules</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((prod) => (
                    <TableRow key={prod.id}>
                      <TableCell className="font-mono">{prod.itemNumber}</TableCell>
                      <TableCell className="font-medium">{prod.productName}</TableCell>
                      <TableCell><Badge variant="low">{prod.productLifecycle}</Badge></TableCell>
                      <TableCell className="text-meta">{prod.productLine || "\u2014"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {prod.productRules.filter((pr) => pr.isActive).map((pr) => (
                            <Badge key={pr.id} variant="outline" className="gap-1">
                              {pr.rule.name}
                              {pr.customer && <span className="text-primary-500">({pr.customer.customerName})</span>}
                            </Badge>
                          ))}
                          {prod.productRules.filter((pr) => pr.isActive).length === 0 && (
                            <span className="text-meta text-amber-500 flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" /> No rules
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <select
                          className="text-meta border rounded px-2 py-1 bg-transparent"
                          onChange={(e) => { if (e.target.value) { handleAssignProductRule(prod.id, e.target.value); e.target.value = ""; } }}
                          defaultValue=""
                        >
                          <option value="">+ Add Rule</option>
                          {rules.filter((r) => r.isActive).map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {products.length === 0 && (
                <p className="text-center text-meta text-[var(--text-muted)] py-4">No products tracked yet. Add M/P products to monitor.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== Queue Tab ==================== */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle className="text-body">Notification Queue</CardTitle>
            </CardHeader>
            <CardContent>
              {queue.length === 0 ? (
                <p className="text-center text-meta text-[var(--text-muted)] py-8">No notifications in queue. Evaluate PCN events to trigger rules.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PCN</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Triggered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map((entry) => {
                      const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.PENDING_CE_REVIEW;
                      const StatusIcon = cfg.icon;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.pcnEvent.pcnNumber}</TableCell>
                          <TableCell>{entry.pcnEvent.vendorName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{entry.triggeredRule.name}</Badge>
                          </TableCell>
                          <TableCell className="text-meta">{entry.triggerSource === "CUSTOMER_RULE" ? "Customer" : "Product"}</TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant as any} className="gap-1">
                              <StatusIcon className="h-3 w-3" /> {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-meta">
                            {new Date(entry.triggeredAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {entry.status === "PENDING_CE_REVIEW" && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => handleApprove(entry.id)} title="Approve for sending">
                                  <Check className="h-3.5 w-3.5 text-green-500" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleSkip(entry.id)} title="Skip this notification">
                                  <X className="h-3.5 w-3.5 text-red-500" />
                                </Button>
                              </div>
                            )}
                            {entry.ceReviewedBy && (
                              <span className="text-meta text-[var(--text-muted)]">by {entry.ceReviewedBy}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
