import type { RuleContext, RuleResult } from "../rule.types.js";

export const notificationRule = (ctx: RuleContext): RuleResult => {
  const isEol = ctx.pcnEvent.pcnType === "EOL";
  const isHighRisk =
    ctx.aiResult?.riskLevel === "HIGH" || ctx.aiResult?.riskLevel === "CRITICAL";
  const hasFffChange =
    ctx.aiResult?.formChanged || ctx.aiResult?.fitChanged || ctx.aiResult?.functionChanged;

  const triggered = isEol || isHighRisk || hasFffChange;

  return {
    ruleName: "CUSTOMER_NOTIFICATION",
    triggered,
    severity: triggered ? "WARNING" : "INFO",
    actions: triggered ? ["NOTIFY_CUSTOMER"] : [],
    message: triggered
      ? `Customer notification triggered: EOL=${isEol}, HighRisk=${isHighRisk}, F/F/F=${hasFffChange}`
      : "No customer notification needed.",
  };
};
