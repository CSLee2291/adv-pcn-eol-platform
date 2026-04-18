// Risk level display config
export const RISK_LEVEL_CONFIG = {
  LOW: { label: "LOW", color: "#22C55E", bgColor: "#F0FDF4", textColor: "#166534" },
  MEDIUM: { label: "MEDIUM", color: "#F59E0B", bgColor: "#FFFBEB", textColor: "#92400E" },
  HIGH: { label: "HIGH", color: "#EF4444", bgColor: "#FEF2F2", textColor: "#991B1B" },
  CRITICAL: { label: "CRITICAL", color: "#991B1B", bgColor: "#7F1D1D", textColor: "#FFFFFF" },
} as const;

// PCN type labels
export const PCN_TYPE_LABELS: Record<string, string> = {
  PCN: "Product Change Notice",
  EOL: "End of Life",
  PDN: "Product Discontinuation Notice",
  OTHER: "Other",
};

// Event status labels
export const EVENT_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Pending Review",
  PENDING: "Pending",
  AI_ANALYZED: "AI Analyzed",
  CE_REVIEWED: "CE Reviewed",
  WHERE_USED_DONE: "Where-Used Complete",
  NOTIFIED: "Notified",
  CLOSED: "Closed",
};

// CE decision labels
export const CE_DECISION_LABELS: Record<string, string> = {
  ACCEPT: "Accept",
  REJECT: "Reject",
  NEED_EVALUATION: "Need Evaluation",
  LAST_TIME_BUY: "Last Time Buy",
};
