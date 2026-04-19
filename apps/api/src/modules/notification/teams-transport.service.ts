import axios from "axios";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { PcnEmailData } from "./email-templates/pcn-notification.js";

export interface TeamsCardResult {
  success: boolean;
  error?: string;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "good",         // green
  MEDIUM: "warning",   // yellow
  HIGH: "attention",   // red
  CRITICAL: "attention",
};

const RISK_HEX: Record<string, string> = {
  LOW: "#22C55E",
  MEDIUM: "#F59E0B",
  HIGH: "#EF4444",
  CRITICAL: "#DC2626",
};

export class TeamsTransportService {
  private webhookUrl: string | null;

  constructor() {
    if (!env.TEAMS_NOTIFICATION_ENABLED || !env.TEAMS_WEBHOOK_URL) {
      this.webhookUrl = null;
      logger.info("Teams transport: DISABLED");
    } else {
      this.webhookUrl = env.TEAMS_WEBHOOK_URL;
      logger.info("Teams transport: ENABLED");
    }
  }

  /** Send an Adaptive Card to the Teams channel */
  async sendCard(card: any): Promise<TeamsCardResult> {
    if (!this.webhookUrl) {
      logger.info("Teams card NOT sent (disabled)");
      return { success: true };
    }

    try {
      await axios.post(this.webhookUrl, card, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });
      logger.info("Teams card sent successfully");
      return { success: true };
    } catch (err: any) {
      logger.error({ error: err.message }, "Teams card send failed");
      return { success: false, error: err.message };
    }
  }

  /** Build a PCN notification Adaptive Card */
  buildPcnNotificationCard(data: PcnEmailData, platformUrl?: string): any {
    const riskColor = RISK_COLORS[data.riskLevel] ?? "default";
    const riskHex = RISK_HEX[data.riskLevel] ?? "#6B7280";
    const viewUrl = platformUrl ?? data.platformUrl ?? "http://localhost:5173";

    const fffText = [
      `Form: ${data.formChanged ? "**Changed**" : "OK"}`,
      `Fit: ${data.fitChanged ? "**Changed**" : "OK"}`,
      `Func: ${data.functionChanged ? "**Changed**" : "OK"}`,
    ].join(" | ");

    const topParts = data.affectedParts.slice(0, 5).map((p) => p.mpn).join(", ");
    const partsNote = data.affectedParts.length > 5
      ? ` (+${data.affectedParts.length - 5} more)`
      : "";

    return {
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            // Header
            {
              type: "ColumnSet",
              columns: [
                {
                  type: "Column",
                  width: "stretch",
                  items: [{
                    type: "TextBlock",
                    text: `PCN ${data.pcnNumber}`,
                    weight: "Bolder",
                    size: "Large",
                    color: "Default",
                  }],
                },
                {
                  type: "Column",
                  width: "auto",
                  items: [{
                    type: "TextBlock",
                    text: `⬤ ${data.riskLevel}`,
                    weight: "Bolder",
                    color: riskColor,
                    horizontalAlignment: "Right",
                  }],
                },
              ],
            },
            // Vendor + Type
            {
              type: "TextBlock",
              text: `**${data.vendorName}** — ${data.pcnType}`,
              spacing: "Small",
              isSubtle: true,
            },
            // Divider
            {
              type: "TextBlock",
              text: "───────────────────────",
              spacing: "Small",
              isSubtle: true,
              size: "Small",
            },
            // Summary
            {
              type: "TextBlock",
              text: "**AI Analysis Summary**",
              spacing: "Medium",
              weight: "Bolder",
              size: "Small",
            },
            {
              type: "TextBlock",
              text: data.summary,
              wrap: true,
              spacing: "Small",
            },
            // Chinese translation
            ...(data.summaryZh ? [{
              type: "TextBlock" as const,
              text: data.summaryZh,
              wrap: true,
              spacing: "Small" as const,
              color: "Accent" as const,
            }] : []),
            // F/F/F
            {
              type: "TextBlock",
              text: fffText,
              spacing: "Medium",
              size: "Small",
            },
            // Affected parts
            {
              type: "FactSet",
              spacing: "Medium",
              facts: [
                { title: "Affected Parts:", value: `${data.affectedParts.length}` },
                { title: "MPNs:", value: `${topParts}${partsNote}` },
                ...(data.effectiveDate ? [{ title: "Effective Date:", value: new Date(data.effectiveDate).toLocaleDateString("en-US") }] : []),
                ...(data.ceDecision ? [{ title: "CE Decision:", value: `${data.ceDecision} (${data.ceAssessorName ?? ""})` }] : []),
              ],
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View on Platform",
              url: viewUrl,
              style: "positive",
            },
          ],
        },
      }],
    };
  }

  /** Build an RD verification task card */
  buildRdVerificationCard(data: {
    pcnNumber: string;
    vendorName: string;
    riskLevel: string;
    assignedRdName: string;
    assignedRdEmail: string;
    assignedBy: string;
    priority: string;
    affectedPartsCount: number;
    summary: string;
    platformUrl: string;
  }): any {
    return {
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: "🔬 RD Verification Required",
              weight: "Bolder",
              size: "Large",
              color: "Attention",
            },
            {
              type: "TextBlock",
              text: `PCN **${data.pcnNumber}** — ${data.vendorName}`,
              spacing: "Small",
            },
            {
              type: "FactSet",
              spacing: "Medium",
              facts: [
                { title: "Assigned RD:", value: data.assignedRdName },
                { title: "Assigned By:", value: data.assignedBy },
                { title: "Priority:", value: data.priority },
                { title: "Risk Level:", value: data.riskLevel },
                { title: "Affected Parts:", value: `${data.affectedPartsCount}` },
              ],
            },
            {
              type: "TextBlock",
              text: data.summary,
              wrap: true,
              spacing: "Medium",
              isSubtle: true,
            },
            {
              type: "TextBlock",
              text: `<at>${data.assignedRdEmail}</at> — please review and respond on the platform.`,
              wrap: true,
              spacing: "Medium",
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View & Respond",
              url: data.platformUrl,
              style: "positive",
            },
          ],
        },
      }],
    };
  }

  /** Build a simple status update card */
  buildStatusUpdateCard(title: string, message: string, color: string = "default"): any {
    return {
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: title, weight: "Bolder", color },
            { type: "TextBlock", text: message, wrap: true, spacing: "Small" },
          ],
        },
      }],
    };
  }

  getStatus() {
    return {
      enabled: env.TEAMS_NOTIFICATION_ENABLED,
      configured: !!this.webhookUrl,
    };
  }
}

// Singleton
let instance: TeamsTransportService | null = null;
export function getTeamsTransport(): TeamsTransportService {
  if (!instance) instance = new TeamsTransportService();
  return instance;
}
