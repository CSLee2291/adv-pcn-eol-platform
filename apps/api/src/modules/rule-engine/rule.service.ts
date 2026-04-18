import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { eolRule } from "./rules/eol-rule.js";
import { highRiskIcRule } from "./rules/high-risk-ic.js";
import { rdVerificationRule } from "./rules/rd-verification.js";
import { notificationRule } from "./rules/notification-rule.js";
import type { RuleContext, RuleAction, RuleEvaluationSummary, RuleFunction } from "./rule.types.js";

export class RuleEngineService {
  private rules: RuleFunction[] = [eolRule, highRiskIcRule, rdVerificationRule, notificationRule];

  async evaluate(eventId: string): Promise<RuleEvaluationSummary> {
    const ctx = await this.buildContext(eventId);
    const results = this.rules.map((rule) => rule(ctx));
    const allActions = results.filter((r) => r.triggered).flatMap((r) => r.actions);
    const uniqueActions = [...new Set(allActions)] as RuleAction[];

    await this.executeActions(eventId, uniqueActions);

    logger.info(
      { eventId, triggered: results.filter((r) => r.triggered).map((r) => r.ruleName), actions: uniqueActions },
      "Rule engine evaluation completed"
    );

    return { eventId, results, executedActions: uniqueActions };
  }

  private async buildContext(eventId: string): Promise<RuleContext> {
    const pcnEvent = await prisma.pcnEventMaster.findUniqueOrThrow({
      where: { id: eventId },
      include: { aiAnalysis: true, ceAssessments: { include: { whereUsedResults: true } } },
    });

    return {
      pcnEvent,
      aiResult: pcnEvent.aiAnalysis,
      whereUsed: pcnEvent.ceAssessments.flatMap((a) => a.whereUsedResults),
    };
  }

  private async executeActions(eventId: string, actions: RuleAction[]) {
    if (actions.includes("NOTIFY_PM")) {
      await prisma.pcnEventMaster.update({ where: { id: eventId }, data: { pmNotified: true } });
    }
    // Other actions will be implemented as modules mature
  }
}
