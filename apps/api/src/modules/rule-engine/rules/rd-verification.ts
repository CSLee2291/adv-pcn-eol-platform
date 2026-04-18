import type { RuleContext, RuleResult } from "../rule.types.js";

export const rdVerificationRule = (ctx: RuleContext): RuleResult => {
  const functionChanged = ctx.aiResult?.functionChanged === true;
  const formChanged = ctx.aiResult?.formChanged === true;
  const triggered = functionChanged || (formChanged && ctx.aiResult?.riskLevel !== "LOW");

  return {
    ruleName: "RD_VERIFICATION_REQUIRED",
    triggered,
    severity: triggered ? "WARNING" : "INFO",
    actions: triggered ? ["REQUIRE_RD_VERIFICATION"] : [],
    message: triggered
      ? `RD verification required: Function changed=${functionChanged}, Form changed=${formChanged}`
      : "No RD verification needed.",
  };
};
