// === Enums ===
export type PcnType = "PCN" | "EOL" | "PDN" | "OTHER";
export type EventStatus = "PENDING_REVIEW" | "PENDING" | "AI_ANALYZED" | "CE_REVIEWED" | "WHERE_USED_DONE" | "NOTIFIED" | "CLOSED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CeDecision = "ACCEPT" | "REJECT" | "NEED_EVALUATION" | "LAST_TIME_BUY";
export type CaseStatus = "OPEN" | "IN_PROGRESS" | "WAITING_RD" | "WAITING_CUSTOMER" | "CLOSED";

// === API Response Types ===
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: { page?: number; pageSize?: number; total?: number };
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

// === PCN Event ===
export interface PcnEvent {
  id: string;
  notificationSource: string;
  receivedDate: string;
  vendorName: string;
  distributorName: string | null;
  pcnNumber: string;
  pcnTitle: string;
  pcnType: PcnType;
  effectiveDate: string | null;
  ceOwnerName: string | null;
  ceNotifiedDate: string | null;
  ceReplyDate: string | null;
  ceComment: string | null;
  pmNotified: boolean;
  completionDate: string | null;
  followUpNotes: string | null;
  changeTypeForIqc: string | null;
  additionalNotes: string | null;
  sharePointFolder: string | null;
  sharePointUrl: string | null;
  userAddedMpns?: string[] | null;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
  aiAnalysis?: AiAnalysisResult;
}

// === AI Analysis ===
export interface AiAnalysisResult {
  id: string;
  pcnEventId: string;
  summary: string;
  changeDescription: string;
  formChanged: boolean;
  fitChanged: boolean;
  functionChanged: boolean;
  riskLevel: RiskLevel;
  riskReason: string | null;
  affectedParts: AffectedPart[];
  aiModelVersion: string;
  confidence: number;
  analyzedAt: string;
}

export interface AffectedPart {
  mpn: string;
  oldMpn?: string | null;
  newMpn?: string | null;
}

// === Dashboard KPI ===
export interface DashboardKpi {
  activePcns: number;
  eolAlerts: number;
  highRisk: number;
  pendingReview: number;
  avgResolutionDays: number;
  aiAccuracy: number;
  totalCompleted: number;
  aiAnalyzed: number;
}
