import type { FastifyRequest, FastifyReply } from "fastify";
import { NotificationRulesService } from "./notification-rules.service.js";
import { getEmailTransport } from "../notification/email-transport.service.js";
import { buildPcnNotificationEmail, type PcnEmailData } from "../notification/email-templates/pcn-notification.js";
import { prisma } from "../../config/database.js";
import { AiServiceFactory } from "../ai-analysis/ai.service.js";
import { MpnCacheService } from "../where-used/mpn-cache.service.js";
import { WhereUsedCacheService } from "../where-used/whereused-cache.service.js";
import { DenodoPartsInfoService } from "../where-used/denodo-parts.service.js";
import { DenodoExportService } from "../where-used/denodo-export.service.js";
import { getTeamsTransport } from "../notification/teams-transport.service.js";
import { logger } from "../../config/logger.js";
import fs from "fs";

export class NotificationRulesController {
  private service = new NotificationRulesService();

  // --- Rules ---
  listRules = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listRules();
    return reply.send({ success: true, data });
  };

  getRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const data = await this.service.getRule(id);
    return reply.send({ success: true, data });
  };

  createRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    const data = await this.service.createRule(body);
    return reply.status(201).send({ success: true, data });
  };

  updateRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const data = await this.service.updateRule(id, body);
    return reply.send({ success: true, data });
  };

  deleteRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    await this.service.deleteRule(id);
    return reply.send({ success: true });
  };

  // --- Customers ---
  listCustomers = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listCustomers();
    return reply.send({ success: true, data });
  };

  createCustomer = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    const data = await this.service.createCustomer(body);
    return reply.status(201).send({ success: true, data });
  };

  updateCustomer = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const data = await this.service.updateCustomer(id, body);
    return reply.send({ success: true, data });
  };

  assignCustomerRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerId, ruleId } = req.body as { customerId: string; ruleId: string };
    const data = await this.service.assignCustomerRule(customerId, ruleId);
    return reply.send({ success: true, data });
  };

  removeCustomerRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerId, ruleId } = req.body as { customerId: string; ruleId: string };
    const data = await this.service.removeCustomerRule(customerId, ruleId);
    return reply.send({ success: true, data });
  };

  searchCustomers = async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.query as any;
    const data = await this.service.searchCustomers(params);
    return reply.send({ success: true, data });
  };

  bulkAssignCustomerRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerIds, ruleId } = req.body as { customerIds: string[]; ruleId: string };
    const data = await this.service.bulkAssignCustomerRule(customerIds, ruleId);
    return reply.send({ success: true, data });
  };

  bulkRemoveCustomerRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerIds, ruleId } = req.body as { customerIds: string[]; ruleId: string };
    const data = await this.service.bulkRemoveCustomerRule(customerIds, ruleId);
    return reply.send({ success: true, data });
  };

  // --- Templates ---
  listTemplates = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = this.service.getTemplates();
    return reply.send({ success: true, data });
  };

  applyTemplate = async (req: FastifyRequest, reply: FastifyReply) => {
    const { templateId, entityType, entityIds } = req.body as { templateId: string; entityType: "customer" | "product"; entityIds: string[] };
    const data = await this.service.applyTemplate(templateId, entityType, entityIds);
    return reply.send({ success: true, data });
  };

  // --- Products ---
  listProducts = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listProducts();
    return reply.send({ success: true, data });
  };

  searchProducts = async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.query as any;
    const data = await this.service.searchProducts(params);
    return reply.send({ success: true, data });
  };

  bulkAssignProductRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { productIds, ruleId } = req.body as { productIds: string[]; ruleId: string };
    const data = await this.service.bulkAssignProductRule(productIds, ruleId);
    return reply.send({ success: true, data });
  };

  bulkRemoveProductRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { productIds, ruleId } = req.body as { productIds: string[]; ruleId: string };
    const data = await this.service.bulkRemoveProductRule(productIds, ruleId);
    return reply.send({ success: true, data });
  };

  createProduct = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    const data = await this.service.createProduct(body);
    return reply.status(201).send({ success: true, data });
  };

  assignProductRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { productId, ruleId, customerId } = req.body as { productId: string; ruleId: string; customerId?: string };
    const data = await this.service.assignProductRule(productId, ruleId, customerId);
    return reply.send({ success: true, data });
  };

  removeProductRule = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const data = await this.service.removeProductRule(id);
    return reply.send({ success: true, data });
  };

  // --- Evaluation ---
  evaluate = async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as { eventId: string };
    const data = await this.service.evaluateNotifications(eventId);
    return reply.send({ success: true, data });
  };

  // --- Queue ---
  listQueue = async (req: FastifyRequest, reply: FastifyReply) => {
    const { status } = req.query as { status?: string };
    const data = await this.service.listQueue(status);
    return reply.send({ success: true, data });
  };

  approveNotification = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reviewedBy } = req.body as { reviewedBy: string };
    const data = await this.service.approveNotification(id, reviewedBy);
    return reply.send({ success: true, data });
  };

  skipNotification = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reviewedBy } = req.body as { reviewedBy: string };
    const data = await this.service.skipNotification(id, reviewedBy);
    return reply.send({ success: true, data });
  };

  // --- Import ---
  importCeOwners = async (req: FastifyRequest, reply: FastifyReply) => {
    const { filePath } = req.body as { filePath: string };
    if (!filePath) return reply.status(400).send({ success: false, error: { message: "filePath required" } });
    const data = await this.service.importCeOwnersFromExcel(filePath);
    return reply.send({ success: true, data });
  };

  // --- Seed ---
  seedRules = async (_req: FastifyRequest, reply: FastifyReply) => {
    const count = await this.service.seedSystemRules();
    return reply.send({ success: true, data: { seeded: count } });
  };

  // --- Email Preview ---
  /** Preview notification email as rendered HTML (for browser viewing) */
  previewEmail = async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as { eventId: string };
    const emailData = await this.buildEmailDataFromEvent(eventId);
    if (!emailData) {
      return reply.status(404).send({ success: false, error: { message: "PCN event or AI analysis not found" } });
    }
    const { html } = buildPcnNotificationEmail(emailData);
    return reply.type("text/html").send(html);
  };

  /** Preview email data as JSON (for debugging) */
  previewEmailJson = async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as { eventId: string };
    const emailData = await this.buildEmailDataFromEvent(eventId);
    if (!emailData) {
      return reply.status(404).send({ success: false, error: { message: "PCN event or AI analysis not found" } });
    }
    const { subject, text } = buildPcnNotificationEmail(emailData);
    return reply.send({ success: true, data: { subject, emailData, textPreview: text } });
  };

  /** Send a test email to a specified address (with Excel attachment) */
  sendTestEmail = async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId, recipientEmail } = req.body as { eventId: string; recipientEmail: string };
    if (!eventId || !recipientEmail) {
      return reply.status(400).send({ success: false, error: { message: "eventId and recipientEmail required" } });
    }

    const emailData = await this.buildEmailDataFromEvent(eventId);
    if (!emailData) {
      return reply.status(404).send({ success: false, error: { message: "PCN event or AI analysis not found" } });
    }

    const { subject, html, text } = buildPcnNotificationEmail(emailData);
    const transport = getEmailTransport();

    // Build Excel attachment
    const attachment = await this.buildExcelAttachment(eventId, emailData);

    const result = await transport.sendEmail({
      to: recipientEmail,
      subject: `[TEST] ${subject}`,
      html,
      text,
      ...(attachment ? { attachments: [attachment] } : {}),
    });

    return reply.send({ success: true, data: result });
  };

  /** Get email transport status */
  emailStatus = async (_req: FastifyRequest, reply: FastifyReply) => {
    const transport = getEmailTransport();
    return reply.send({ success: true, data: transport.getStatus() });
  };

  /** Build PcnEmailData from a PCN event ID (with translation + Adv Part Numbers) */
  private async buildEmailDataFromEvent(eventId: string): Promise<PcnEmailData | null> {
    const event = await prisma.pcnEventMaster.findUnique({
      where: { id: eventId },
      include: {
        aiAnalysis: true,
        ceAssessments: { orderBy: { assessedAt: "desc" }, take: 1 },
      },
    });
    if (!event?.aiAnalysis) return null;

    const ai = event.aiAnalysis;
    const ce = event.ceAssessments?.[0];
    const affectedParts = (ai.affectedParts as any[]) ?? [];

    // Translate summary + changeDescription to Traditional Chinese
    let summaryZh: string | undefined;
    let changeDescriptionZh: string | undefined;
    try {
      const aiService = AiServiceFactory.create();
      if ("translateToTraditionalChinese" in aiService) {
        const translation = await (aiService as any).translateToTraditionalChinese({
          summary: ai.summary,
          changeDescription: ai.changeDescription,
          riskReason: ai.riskReason,
        });
        summaryZh = translation?.summary;
        changeDescriptionZh = translation?.changeDescription;
      }
    } catch (err) {
      logger.warn("Translation for email failed, proceeding without Chinese text");
    }

    // Look up Adv Part Numbers from MPN cache
    const mpns = affectedParts.map((p: any) => p.mpn).filter(Boolean);
    const mpnToAdvPart: Map<string, string> = new Map();
    if (mpns.length > 0) {
      try {
        const mpnCache = new MpnCacheService();
        const mpnResult = await mpnCache.searchWithCache(mpns);
        for (const recs of Object.values(mpnResult.by_manufacturer)) {
          for (const r of recs) {
            const existing = mpnToAdvPart.get(r.search_mpn);
            if (!existing) {
              mpnToAdvPart.set(r.search_mpn, r.ITEM_NUMBER);
            } else {
              mpnToAdvPart.set(r.search_mpn, existing + ", " + r.ITEM_NUMBER);
            }
          }
        }
      } catch (err) {
        logger.warn("MPN lookup for email failed, proceeding without Adv Part Numbers");
      }
    }

    return {
      pcnNumber: event.pcnNumber,
      vendorName: event.vendorName,
      pcnTitle: event.pcnTitle,
      pcnType: event.pcnType,
      effectiveDate: event.effectiveDate?.toISOString() ?? null,
      receivedDate: event.receivedDate?.toISOString(),
      summary: ai.summary,
      changeDescription: ai.changeDescription,
      summaryZh,
      changeDescriptionZh,
      riskLevel: ai.riskLevel,
      riskReason: ai.riskReason ?? "",
      formChanged: ai.formChanged,
      fitChanged: ai.fitChanged,
      functionChanged: ai.functionChanged,
      affectedParts: affectedParts.map((p: any) => ({
        mpn: p.mpn,
        advPartNumber: mpnToAdvPart.get(p.mpn) ?? undefined,
        oldMpn: p.oldMpn,
        newMpn: p.newMpn,
      })),
      ceDecision: ce?.ceDecision,
      ceAssessorName: ce?.assessorName,
      ceComments: ce?.comments ?? undefined,
      platformUrl: `http://localhost:5173/pcn/${event.id}`,
    };
  }

  // --- Teams ---
  /** Send test Teams card for a PCN event */
  sendTestTeamsCard = async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.body as { eventId: string };
    if (!eventId) {
      return reply.status(400).send({ success: false, error: { message: "eventId required" } });
    }
    const emailData = await this.buildEmailDataFromEvent(eventId);
    if (!emailData) {
      return reply.status(404).send({ success: false, error: { message: "PCN event or AI analysis not found" } });
    }
    const teams = getTeamsTransport();
    const card = teams.buildPcnNotificationCard(emailData);
    const result = await teams.sendCard(card);
    return reply.send({ success: true, data: result });
  };

  /** Get Teams transport status */
  teamsStatus = async (_req: FastifyRequest, reply: FastifyReply) => {
    const teams = getTeamsTransport();
    return reply.send({ success: true, data: teams.getStatus() });
  };

  /** Build Excel attachment with affected parts + where-used sheets */
  private async buildExcelAttachment(eventId: string, emailData: PcnEmailData) {
    try {
      // Get item numbers from MPN cache
      const mpns = emailData.affectedParts.map((p) => p.mpn).filter(Boolean);
      if (!mpns.length) return null;

      const mpnCache = new MpnCacheService();
      const mpnResult = await mpnCache.searchWithCache(mpns);
      const itemNumbers: string[] = [];
      const mfrMap: Record<string, { MPN: string; Manufacturer: string }> = {};
      for (const [mfr, recs] of Object.entries(mpnResult.by_manufacturer)) {
        for (const r of recs) {
          if (!itemNumbers.includes(r.ITEM_NUMBER)) itemNumbers.push(r.ITEM_NUMBER);
          mfrMap[r.ITEM_NUMBER] = { MPN: r.MFR_PART_NUMBER, Manufacturer: mfr };
        }
      }
      if (!itemNumbers.length) return null;

      // Get parts info + where-used from cache
      const partsService = new DenodoPartsInfoService();
      const wuCacheService = new WhereUsedCacheService();
      const [partsResult, wuResult] = await Promise.all([
        partsService.getPartsInfo(itemNumbers, mfrMap),
        wuCacheService.searchWithCache(itemNumbers),
      ]);

      // Generate Excel
      const exportService = new DenodoExportService();
      const result = await exportService.exportExcel({
        parts_info: partsResult.parts_info,
        where_used: wuResult.where_used,
      });

      return {
        filename: `PCN_${emailData.pcnNumber}_Analysis.xlsx`,
        content: fs.readFileSync(result.output_path),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    } catch (err: any) {
      logger.warn({ error: err.message }, "Failed to build Excel attachment for email");
      return null;
    }
  }
}
