import { describe, it, expect } from "vitest";
import { eolRule } from "./eol-rule.js";
import { highRiskIcRule } from "./high-risk-ic.js";
import { rdVerificationRule } from "./rd-verification.js";
import { notificationRule } from "./notification-rule.js";
import type { RuleContext } from "../rule.types.js";

function makeCtx(overrides: {
  pcnType?: string;
  riskLevel?: string;
  formChanged?: boolean;
  fitChanged?: boolean;
  functionChanged?: boolean;
}): RuleContext {
  return {
    pcnEvent: { pcnType: overrides.pcnType ?? "PCN", pcnNumber: "TEST-001" },
    aiResult: {
      riskLevel: overrides.riskLevel ?? "LOW",
      formChanged: overrides.formChanged ?? false,
      fitChanged: overrides.fitChanged ?? false,
      functionChanged: overrides.functionChanged ?? false,
    },
    whereUsed: [],
  };
}

// ==================== EOL Rule ====================
describe("eolRule", () => {
  it("should NOT trigger for non-EOL, non-CRITICAL events", () => {
    const result = eolRule(makeCtx({ pcnType: "PCN", riskLevel: "LOW" }));
    expect(result.triggered).toBe(false);
    expect(result.severity).toBe("INFO");
    expect(result.actions).toEqual([]);
  });

  it("should NOT trigger for EOL with LOW risk", () => {
    const result = eolRule(makeCtx({ pcnType: "EOL", riskLevel: "LOW" }));
    expect(result.triggered).toBe(false);
  });

  it("should NOT trigger for CRITICAL risk with non-EOL type", () => {
    const result = eolRule(makeCtx({ pcnType: "PCN", riskLevel: "CRITICAL" }));
    expect(result.triggered).toBe(false);
  });

  it("should trigger for EOL + CRITICAL risk", () => {
    const result = eolRule(makeCtx({ pcnType: "EOL", riskLevel: "CRITICAL" }));
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("CRITICAL");
    expect(result.actions).toContain("NOTIFY_PM");
    expect(result.actions).toContain("LAST_TIME_BUY");
    expect(result.actions).toContain("NOTIFY_CUSTOMER");
  });

  it("should trigger when aiResult.pcnType is EOL and CRITICAL", () => {
    const ctx = makeCtx({ riskLevel: "CRITICAL" });
    ctx.aiResult.pcnType = "EOL";
    const result = eolRule(ctx);
    expect(result.triggered).toBe(true);
  });
});

// ==================== High Risk IC Rule ====================
describe("highRiskIcRule", () => {
  it("should NOT trigger for LOW risk, no function change", () => {
    const result = highRiskIcRule(makeCtx({ riskLevel: "LOW" }));
    expect(result.triggered).toBe(false);
    expect(result.actions).toEqual([]);
  });

  it("should trigger for HIGH risk", () => {
    const result = highRiskIcRule(makeCtx({ riskLevel: "HIGH" }));
    expect(result.triggered).toBe(true);
    expect(result.severity).toBe("WARNING");
    expect(result.actions).toContain("FLAG_HIGH_RISK");
    expect(result.actions).toContain("REQUIRE_RD_VERIFICATION");
    expect(result.actions).toContain("NOTIFY_PM");
  });

  it("should trigger for CRITICAL risk", () => {
    const result = highRiskIcRule(makeCtx({ riskLevel: "CRITICAL" }));
    expect(result.triggered).toBe(true);
  });

  it("should trigger for function change even with LOW risk", () => {
    const result = highRiskIcRule(makeCtx({ riskLevel: "LOW", functionChanged: true }));
    expect(result.triggered).toBe(true);
    expect(result.actions).toContain("FLAG_HIGH_RISK");
  });

  it("should NOT trigger for MEDIUM risk without function change", () => {
    const result = highRiskIcRule(makeCtx({ riskLevel: "MEDIUM" }));
    expect(result.triggered).toBe(false);
  });
});

