import MsgReaderModule from "@kenjiuno/msgreader";
import { simpleParser } from "mailparser";

// Handle CJS default export in ESM
const MsgReader = (MsgReaderModule as any).default ?? MsgReaderModule;
import { logger } from "../../config/logger.js";

export interface ParsedEmail {
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  subject: string;
  date: Date;
  bodyText: string;
  bodyHtml: string;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
}

export class EmailParserService {
  /**
   * Auto-detect format by filename extension and parse accordingly.
   */
  async parse(buffer: Buffer, filename: string): Promise<ParsedEmail> {
    const ext = filename.toLowerCase().split(".").pop();
    if (ext === "msg") {
      return this.parseMsg(buffer);
    }
    if (ext === "eml") {
      return this.parseEml(buffer);
    }
    throw new Error(`Unsupported email format: .${ext}. Use .msg or .eml`);
  }

  /**
   * Parse Outlook .msg file
   */
  async parseMsg(buffer: Buffer): Promise<ParsedEmail> {
    const reader = new MsgReader(buffer);
    const fileData = reader.getFileData();

    const attachments: EmailAttachment[] = [];
    if (fileData.attachments) {
      for (const att of fileData.attachments) {
        const attData = reader.getAttachment(att);
        if (attData?.content) {
          attachments.push({
            filename: att.fileName ?? att.name ?? "attachment",
            contentType: att.mimeType ?? this.guessContentType(att.fileName ?? ""),
            size: attData.content.length,
            content: Buffer.from(attData.content),
          });
        }
      }
    }

    const result: ParsedEmail = {
      from: fileData.senderEmail ?? fileData.senderSmtpAddress ?? "",
      fromName: fileData.senderName ?? "",
      to: this.parseRecipients(fileData.recipients, "to"),
      cc: this.parseRecipients(fileData.recipients, "cc"),
      subject: fileData.subject ?? "",
      date: fileData.messageDeliveryTime
        ? new Date(fileData.messageDeliveryTime)
        : fileData.clientSubmitTime
          ? new Date(fileData.clientSubmitTime)
          : new Date(),
      bodyText: fileData.body ?? "",
      bodyHtml: fileData.bodyHtml ?? "",
      attachments,
    };

    logger.info(
      { from: result.from, subject: result.subject, attachments: attachments.length },
      "Parsed .msg file"
    );
    return result;
  }

  /**
   * Parse standard .eml (MIME) file
   */
  async parseEml(buffer: Buffer): Promise<ParsedEmail> {
    const parsed = await simpleParser(buffer);

    const attachments: EmailAttachment[] = (parsed.attachments ?? []).map((att) => ({
      filename: att.filename ?? "attachment",
      contentType: att.contentType ?? "application/octet-stream",
      size: att.size,
      content: att.content,
    }));

    const toAddrs: string[] = [];
    if (parsed.to) {
      const toArr = Array.isArray(parsed.to) ? parsed.to : [parsed.to];
      for (const t of toArr) {
        if (t.value) toAddrs.push(...t.value.map((v) => v.address ?? ""));
      }
    }

    const ccAddrs: string[] = [];
    if (parsed.cc) {
      const ccArr = Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc];
      for (const c of ccArr) {
        if (c.value) ccAddrs.push(...c.value.map((v) => v.address ?? ""));
      }
    }

    const fromAddr = parsed.from?.value?.[0]?.address ?? "";
    const fromName = parsed.from?.value?.[0]?.name ?? "";

    const result: ParsedEmail = {
      from: fromAddr,
      fromName,
      to: toAddrs.filter(Boolean),
      cc: ccAddrs.filter(Boolean),
      subject: parsed.subject ?? "",
      date: parsed.date ?? new Date(),
      bodyText: parsed.text ?? "",
      bodyHtml: parsed.html || "",
      attachments,
    };

    logger.info(
      { from: result.from, subject: result.subject, attachments: attachments.length },
      "Parsed .eml file"
    );
    return result;
  }

  private parseRecipients(
    recipients: any[] | undefined,
    type: "to" | "cc"
  ): string[] {
    if (!recipients) return [];
    return recipients
      .filter((r) => {
        if (type === "to") return r.recipType === 1 || r.recipType === undefined;
        return r.recipType === 2;
      })
      .map((r) => r.smtpAddress ?? r.email ?? r.name ?? "")
      .filter(Boolean);
  }

  private guessContentType(filename: string): string {
    const ext = filename.toLowerCase().split(".").pop();
    const map: Record<string, string> = {
      pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    return map[ext ?? ""] ?? "application/octet-stream";
  }
}
