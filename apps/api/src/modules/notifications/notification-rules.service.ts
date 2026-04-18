import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";

// ==================== Rule Condition Types ====================

export interface RuleConditions {
  minRiskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  pcnTypes?: string[];
  requireFormChange?: boolean;
  requireFitChange?: boolean;
  requireFunctionChange?: boolean;
  vendors?: string[];
}

interface AiContext {
  riskLevel: string;
  pcnType?: string;
  formChanged: boolean;
  fitChanged: boolean;
  functionChanged: boolean;
  vendorName: string;
}

const RISK_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

// ==================== Rule Evaluation Engine ====================

export function evaluateRule(conditions: RuleConditions, ctx: AiContext, ruleType?: string): boolean {
  // ALWAYS type — always triggers
  if (ruleType === "ALWAYS") return true;

  // FFF_CHANGE type with no specific conditions — trigger if ANY F/F/F changed
  if (ruleType === "FFF_CHANGE" && !conditions.requireFormChange && !conditions.requireFitChange && !conditions.requireFunctionChange) {
    return ctx.formChanged || ctx.fitChanged || ctx.functionChanged;
  }

  // Empty conditions with no special type — always triggers
  if (Object.keys(conditions).length === 0) return true;

  // EOL_ALERT type — OR logic: risk >= threshold OR pcnType matches
  if (ruleType === "EOL_ALERT") {
    let riskMatch = false;
    let typeMatch = false;
    if (conditions.minRiskLevel) {
      riskMatch = (RISK_ORDER[ctx.riskLevel] ?? 0) >= (RISK_ORDER[conditions.minRiskLevel] ?? 0);
    }
    if (conditions.pcnTypes?.length) {
      const type = ctx.pcnType?.toUpperCase() ?? "OTHER";
      typeMatch = conditions.pcnTypes.map((t) => t.toUpperCase()).includes(type);
    }
    return riskMatch || typeMatch;
  }

  // Risk threshold check (AND logic for other rule types)
  if (conditions.minRiskLevel) {
    const threshold = RISK_ORDER[conditions.minRiskLevel] ?? 0;
    const actual = RISK_ORDER[ctx.riskLevel] ?? 0;
    if (actual < threshold) return false;
  }

  // PCN type check
  if (conditions.pcnTypes?.length) {
    const type = ctx.pcnType?.toUpperCase() ?? "OTHER";
    if (!conditions.pcnTypes.map((t) => t.toUpperCase()).includes(type)) return false;
  }

  // F/F/F checks — if required, must be true
  if (conditions.requireFormChange && !ctx.formChanged) return false;
  if (conditions.requireFitChange && !ctx.fitChanged) return false;
  if (conditions.requireFunctionChange && !ctx.functionChanged) return false;

  // Vendor filter
  if (conditions.vendors?.length) {
    const vendorLower = ctx.vendorName.toLowerCase();
    if (!conditions.vendors.some((v) => vendorLower.includes(v.toLowerCase()))) return false;
  }

  return true;
}

// ==================== CRUD Operations ====================

export class NotificationRulesService {
  // --- Rules CRUD ---