// ==================== RD Verification Rule ====================
describe("rdVerificationRule", () => {
  it("should NOT trigger for no F/F/F changes", () => {
    const result = rdVerificationRule(makeCtx({}));
    expect(result.triggered).toBe(false);
  });

  it("should trigger for function change", () => {
    const result = rdVerificationRule(makeCtx({ functionChanged: true }));
    expect(result.triggered).toBe(true);
    expect(result.actions).toContain("REQUIRE_RD_VERIFICATION");
  });

  it("should trigger for form change + non-LOW risk", () => {
    const result = rdVerificationRule(makeCtx({ formChanged: true, riskLevel: "MEDIUM" }));
    expect(result.triggered).toBe(true);
  });

  it("should NOT trigger for form change + LOW risk", () => {
    const result = rdVerificationRule(makeCtx({ formChanged: true, riskLevel: "LOW" }));
    expect(result.triggered).toBe(false);
  });

  it("should NOT trigger for fit change only (no form/function)", () => {
    const result = rdVerificationRule(makeCtx({ fitChanged: true }));
    expect(result.triggered).toBe(false);
  });
});

// ==================== Notification Rule ====================
describe("notificationRule", () => {
  it("should NOT trigger for LOW risk, no F/F/F, non-EOL", () => {
    const result = notificationRule(makeCtx({}));
    expect(result.triggered).toBe(false);
    expect(result.actions).toEqual([]);
  });

  it("should trigger for EOL type", () => {
    const result = notificationRule(makeCtx({ pcnType: "EOL" }));
    expect(result.triggered).toBe(true);
    expect(result.actions).toContain("NOTIFY_CUSTOMER");
  });

  it("should trigger for HIGH risk", () => {
    const result = notificationRule(makeCtx({ riskLevel: "HIGH" }));
    expect(result.triggered).toBe(true);
  });

  it("should trigger for CRITICAL risk", () => {
    const result = notificationRule(makeCtx({ riskLevel: "CRITICAL" }));
    expect(result.triggered).toBe(true);
  });

  it("should trigger for any F/F/F change", () => {
    expect(notificationRule(makeCtx({ formChanged: true })).triggered).toBe(true);
    expect(notificationRule(makeCtx({ fitChanged: true })).triggered).toBe(true);
    expect(notificationRule(makeCtx({ functionChanged: true })).triggered).toBe(true);
  });

  it("should NOT trigger for MEDIUM risk without F/F/F", () => {
    const result = notificationRule(makeCtx({ riskLevel: "MEDIUM" }));
    expect(result.triggered).toBe(false);
  });
});

// ==================== Cross-rule Integration ====================
describe("Rule Engine Integration", () => {
  const allRules = [eolRule, highRiskIcRule, rdVerificationRule, notificationRule];

  it("LOW risk, no changes → all rules PASS (no triggers)", () => {
    const ctx = makeCtx({ riskLevel: "LOW" });
    const results = allRules.map((r) => r(ctx));
    expect(results.every((r) => !r.triggered)).toBe(true);
  });

  it("MEDIUM risk + formChanged → RD verification + notification triggered", () => {
    const ctx = makeCtx({ riskLevel: "MEDIUM", formChanged: true });
    const results = allRules.map((r) => r(ctx));
    const triggered = results.filter((r) => r.triggered).map((r) => r.ruleName);
    expect(triggered).toContain("RD_VERIFICATION_REQUIRED");
    expect(triggered).toContain("CUSTOMER_NOTIFICATION");
    expect(triggered).not.toContain("EOL_DETECTION");
    expect(triggered).not.toContain("HIGH_RISK_IC");
  });

  it("CRITICAL + EOL → all rules triggered", () => {
    const ctx = makeCtx({ pcnType: "EOL", riskLevel: "CRITICAL", functionChanged: true });
    const results = allRules.map((r) => r(ctx));
    expect(results.every((r) => r.triggered)).toBe(true);
    const allActions = results.flatMap((r) => r.actions);
    expect(allActions).toContain("NOTIFY_PM");
    expect(allActions).toContain("LAST_TIME_BUY");
    expect(allActions).toContain("NOTIFY_CUSTOMER");
    expect(allActions).toContain("FLAG_HIGH_RISK");
    expect(allActions).toContain("REQUIRE_RD_VERIFICATION");
  });
});
