import type { RuleContext, RuleResult } from "../rule.types.js";

export const eolRule = (ctx: RuleContext): RuleResult => {
  const isEol =
    ctx.aiResult?.riskLevel === "CRITICAL" &&
    (ctx.pcnEvent.pcnType === "EOL" || ctx.aiResult?.pcnType === "EOL");

  return {
    ruleName: "EOL_DETECTION",
    triggered: isEol,
    severity: isEol ? "CRITICAL" : "INFO",
    actions: isEol ? ["NOTIFY_PM", "LAST_TIME_BUY", "NOTIFY_CUSTOMER"] : [],
    message: isEol
      ? `EOL detected for PCN ${ctx.pcnEvent.pcnNumber}. Immediate action required.`
      : "Not an EOL event.",
  };
};
