export interface RuleContext {
  pcnEvent: any;
  aiResult: any;
  whereUsed?: any[];
}

export interface RuleResult {
  ruleName: string;
  triggered: boolean;
  severity: "INFO" | "WARNING" | "CRITICAL";
  actions: RuleAction[];
  message: string;
}

export type RuleAction =
  | "NOTIFY_PM"
  | "REQUIRE_RD_VERIFICATION"
  | "NOTIFY_CUSTOMER"
  | "LAST_TIME_BUY"
  | "FLAG_HIGH_RISK"
  | "AUTO_CLOSE";

export type RuleFunction = (ctx: RuleContext) => RuleResult;

export interface RuleEvaluationSummary {
  eventId: string;
  results: RuleResult[];
  executedActions: RuleAction[];
}
