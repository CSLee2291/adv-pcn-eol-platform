import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { getTeamsTransport } from "../notification/teams-transport.service.js";
import { WhereUsedCacheService } from "../where-used/whereused-cache.service.js";
import { MpnCacheService } from "../where-used/mpn-cache.service.js";

export interface RdSuggestion {
  rdName: string;
  rdEmail: string;
  productCount: number;
  products: string[];
}

export class RdVerificationService {
  /**
   * Auto-suggest RD engineer(s) based on affected products' owners
   */
  async suggestRd(assessmentId: string): Promise<RdSuggestion[]> {
    const assessment = await prisma.ceAssessment.findUnique({
      where: { id: assessmentId },
      include: { pcnEvent: { include: { aiAnalysis: true } } },
    });
    if (!assessment?.pcnEvent?.aiAnalysis) return [];

    // Get affected MPNs → item numbers → where-used → product owners
    const mpns = ((assessment.pcnEvent.aiAnalysis.affectedParts as any[]) ?? [])
      .map((p: any) => p.mpn).filter(Boolean);
    if (!mpns.length) return [];

    const mpnCache = new MpnCacheService();
    const mpnResult = await mpnCache.searchWithCache(mpns);
    const itemNumbers: string[] = [];
    for (const recs of Object.values(mpnResult.by_manufacturer)) {
      for (const r of recs) {
        if (!itemNumbers.includes(r.ITEM_NUMBER)) itemNumbers.push(r.ITEM_NUMBER);
      }
    }
    if (!itemNumbers.length) return [];

    const wuCache = new WhereUsedCacheService();
    const wuResult = await wuCache.searchWithCache(itemNumbers);

    // Group by Product_Owner → count products
    const ownerMap = new Map<string, { email: string; products: Set<string> }>();
    for (const r of wuResult.where_used) {
      const owner = r.Product_Owner;
      const email = r.EMAIL;
      if (!owner || !email) continue;
      const existing = ownerMap.get(owner) ?? { email, products: new Set() };
      existing.products.add(r.Product_Name);
      ownerMap.set(owner, existing);
    }

    // Sort by product count (most affected first)
    return [...ownerMap.entries()]
      .map(([name, data]) => ({
        rdName: name,
        rdEmail: data.email,
        productCount: data.products.size,
        products: [...data.products].slice(0, 10),
      }))
      .sort((a, b) => b.productCount - a.productCount);
  }

  /** Create an RD verification task */
  async createTask(input: {
    ceAssessmentId: string;
    pcnEventId: string;
    assignedRdName: string;
    assignedRdEmail: string;
    assignedBy: string;
    autoAssigned?: boolean;
    priority?: string;
    dueDate?: string;
  }) {
    const task = await prisma.rdVerificationTask.create({
      data: {
        ceAssessmentId: input.ceAssessmentId,
        pcnEventId: input.pcnEventId,
        assignedRdName: input.assignedRdName,
        assignedRdEmail: input.assignedRdEmail,
        assignedBy: input.assignedBy,
        autoAssigned: input.autoAssigned ?? false,
        priority: input.priority ?? "NORMAL",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      include: { pcnEvent: { include: { aiAnalysis: true } } },
    });

    // Send Teams notification
    const teams = getTeamsTransport();
    const ai = task.pcnEvent.aiAnalysis;
    if (ai) {
      const card = teams.buildRdVerificationCard({
        pcnNumber: task.pcnEvent.pcnNumber,
        vendorName: task.pcnEvent.vendorName,
        riskLevel: ai.riskLevel,
        assignedRdName: task.assignedRdName,
        assignedRdEmail: task.assignedRdEmail,
        assignedBy: task.assignedBy,
        priority: task.priority,
        affectedPartsCount: ((ai.affectedParts as any[]) ?? []).length,
        summary: ai.summary,
        platformUrl: `http://localhost:5173/pcn/${task.pcnEventId}`,
      });
      await teams.sendCard(card);
    }

    logger.info(
      { taskId: task.id, rd: task.assignedRdName, pcn: task.pcnEvent.pcnNumber },
      "RD verification task created",
    );

    return task;
  }

  /** List tasks with optional filters */
  async listTasks(filters?: { status?: string; assignedRdEmail?: string; pcnEventId?: string }) {
    const where: any = {};
    if (filters?.status) where.taskStatus = filters.status;
    if (filters?.assignedRdEmail) where.assignedRdEmail = filters.assignedRdEmail;
    if (filters?.pcnEventId) where.pcnEventId = filters.pcnEventId;

    return prisma.rdVerificationTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        pcnEvent: { select: { pcnNumber: true, vendorName: true, pcnType: true } },
        ceAssessment: { select: { assessorName: true, ceDecision: true } },
      },
    });
  }

  /** Get a single task */
  async getTask(id: string) {
    return prisma.rdVerificationTask.findUnique({
      where: { id },
      include: {
        pcnEvent: { include: { aiAnalysis: true } },
        ceAssessment: true,
      },
    });
  }

  /** RD responds with decision */
  async respond(id: string, input: { rdDecision: string; rdComments?: string }) {
    const task = await prisma.rdVerificationTask.update({
      where: { id },
      data: {
        rdDecision: input.rdDecision,
        rdComments: input.rdComments,
        taskStatus: "COMPLETED",
        respondedAt: new Date(),
      },
      include: { pcnEvent: true },
    });

    // Send Teams status update
    const teams = getTeamsTransport();
    const color = input.rdDecision === "PASS" ? "good" : input.rdDecision === "FAIL" ? "attention" : "warning";
    const card = teams.buildStatusUpdateCard(
      `RD Verification: ${input.rdDecision}`,
      `PCN ${task.pcnEvent.pcnNumber} — RD decision: **${input.rdDecision}**${input.rdComments ? `\n\n${input.rdComments}` : ""}`,
      color,
    );
    await teams.sendCard(card);

    logger.info({ taskId: id, decision: input.rdDecision }, "RD verification responded");
    return task;
  }

  /** Cancel a task */
  async cancelTask(id: string) {
    return prisma.rdVerificationTask.update({
      where: { id },
      data: { taskStatus: "CANCELLED" },
    });
  }

  /** Send reminder via Teams */
  async sendReminder(id: string) {
    const task = await this.getTask(id);
    if (!task?.pcnEvent?.aiAnalysis) return { success: false, error: "Task not found" };

    const teams = getTeamsTransport();
    const ai = task.pcnEvent.aiAnalysis;
    const card = teams.buildRdVerificationCard({
      pcnNumber: task.pcnEvent.pcnNumber,
      vendorName: task.pcnEvent.vendorName,
      riskLevel: ai.riskLevel,
      assignedRdName: task.assignedRdName,
      assignedRdEmail: task.assignedRdEmail,
      assignedBy: task.assignedBy,
      priority: task.priority,
      affectedPartsCount: ((ai.affectedParts as any[]) ?? []).length,
      summary: ai.summary,
      platformUrl: `http://localhost:5173/pcn/${task.pcnEventId}`,
    });
    return teams.sendCard(card);
  }
}
