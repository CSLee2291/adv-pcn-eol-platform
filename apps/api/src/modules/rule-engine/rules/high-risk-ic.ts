import type { RuleContext, RuleResult } from "../rule.types.js";

export const highRiskIcRule = (ctx: RuleContext): RuleResult => {
  const isHighRisk =
    ctx.aiResult?.riskLevel === "HIGH" || ctx.aiResult?.riskLevel === "CRITICAL";
  const hasFunctionChange = ctx.aiResult?.functionChanged === true;
  const triggered = isHighRisk || hasFunctionChange;

  return {
    ruleName: "HIGH_RISK_IC",
    triggered,
    severity: triggered ? "WARNING" : "INFO",
    actions: triggered ? ["FLAG_HIGH_RISK", "REQUIRE_RD_VERIFICATION", "NOTIFY_PM"] : [],
    message: triggered
      ? `High risk IC: Risk=${ctx.aiResult?.riskLevel}, Function changed=${hasFunctionChange}`
      : "Normal risk level.",
  };
};
