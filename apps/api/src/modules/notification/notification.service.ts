import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import type { NotificationRuleSet } from "./notification.types.js";

const CUSTOMER_NOTIFICATION_RULES: Record<string, NotificationRuleSet> = {
  FULL: {
    conditions: [{ type: "ALWAYS" }],
  },
  EOL_HIGH_RISK: {
    conditions: [
      { type: "PCN_TYPE", values: ["EOL"] },
      { type: "RISK_LEVEL", values: ["HIGH", "CRITICAL"] },
      { type: "FFF_CHANGED", values: ["FORM", "FIT", "FUNCTION"] },
    ],
    logic: "OR",
  },
  CUSTOM_STRICT: {
    conditions: [
      { type: "RISK_LEVEL", values: ["HIGH", "CRITICAL"] },
      { type: "PCN_TYPE", values: ["EOL"] },
      { type: "NEED_RD_VERIFICATION", values: [true] },
      { type: "FFF_CHANGED", values: ["FORM"] },
    ],
    logic: "OR",
  },
};

export class NotificationService {
  async evaluateAndNotify(caseId: string) {
    const caseRecord = await prisma.pcnCaseMaster.findUniqueOrThrow({
      where: { id: caseId },
      include: {
        customer: true,
        ceAssessment: { include: { pcnEvent: { include: { aiAnalysis: true } } } },
      },
    });

    const customer = caseRecord.customer;
    const ruleSet = CUSTOMER_NOTIFICATION_RULES[customer.notificationRuleSet] ?? CUSTOMER_NOTIFICATION_RULES.FULL;
    const shouldNotify = this.evaluateRules(ruleSet, caseRecord);

    if (shouldNotify) {
      await prisma.notificationLog.create({
        data: {
          caseId,
          notificationType: "EMAIL",
          recipientEmail: customer.contactEmail ?? "",
          subject: `PCN Notification: ${caseRecord.ceAssessment.pcnEvent.pcnTitle}`,
          body: this.buildEmailBody(caseRecord),
          deliveryStatus: "PENDING",
        },
      });
      logger.info({ caseId, customerId: customer.id }, "Notification created");
    }

    return { caseId, shouldNotify, customerId: customer.id };
  }

  async getNotificationLog(caseId: string) {
    return prisma.notificationLog.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });
  }

  private evaluateRules(ruleSet: NotificationRuleSet, caseRecord: any): boolean {
    const aiResult = caseRecord.ceAssessment?.pcnEvent?.aiAnalysis;
    const pcnEvent = caseRecord.ceAssessment?.pcnEvent;
    if (!aiResult || !pcnEvent) return false;

    const results = ruleSet.conditions.map((cond) => {
      switch (cond.type) {
        case "ALWAYS":
          return true;
        case "PCN_TYPE":
          return cond.values?.includes(pcnEvent.pcnType) ?? false;
        case "RISK_LEVEL":
          return cond.values?.includes(aiResult.riskLevel) ?? false;
        case "FFF_CHANGED": {
          const changed: string[] = [];
          if (aiResult.formChanged) changed.push("FORM");
          if (aiResult.fitChanged) changed.push("FIT");
          if (aiResult.functionChanged) changed.push("FUNCTION");
          return changed.some((c) => cond.values?.includes(c));
        }
        case "NEED_RD_VERIFICATION":
          return caseRecord.ceAssessment?.needRdVerification === true;
        default:
          return false;
      }
    });

    return ruleSet.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
  }

  private buildEmailBody(caseRecord: any): string {
    const event = caseRecord.ceAssessment?.pcnEvent;
    const ai = event?.aiAnalysis;
    return [
      `PCN Number: ${event?.pcnNumber}`,
      `Vendor: ${event?.vendorName}`,
      `Type: ${event?.pcnType}`,
      `Risk Level: ${ai?.riskLevel}`,
      `Summary: ${ai?.summary}`,
      `Case Number: ${caseRecord.caseNumber}`,
    ].join("\n");
  }
}
