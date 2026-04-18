/**
 * PCN/EOL Notification HTML Email Template
 * Corporate Advantech branding with risk indicators and affected parts table
 */

export interface PcnEmailData {
  // PCN Event
  pcnNumber: string;
  vendorName: string;
  pcnTitle: string;
  pcnType: string;
  effectiveDate?: string | null;
  receivedDate?: string;

  // AI Analysis
  summary: string;
  changeDescription: string;
  riskLevel: string;
  riskReason: string;
  formChanged: boolean;
  fitChanged: boolean;
  functionChanged: boolean;

  // AI Translation (Traditional Chinese)
  summaryZh?: string;
  changeDescriptionZh?: string;

  // Affected Parts
  affectedParts: { mpn: string; advPartNumber?: string; oldMpn?: string | null; newMpn?: string | null }[];

  // CE Assessment (optional)
  ceDecision?: string;
  ceAssessorName?: string;
  ceComments?: string;

  // Customer
  customerName?: string;

  // Platform URL
  platformUrl?: string;
}

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  LOW: { bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0" },
  MEDIUM: { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  HIGH: { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
  CRITICAL: { bg: "#FEF2F2", text: "#7F1D1D", border: "#FCA5A5" },
};

const FFF_BADGE = (label: string, changed: boolean) => `
  <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;
    background:${changed ? "#FEE2E2" : "#ECFDF5"};color:${changed ? "#991B1B" : "#065F46"};
    border:1px solid ${changed ? "#FECACA" : "#A7F3D0"};margin-right:4px;">
    ${label}: ${changed ? "Changed" : "OK"}
  </span>`;

const PCN_TYPE_LABELS: Record<string, string> = {
  PCN: "Product Change Notice",
  EOL: "End of Life",
  PDN: "Product Discontinuation",
  OTHER: "Other",
};

export function buildPcnNotificationEmail(data: PcnEmailData): { subject: string; html: string; text: string } {
  const risk = RISK_COLORS[data.riskLevel] ?? RISK_COLORS.MEDIUM;
  const pcnTypeLabel = PCN_TYPE_LABELS[data.pcnType] ?? data.pcnType;
  const platformLink = data.platformUrl ?? "http://localhost:5173";
  const effectiveDateStr = data.effectiveDate
    ? new Date(data.effectiveDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "Not specified";

  const subject = `[${data.riskLevel}] PCN ${data.pcnNumber} — ${data.vendorName} ${pcnTypeLabel}${data.customerName ? ` | ${data.customerName}` : ""}`;

  // Build affected parts table rows
  const partsRows = data.affectedParts.slice(0, 50).map((p) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-family:monospace;font-size:13px;">${p.mpn}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-family:monospace;font-size:13px;">${p.advPartNumber || "\u2014"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${p.newMpn || "\u2014"}</td>
    </tr>`).join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1E40AF,#3B82F6);padding:24px 32px;">
            <table width="100%"><tr>
              <td>
                <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Advantech</span>
                <span style="color:#93C5FD;font-size:14px;margin-left:8px;">CE Platform</span>
              </td>
              <td align="right">
                <span style="display:inline-block;padding:4px 14px;border-radius:16px;font-size:13px;font-weight:700;
                  background:${risk.bg};color:${risk.text};border:1px solid ${risk.border};">
                  ${data.riskLevel} RISK
                </span>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- PCN Title Bar -->
        <tr>
          <td style="background:#EFF6FF;padding:16px 32px;border-bottom:1px solid #DBEAFE;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;font-weight:600;">
              ${pcnTypeLabel}
            </p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#1E3A5F;">
              ${data.pcnNumber} &mdash; ${data.vendorName}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:24px 32px;">

          <!-- Key Info Grid -->
          <table width="100%" style="margin-bottom:20px;border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
            <tr style="background:#F9FAFB;">
              <td style="padding:10px 16px;width:50%;border-right:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;">
                <span style="font-size:11px;color:#6B7280;text-transform:uppercase;">Vendor</span><br>
                <span style="font-size:14px;font-weight:600;color:#111827;">${data.vendorName}</span>
              </td>
              <td style="padding:10px 16px;width:50%;border-bottom:1px solid #E5E7EB;">
                <span style="font-size:11px;color:#6B7280;text-transform:uppercase;">PCN Number</span><br>
                <span style="font-size:14px;font-weight:600;color:#111827;font-family:monospace;">${data.pcnNumber}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 16px;border-right:1px solid #E5E7EB;">
                <span style="font-size:11px;color:#6B7280;text-transform:uppercase;">Effective Date</span><br>
                <span style="font-size:14px;font-weight:600;color:#111827;">${effectiveDateStr}</span>
              </td>
              <td style="padding:10px 16px;">
                <span style="font-size:11px;color:#6B7280;text-transform:uppercase;">Form / Fit / Function</span><br>
                ${FFF_BADGE("Form", data.formChanged)}
                ${FFF_BADGE("Fit", data.fitChanged)}
                ${FFF_BADGE("Func", data.functionChanged)}
              </td>
            </tr>
          </table>

          <!-- AI Summary -->
          <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">
              AI Analysis Summary
            </h3>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;background:#F9FAFB;padding:12px 16px;border-radius:6px;border-left:3px solid #3B82F6;">
              ${data.summary}
            </p>
            ${data.summaryZh ? `
            <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#1E40AF;background:#EFF6FF;padding:10px 16px;border-radius:6px;border-left:3px solid #93C5FD;">
              ${data.summaryZh}
            </p>` : ""}
          </div>

          <!-- Change Description -->
          <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">
              Change Description
            </h3>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#4B5563;">
              ${data.changeDescription}
            </p>
            ${data.changeDescriptionZh ? `
            <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#1E40AF;">
              ${data.changeDescriptionZh}
            </p>` : ""}
          </div>

          <!-- Risk Reason -->
          <div style="margin-bottom:20px;padding:12px 16px;border-radius:6px;background:${risk.bg};border:1px solid ${risk.border};">
            <p style="margin:0;font-size:12px;font-weight:600;color:${risk.text};text-transform:uppercase;">Risk Assessment: ${data.riskLevel}</p>
            <p style="margin:4px 0 0;font-size:13px;color:${risk.text};">${data.riskReason}</p>
          </div>

          ${data.ceDecision ? `
          <!-- CE Assessment -->
          <div style="margin-bottom:20px;padding:12px 16px;border-radius:6px;background:#F0FDF4;border:1px solid #BBF7D0;">
            <p style="margin:0;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;">CE Assessment</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#166534;">Decision: ${data.ceDecision}</p>
            ${data.ceAssessorName ? `<p style="margin:2px 0 0;font-size:12px;color:#15803D;">Assessed by: ${data.ceAssessorName}</p>` : ""}
            ${data.ceComments ? `<p style="margin:4px 0 0;font-size:13px;color:#166534;">${data.ceComments}</p>` : ""}
          </div>
          ` : ""}

          <!-- Affected Parts -->
          <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">
              Affected Parts (${data.affectedParts.length})
            </h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
              <tr style="background:#1E40AF;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#FFFFFF;">MPN</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#FFFFFF;">Adv Part Number</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#FFFFFF;">Replacement</th>
              </tr>
              ${partsRows}
              ${data.affectedParts.length > 50 ? `
              <tr><td colspan="3" style="padding:8px 12px;text-align:center;font-size:12px;color:#6B7280;background:#F9FAFB;">
                ... and ${data.affectedParts.length - 50} more parts (see platform for full list)
              </td></tr>` : ""}
            </table>
          </div>

          <!-- Action Button -->
          <div style="text-align:center;margin:24px 0 8px;">
            <a href="${platformLink}" style="display:inline-block;padding:12px 32px;background:#1E40AF;color:#FFFFFF;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
              View Full Analysis on Platform
            </a>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.5;">
              This is an automated notification from the Advantech PCN/EOL Platform.
              ${data.customerName ? `Sent to: ${data.customerName}.` : ""}
              Please do not reply to this email. For questions, contact your CE representative.
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#D1D5DB;">
              Advantech Co., Ltd. &mdash; Component Engineering Division
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Plain text fallback
  const text = `
[${data.riskLevel} RISK] PCN ${data.pcnNumber} — ${data.vendorName} ${pcnTypeLabel}
${"=".repeat(60)}

Vendor: ${data.vendorName}
PCN Number: ${data.pcnNumber}
Type: ${pcnTypeLabel}
Effective Date: ${effectiveDateStr}
Form: ${data.formChanged ? "CHANGED" : "OK"} | Fit: ${data.fitChanged ? "CHANGED" : "OK"} | Function: ${data.functionChanged ? "CHANGED" : "OK"}

--- AI Analysis Summary ---
${data.summary}
${data.summaryZh ? `\n${data.summaryZh}` : ""}

--- Change Description ---
${data.changeDescription}
${data.changeDescriptionZh ? `\n${data.changeDescriptionZh}` : ""}

--- Risk Assessment: ${data.riskLevel} ---
${data.riskReason}
${data.ceDecision ? `
--- CE Assessment ---
Decision: ${data.ceDecision}
Assessor: ${data.ceAssessorName ?? "N/A"}
${data.ceComments ? `Comments: ${data.ceComments}` : ""}
` : ""}
--- Affected Parts (${data.affectedParts.length}) ---
${data.affectedParts.slice(0, 50).map((p) => `  ${p.mpn}${p.advPartNumber ? ` (${p.advPartNumber})` : ""}${p.newMpn ? ` -> ${p.newMpn}` : ""}`).join("\n")}
${data.affectedParts.length > 50 ? `  ... and ${data.affectedParts.length - 50} more` : ""}

View full analysis: ${platformLink}
---
Advantech CE Platform — Automated Notification
`.trim();

  return { subject, html, text };
}