  async listRules() {
    return prisma.notificationRule.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { customerRules: true, productRules: true } },
      },
    });
  }

  async getRule(id: string) {
    return prisma.notificationRule.findUniqueOrThrow({
      where: { id },
      include: { customerRules: { include: { customer: true } }, productRules: { include: { product: true } } },
    });
  }

  async createRule(data: {
    name: string;
    description?: string;
    ruleType: string;
    conditions: RuleConditions;
    requireCeReview?: boolean;
    priority?: number;
  }) {
    return prisma.notificationRule.create({
      data: {
        name: data.name,
        description: data.description,
        ruleType: data.ruleType as any,
        conditions: data.conditions as any,
        requireCeReview: data.requireCeReview ?? true,
        priority: data.priority ?? 0,
        isSystem: false,
      },
    });
  }

  async updateRule(id: string, data: Partial<{
    name: string;
    description: string;
    conditions: RuleConditions;
    requireCeReview: boolean;
    isActive: boolean;
    priority: number;
  }>) {
    return prisma.notificationRule.update({ where: { id }, data: data as any });
  }

  async deleteRule(id: string) {
    const rule = await prisma.notificationRule.findUniqueOrThrow({ where: { id } });
    if (rule.isSystem) throw new Error("Cannot delete system rules");
    return prisma.notificationRule.delete({ where: { id } });
  }

  // --- Rule Templates ---

  getTemplates() {
    return [
      { id: "standard", name: "Standard Customer", description: "High Risk + F/F/F Change Alert", ruleNames: ["High Risk Notification", "F/F/F Change Alert"] },
      { id: "critical-only", name: "Critical Only", description: "Critical/EOL Alert only", ruleNames: ["Critical/EOL Alert"] },
      { id: "full-coverage", name: "Full Coverage", description: "All 5 rules", ruleNames: ["Critical/EOL Alert", "High Risk Notification", "F/F/F Change Alert", "EOL/PDN Only", "All PCN Notification"] },
      { id: "eol-watch", name: "EOL Watch", description: "Critical/EOL + EOL/PDN Only", ruleNames: ["Critical/EOL Alert", "EOL/PDN Only"] },
    ];
  }

  async applyTemplate(templateId: string, entityType: "customer" | "product", entityIds: string[]) {
    const templates = this.getTemplates();
    const template = templates.find((t) => t.id === templateId);
    if (!template) throw new Error(`Template '${templateId}' not found`);

    const rules = await prisma.notificationRule.findMany({
      where: { name: { in: template.ruleNames }, isActive: true },
    });

    let count = 0;
    for (const entityId of entityIds) {
      for (const rule of rules) {
        if (entityType === "customer") {
          await this.assignCustomerRule(entityId, rule.id);
        } else {
          await this.assignProductRule(entityId, rule.id);
        }
        count++;
      }
    }
    return { applied: count, template: template.name, entities: entityIds.length };
  }

  // --- Customer CRUD ---

  async listCustomers() {
    return prisma.customerMaster.findMany({
      where: { isActive: true },
      include: {
        customerRules: { include: { rule: true }, where: { isActive: true } },
        _count: { select: { customerRules: true } },
      },
      orderBy: { customerName: "asc" },
    });
  }

  async searchCustomers(params: { search?: string; hasRules?: string; page?: number | string; limit?: number | string }) {
    const search = params.search?.trim() || undefined;
    const hasRules = params.hasRules;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const where: any = { isActive: true };

    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { customerCode: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.customerMaster.findMany({
        where,
        include: {
          customerRules: { include: { rule: true }, where: { isActive: true } },
        },
        orderBy: { customerName: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customerMaster.count({ where }),
    ]);

    // Filter by hasRules after query (can't filter by relation count in Prisma easily)
    let filtered = items;
    if (hasRules === "yes") filtered = items.filter((c) => c.customerRules.length > 0);
    if (hasRules === "no") filtered = items.filter((c) => c.customerRules.length === 0);

    // Stats
    const allCustomers = await prisma.customerMaster.count({ where: { isActive: true } });
    const withRules = await prisma.customerMaster.count({
      where: { isActive: true, customerRules: { some: { isActive: true } } },
    });

    return {
      items: filtered,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: { total: allCustomers, withRules, withoutRules: allCustomers - withRules },
    };
  }

  async bulkAssignCustomerRule(customerIds: string[], ruleId: string) {
    let count = 0;
    for (const cid of customerIds) {
      await this.assignCustomerRule(cid, ruleId);
      count++;
    }
    return { assigned: count };
  }

  async bulkRemoveCustomerRule(customerIds: string[], ruleId: string) {
    let count = 0;
    for (const cid of customerIds) {
      try { await this.removeCustomerRule(cid, ruleId); count++; } catch { /* skip if not assigned */ }
    }
    return { removed: count };
  }

  async createCustomer(data: { customerCode: string; customerName: string; contactEmail?: string; contactName?: string }) {
    return prisma.customerMaster.create({ data });
  }

  async updateCustomer(id: string, data: Partial<{ customerName: string; contactEmail: string; contactName: string; isActive: boolean }>) {
    return prisma.customerMaster.update({ where: { id }, data });
  }

  async assignCustomerRule(customerId: string, ruleId: string) {
    return prisma.customerRule.upsert({
      where: { customerId_ruleId: { customerId, ruleId } },
      create: { customerId, ruleId },
      update: { isActive: true },
    });
  }

  async removeCustomerRule(customerId: string, ruleId: string) {
    return prisma.customerRule.update({
      where: { customerId_ruleId: { customerId, ruleId } },
      data: { isActive: false },
    });
  }

  // --- Tracked Products CRUD ---

  async listProducts() {
    return prisma.trackedProduct.findMany({
      where: { isActive: true },
      include: {
        productRules: { include: { rule: true, customer: true }, where: { isActive: true } },
        _count: { select: { productRules: true } },
      },
      orderBy: { productName: "asc" },
    });
  }

  async searchProducts(params: { search?: string; lifecycle?: string; productLine?: string; hasRules?: string; page?: number | string; limit?: number | string }) {
    const search = params.search?.trim() || undefined;
    const lifecycle = params.lifecycle || undefined;
    const productLine = params.productLine || undefined;
    const hasRules = params.hasRules;
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 50;
    const where: any = { isActive: true };

    if (search) {
      where.OR = [
        { itemNumber: { contains: search, mode: "insensitive" } },
        { productName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (lifecycle) where.productLifecycle = lifecycle;
    if (productLine) where.productLine = { contains: productLine, mode: "insensitive" };

    const [items, total] = await Promise.all([
      prisma.trackedProduct.findMany({
        where,
        include: {
          productRules: { include: { rule: true }, where: { isActive: true } },
        },
        orderBy: { itemNumber: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trackedProduct.count({ where }),
    ]);

    let filtered = items;
    if (hasRules === "yes") filtered = items.filter((p) => p.productRules.length > 0);
    if (hasRules === "no") filtered = items.filter((p) => p.productRules.length === 0);

    const allProducts = await prisma.trackedProduct.count({ where: { isActive: true } });
    const withRules = await prisma.trackedProduct.count({
      where: { isActive: true, productRules: { some: { isActive: true } } },
    });

    return {
      items: filtered,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: { total: allProducts, withRules, withoutRules: allProducts - withRules },
    };
  }

  async bulkAssignProductRule(productIds: string[], ruleId: string) {
    let count = 0;
    for (const pid of productIds) {
      await this.assignProductRule(pid, ruleId);
      count++;
    }
    return { assigned: count };
  }

  async bulkRemoveProductRule(productIds: string[], ruleId: string) {
    let count = 0;
    for (const pid of productIds) {
      const pr = await prisma.productRule.findFirst({ where: { productId: pid, ruleId, isActive: true } });
      if (pr) { await this.removeProductRule(pr.id); count++; }
    }
    return { removed: count };
  }

  async createProduct(data: {
    itemNumber: string;
    productName: string;
    productLifecycle?: string;
    productLine?: string;
    productOwner?: string;
    productOwnerEmail?: string;
    source?: string;
  }) {
    return prisma.trackedProduct.upsert({
      where: { itemNumber: data.itemNumber },
      create: data,
      update: { productName: data.productName, isActive: true },
    });
  }

  async assignProductRule(productId: string, ruleId: string, customerId?: string) {
    const where = { productId_ruleId_customerId: { productId, ruleId, customerId: customerId ?? "" } };
    return prisma.productRule.upsert({
      where,
      create: { productId, ruleId, customerId: customerId || null },
      update: { isActive: true },
    }).catch(() => {
      // Handle null customerId unique constraint
      return prisma.productRule.create({ data: { productId, ruleId, customerId: customerId || null } });
    });
  }

  async removeProductRule(id: string) {
    return prisma.productRule.update({ where: { id }, data: { isActive: false } });
  }

  // --- Notification Evaluation ---

  async evaluateNotifications(pcnEventId: string) {
    const event = await prisma.pcnEventMaster.findUniqueOrThrow({
      where: { id: pcnEventId },
      include: { aiAnalysis: true },
    });

    if (!event.aiAnalysis) throw new Error("No AI analysis for this event");

    const ai = event.aiAnalysis;
    const ctx: AiContext = {
      riskLevel: ai.riskLevel,
      pcnType: (ai as any).pcnType,
      formChanged: ai.formChanged,
      fitChanged: ai.fitChanged,
      functionChanged: ai.functionChanged,
      vendorName: event.vendorName,
    };

    const queueEntries: { customerId: string; ruleId: string; source: string; requireCeReview: boolean }[] = [];
    const seenCustomers = new Set<string>();

    // 1. Evaluate customer-level rules
    const customerRules = await prisma.customerRule.findMany({
      where: { isActive: true, rule: { isActive: true } },
      include: { rule: true, customer: true },
    });

    for (const cr of customerRules) {
      const conditions = cr.rule.conditions as unknown as RuleConditions;
      if (evaluateRule(conditions, ctx, cr.rule.ruleType)) {
        const key = `${cr.customerId}:${cr.ruleId}`;
        if (!seenCustomers.has(key)) {
          seenCustomers.add(key);
          queueEntries.push({
            customerId: cr.customerId,
            ruleId: cr.ruleId,
            source: "CUSTOMER_RULE",
            requireCeReview: cr.rule.requireCeReview,
          });
        }
      }
    }

    // 2. Evaluate product-level rules
    const affectedMpns = (ai.affectedParts as any[])?.map((p: any) => p.mpn) ?? [];
    if (affectedMpns.length > 0) {
      // Find tracked products that match affected MPNs (via MPN cache)
      const cachedMpns = await prisma.mpnCacheEntry.findMany({
        where: { searchMpn: { in: affectedMpns }, found: true },
      });
      const affectedItemNumbers = [...new Set(cachedMpns.map((c) => c.itemNumber))];

      const productRules = await prisma.productRule.findMany({
        where: {
          isActive: true,
          rule: { isActive: true },
          product: { itemNumber: { in: affectedItemNumbers }, isActive: true },
        },
        include: { rule: true, product: true, customer: true },
      });

      for (const pr of productRules) {
        const conditions = pr.rule.conditions as unknown as RuleConditions;
        if (evaluateRule(conditions, ctx, pr.rule.ruleType)) {
          // For global product rules (no customer), notify product owner
          // For customer-specific product rules, notify that customer
          const custId = pr.customerId;
          if (custId) {
            const key = `${custId}:${pr.ruleId}`;
            if (!seenCustomers.has(key)) {
              seenCustomers.add(key);
              queueEntries.push({
                customerId: custId,
                ruleId: pr.ruleId,
                source: "PRODUCT_RULE",
                requireCeReview: pr.rule.requireCeReview,
              });
            }
          }
        }
      }
    }

    // 3. Write to notification queue
    const created = [];
    for (const entry of queueEntries) {
      const status = entry.requireCeReview ? "PENDING_CE_REVIEW" : "PENDING_SEND";
      const record = await prisma.notificationQueueEntry.create({
        data: {
          pcnEventId,
          customerId: entry.customerId,
          triggeredRuleId: entry.ruleId,
          triggerSource: entry.source,
          status: status as any,
        },
      });
      created.push(record);
    }

    logger.info(
      { pcnEventId, triggered: created.length, ceReviewNeeded: created.filter((c) => c.status === "PENDING_CE_REVIEW").length },
      "Notification evaluation completed"
    );

    return { pcnEventId, triggered: created.length, entries: created };
  }

  // --- Queue Management ---

  async listQueue(status?: string) {
    return prisma.notificationQueueEntry.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        pcnEvent: { select: { pcnNumber: true, vendorName: true, pcnTitle: true } },
        triggeredRule: { select: { name: true, ruleType: true } },
      },
      orderBy: { triggeredAt: "desc" },
    });
  }

  async approveNotification(id: string, reviewedBy: string) {
    return prisma.notificationQueueEntry.update({
      where: { id },
      data: { status: "PENDING_SEND", ceReviewedBy: reviewedBy, ceReviewedAt: new Date() },
    });
  }

  async skipNotification(id: string, reviewedBy: string) {
    return prisma.notificationQueueEntry.update({
      where: { id },
      data: { status: "SKIPPED", ceReviewedBy: reviewedBy, ceReviewedAt: new Date() },
    });
  }

  // --- Import CE Owners from Excel ---

  async importCeOwnersFromExcel(filePath: string) {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.default.Workbook();
    await wb.xlsx.readFile(filePath);

    const ws = wb.getWorksheet("清單1");
    if (!ws) throw new Error("Sheet '清單1' not found");

    const imported: { name: string; partCat: string; supervisor: string }[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = row.getCell(3).value;
      if (!name) continue;
      const nameStr = String(name);
      const supervisor = String(row.getCell(5).value || "");
      const partCat = String(row.getCell(6).value || "");

      const ruleSetInfo = JSON.stringify({ supervisor, partCat, source: "EXCEL_IMPORT" });
      await prisma.customerMaster.upsert({
        where: { customerCode: nameStr.toUpperCase() },
        create: {
          customerName: nameStr,
          customerCode: nameStr.toUpperCase(),
          contactEmail: `${nameStr}@advantech.com.tw`,
          contactName: supervisor ? `Supervisor: ${supervisor}` : null,
          notificationRuleSet: ruleSetInfo,
        },
        update: {
          contactEmail: `${nameStr}@advantech.com.tw`,
          contactName: supervisor ? `Supervisor: ${supervisor}` : null,
          notificationRuleSet: ruleSetInfo,
        },
      });
      imported.push({ name: nameStr, partCat, supervisor });
    }

    logger.info({ count: imported.length }, "CE owners imported from Excel");
    return { imported: imported.length, ceOwners: imported };
  }

  // --- Seed System Rules ---

  async seedSystemRules() {
    const systemRules = [
      {
        name: "Critical/EOL Alert",
        description: "Notify when risk is CRITICAL or PCN type is EOL",
        ruleType: "EOL_ALERT" as const,
        conditions: { minRiskLevel: "CRITICAL", pcnTypes: ["EOL"] },
        requireCeReview: true,
        priority: 1,
      },
      {
        name: "High Risk Notification",
        description: "Notify when risk level is HIGH or above",
        ruleType: "RISK_THRESHOLD" as const,
        conditions: { minRiskLevel: "HIGH" },
        requireCeReview: true,
        priority: 2,
      },
      {
        name: "F/F/F Change Alert",
        description: "Notify when any Form, Fit, or Function change is detected",
        ruleType: "FFF_CHANGE" as const,
        conditions: {},  // Special: evaluated with OR logic for F/F/F
        requireCeReview: true,
        priority: 3,
      },
      {
        name: "All PCN Notification",
        description: "Notify on every PCN event (informational)",
        ruleType: "ALWAYS" as const,
        conditions: {},
        requireCeReview: false,
        priority: 10,
      },
      {
        name: "EOL/PDN Only",
        description: "Notify only for End-of-Life or Product Discontinuance",
        ruleType: "EOL_ALERT" as const,
        conditions: { pcnTypes: ["EOL", "PDN"] },
        requireCeReview: true,
        priority: 4,
      },
    ];

    for (const rule of systemRules) {
      await prisma.notificationRule.upsert({
        where: { name: rule.name },
        create: { ...rule, conditions: rule.conditions as any, isSystem: true },
        update: { description: rule.description, conditions: rule.conditions as any, priority: rule.priority },
      });
    }

    logger.info({ count: systemRules.length }, "System notification rules seeded");
    return systemRules.length;
  }
}
