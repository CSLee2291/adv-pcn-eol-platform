export interface NotificationCondition {
  type: "ALWAYS" | "PCN_TYPE" | "RISK_LEVEL" | "FFF_CHANGED" | "NEED_RD_VERIFICATION";
  values?: (string | boolean)[];
}

export interface NotificationRuleSet {
  conditions: NotificationCondition[];
  logic?: "AND" | "OR";
}

export interface NotificationResult {
  caseId: string;
  shouldNotify: boolean;
  customerId: string;
}
