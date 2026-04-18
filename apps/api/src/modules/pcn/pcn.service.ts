import type { MultipartFile } from "@fastify/multipart";
import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import fs from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { EmailParserService, type ParsedEmail } from "../email-ingest/email-parser.service.js";

export class PcnService {
  async uploadPcn(file: MultipartFile) {
    // Save file locally (or to Azure Blob in staging/production)
    const buffer = await file.toBuffer();
    const uploadDir = env.LOCAL_UPLOAD_DIR;
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `${Date.now()}_${file.filename}`;
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    // Extract text from PDF
    let rawText = "";
    try {
      const pdfData = await pdfParse(buffer);
      rawText = pdfData.text;
    } catch (err) {
      logger.warn({ err, filename }, "PDF text extraction failed");
    }

    // Try to extract vendor name and PCN number from text
    const vendorName = this.extractVendor(rawText) ?? "UNKNOWN";
    const pcnNumber = this.extractPcnNumber(rawText) ?? `MANUAL-${Date.now()}`;

    // Create or update PCN event record (upsert to handle duplicate PCN numbers)
    const pdfEventData = {
      notificationSource: "MANUAL_UPLOAD",
      receivedDate: new Date(),
      vendorName,
      pcnNumber,
      pcnTitle: file.filename,
      pcnType: "OTHER" as const,
      pdfFilePath: filePath,
      rawText,
      status: "PENDING" as const,
    };

    const event = await prisma.pcnEventMaster.upsert({
      where: { pcnNumber },
      create: pdfEventData,
      update: {
        ...pdfEventData,
        updatedAt: new Date(),
      },
    });

    logger.info({ eventId: event.id, filename }, "PCN event created from upload");
    return event;
  }

  async listEvents(opts: { page: number; pageSize: number; status?: string }) {
    const where = opts.status ? { status: opts.status as any } : {};
    const [data, total] = await Promise.all([
      prisma.pcnEventMaster.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: { aiAnalysis: true },
      }),
      prisma.pcnEventMaster.count({ where }),
    ]);
    return { data, meta: { page: opts.page, pageSize: opts.pageSize, total } };
  }

  async getEventById(id: string) {
    return prisma.pcnEventMaster.findUnique({
      where: { id },
      include: {
        aiAnalysis: true,
        ceAssessments: { include: { whereUsedResults: true } },
      },
    });
  }

  async uploadEmail(file: MultipartFile) {
    const emailParser = new EmailParserService();
    const buffer = await file.toBuffer();
    const parsed = await emailParser.parse(buffer, file.filename);

    // Save the original email file
    const uploadDir = env.LOCAL_UPLOAD_DIR;
    await fs.mkdir(uploadDir, { recursive: true });
    const emailFilename = `${Date.now()}_${file.filename}`;
    await fs.writeFile(path.join(uploadDir, emailFilename), buffer);

    // Extract and save attachments (PDF + Excel + CSV + ZIP), extract text from each
    const pdfTexts: string[] = [];
    const excelTexts: string[] = [];
    const savedAttachments: string[] = [];

    // Collect all files to process (including contents extracted from .zip)
    const filesToProcess: { filename: string; content: Buffer; contentType?: string }[] = parsed.attachments.map((a) => ({
      filename: a.filename, content: a.content, contentType: a.contentType,
    }));

    // First pass: extract .zip archives into filesToProcess
    for (const att of parsed.attachments) {
      if (att.filename.toLowerCase().endsWith(".zip")) {
        try {
          const zip = new AdmZip(Buffer.from(att.content));
          for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue;
            const name = entry.entryName.split("/").pop() ?? entry.entryName;
            filesToProcess.push({ filename: name, content: entry.getData() });
          }
          logger.info({ filename: att.filename, extracted: zip.getEntries().length }, "ZIP attachment extracted");
        } catch (err) {
          logger.warn({ filename: att.filename, error: (err as Error).message }, "ZIP extraction failed");
        }
      }
    }

    // Second pass: process all files (direct attachments + extracted from zip)
    for (const file of filesToProcess) {
      const lowerName = file.filename.toLowerCase();

      if (lowerName.endsWith(".pdf")) {
        const pdfFilename = `${Date.now()}_${file.filename}`;
        const pdfPath = path.join(uploadDir, pdfFilename);
        await fs.writeFile(pdfPath, file.content);
        savedAttachments.push(pdfPath);

        try {
          const pdfData = await pdfParse(file.content);
          pdfTexts.push(pdfData.text);
        } catch (err) {
          logger.warn({ filename: file.filename }, "PDF text extraction failed");
        }
      } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        try {
          const excelText = await this.extractExcelText(file.content, file.filename);
          if (excelText) excelTexts.push(excelText);
          const xlsFilename = `${Date.now()}_${file.filename}`;
          await fs.writeFile(path.join(uploadDir, xlsFilename), file.content);
          savedAttachments.push(path.join(uploadDir, xlsFilename));
          logger.info({ filename: file.filename }, "Excel attachment parsed");
        } catch (err) {
          logger.warn({ filename: file.filename, error: (err as Error).message }, "Excel parsing failed");
        }
      } else if (lowerName.endsWith(".csv")) {
        try {
          const csvText = this.extractCsvText(file.content, file.filename);
          if (csvText) excelTexts.push(csvText);
          const csvFilename = `${Date.now()}_${file.filename}`;
          await fs.writeFile(path.join(uploadDir, csvFilename), file.content);
          savedAttachments.push(path.join(uploadDir, csvFilename));
          logger.info({ filename: file.filename }, "CSV attachment parsed");
        } catch (err) {
          logger.warn({ filename: file.filename, error: (err as Error).message }, "CSV parsing failed");
        }
      }
      // .zip files are handled in the first pass — skip here
    }

    // Merge email body + PDF texts + Excel texts
    const rawText = [parsed.bodyText, ...pdfTexts, ...excelTexts].filter(Boolean).join("\n\n---\n\n");

    // Extract vendor: structured Brand field → subject → sender domain → body text
    const vendorName = this.extractBrandFromStructuredFields(parsed.bodyText ?? "")
      ?? this.extractVendor(parsed.subject)
      ?? this.extractVendorFromEmail(parsed)
      ?? this.extractVendor(rawText)
      ?? "UNKNOWN";

    // Extract PCN number: structured email body fields first (most reliable), then subject, then free text
    const pcnNumber = this.extractPcnFromStructuredFields(parsed.bodyText ?? "")
      ?? this.extractPcnNumber(parsed.subject)
      ?? this.extractPcnNumber(rawText)
      ?? `EMAIL-${Date.now()}`;

    // Build recipients note
    const recipientsNote = [
      parsed.to.length ? `To: ${parsed.to.join(", ")}` : "",
      parsed.cc.length ? `CC: ${parsed.cc.join(", ")}` : "",
    ].filter(Boolean).join("\n");

    const eventData = {
      notificationSource: "EMAIL_UPLOAD",
      receivedDate: parsed.date,
      vendorName,
      pcnNumber,
      pcnTitle: parsed.subject || file.filename,
      pcnType: "OTHER" as const,
      sourceEmail: parsed.from,
      pdfFilePath: savedAttachments[0] ?? null,
      rawText,
      additionalNotes: recipientsNote || null,
      status: "PENDING_REVIEW" as const,
    };

    const event = await prisma.pcnEventMaster.upsert({
      where: { pcnNumber },
      create: eventData,
      update: {
        ...eventData,
        updatedAt: new Date(),
      },
    });

    logger.info(
      { eventId: event.id, from: parsed.from, subject: parsed.subject, pdfs: savedAttachments.length },
      "PCN event created from email upload"
    );

    return {
      ...event,
      emailPreview: {
        from: parsed.from,
        fromName: parsed.fromName,
        to: parsed.to,
        cc: parsed.cc,
        subject: parsed.subject,
        date: parsed.date,
        attachmentCount: parsed.attachments.length,
        pdfCount: savedAttachments.length,
      },
    };
  }

  async approveEvent(id: string) {
    const event = await prisma.pcnEventMaster.findUnique({ where: { id } });
    if (!event) throw new Error("Event not found");
    if (event.status !== "PENDING_REVIEW") {
      throw new Error(`Cannot approve event with status ${event.status}`);
    }

    return prisma.pcnEventMaster.update({
      where: { id },
      data: { status: "PENDING" },
    });
  }

  async updateEvent(id: string, data: Record<string, unknown>) {
    return prisma.pcnEventMaster.update({ where: { id }, data: data as any });
  }

  async createCeAssessment(eventId: string, input: {
    assessorName: string;
    ceDecision: "ACCEPT" | "REJECT" | "NEED_EVALUATION" | "LAST_TIME_BUY";
    comments?: string;
    overrideRiskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    needRdVerification?: boolean;
  }) {
    const event = await prisma.pcnEventMaster.findUnique({ where: { id: eventId } });
    if (!event) throw new Error("Event not found");

    const assessment = await prisma.ceAssessment.create({
      data: {
        pcnEventId: eventId,
        assessorId: input.assessorName.toLowerCase().replace(/\s+/g, "."),
        assessorName: input.assessorName,
        ceDecision: input.ceDecision,
        comments: input.comments ?? null,
        overrideRiskLevel: input.overrideRiskLevel ?? null,
        needRdVerification: input.needRdVerification ?? false,
      },
    });

    // Update event status
    await prisma.pcnEventMaster.update({
      where: { id: eventId },
      data: { status: "CE_REVIEWED" },
    });

    logger.info({ eventId, decision: input.ceDecision, assessor: input.assessorName }, "CE assessment created");
    return assessment;
  }

  async getCeAssessments(eventId: string) {
    return prisma.ceAssessment.findMany({
      where: { pcnEventId: eventId },
      orderBy: { assessedAt: "desc" },
    });
  }

  /**
   * Extract text content from Excel attachments (.xlsx).
   * Handles distributor MPN lists (WPI, Arrow, Avnet, etc.)
   * Returns structured text with headers and rows for AI analysis.
   */
  private async extractExcelText(content: Buffer, filename: string): Promise<string | null> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(content);

    const sections: string[] = [`[Excel Attachment: ${filename}]`];

    for (const ws of wb.worksheets) {
      if (ws.rowCount === 0) continue;

      const headers: string[] = [];
      const rows: string[] = [];

      ws.eachRow((row, rowNum) => {
        const values = row.values as (string | number | null)[];
        // Skip the first element (ExcelJS uses 1-based indexing, values[0] is empty)
        const cells = values.slice(1).map((v) =>
          v == null ? "" : typeof v === "object" ? String(v) : String(v)
        );
        if (rowNum === 1) {
          headers.push(...cells);
          rows.push(cells.join("\t"));
        } else {
          rows.push(cells.join("\t"));
        }
      });

      if (rows.length > 0) {
        sections.push(`Sheet: ${ws.name} (${rows.length - 1} data rows)`);
        sections.push(rows.join("\n"));
      }
    }

    const text = sections.join("\n");
    logger.info({ filename, chars: text.length, sheets: wb.worksheets.length }, "Excel text extracted");
    return text.length > 50 ? text : null;
  }

  /**
   * Extract text from CSV attachments (e.g., Avnet distributor MPN lists).
   */
  private extractCsvText(content: Buffer, filename: string): string | null {
    const text = content.toString("utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;

    const result = [`[CSV Attachment: ${filename}]`, `Rows: ${lines.length - 1}`, ...lines].join("\n");
    logger.info({ filename, rows: lines.length - 1 }, "CSV text extracted");
    return result;
  }

  private extractVendorFromEmail(parsed: ParsedEmail): string | null {
    // Try matching sender domain to known vendors
    const domain = parsed.from.split("@")[1]?.toLowerCase() ?? "";
    const domainMap: Record<string, string> = {
      "ti.com": "Texas Instruments",
      "infineon.com": "Infineon",
      "nxp.com": "NXP",
      "st.com": "STMicroelectronics",
      "microchip.com": "Microchip",
      "analog.com": "Analog Devices",
      "onsemi.com": "onsemi",
      "renesas.com": "Renesas",
      "rohm.com": "ROHM",
      "murata.com": "Murata",
      "tdk.com": "TDK",
      "vishay.com": "Vishay",
      "nexperia.com": "Nexperia",
      "broadcom.com": "Broadcom",
      "intel.com": "Intel",
      "diodes.com": "Diodes Incorporated",
      "samsung.com": "Samsung",
      "avnet.info": "Avnet (Distributor)",
      "avnet.com": "Avnet (Distributor)",
      "wtmec.com": "WTMec (Distributor)",
      "arrow.com": "Arrow (Distributor)",
      "mouser.com": "Mouser (Distributor)",
      "digikey.com": "DigiKey (Distributor)",
    };
    for (const [d, v] of Object.entries(domainMap)) {
      if (domain.includes(d)) return v;
    }
    // Also try fromName
    if (parsed.fromName) {
      const vendor = this.extractVendor(parsed.fromName);
      if (vendor) return vendor;
    }
    return null;
  }

  private extractVendor(text: string): string | null {
    // Full names first (longer = more specific = less false positives)
    const fullNames = [
      "Texas Instruments", "Analog Devices", "ON Semiconductor",
      "STMicroelectronics", "Diodes Incorporated",
      "Advanced Micro Devices", "Advanced Micro D",
      "Infineon", "NXP", "Microchip", "onsemi",
      "Renesas", "ROHM", "Murata", "TDK",
      "Samsung", "Vishay", "Nexperia",
      "Broadcom", "Intel", "Qualcomm", "Maxim",
      "Sunlord", "顺络", "深圳顺络电子", "順絡電子",
    ];
    const lower = text.toLowerCase();
    for (const v of fullNames) {
      if (lower.includes(v.toLowerCase())) {
        // Normalize truncated names
        if (v === "Advanced Micro D") return "AMD";
        if (v === "Advanced Micro Devices") return "AMD";
        if (v === "顺络" || v === "深圳顺络电子" || v === "順絡電子") return "Sunlord";
        return v;
      }
    }
    // Short abbreviations require word boundary to avoid false matches
    // e.g. "TI" must not match "Notification", "ST" must not match "step"
    const abbreviations: [RegExp, string][] = [
      [/\bTI\b/, "Texas Instruments"],
      [/\bST\b/, "STMicroelectronics"],
      [/\bADI\b/, "Analog Devices"],
      [/\bAMD\b/, "AMD"],
    ];
    for (const [pattern, name] of abbreviations) {
      if (pattern.test(text)) return name;
    }
    return null;
  }

  /**
   * Extract PCN# from structured fields in email body (e.g., "PCN#: CN-202603037I-WPI").
   * These are tab/colon-delimited fields from distributor notification templates.
   */
  /**
   * Extract vendor from structured "Brand:" or "Manufacturer:" fields in distributor email bodies.
   * These are the most reliable source for WTMec/Avnet/Arrow forwarded emails.
   */
  private extractBrandFromStructuredFields(text: string): string | null {
    const patterns = [
      /Brand\t\s*([A-Za-z][\w\s]+)/i,                   // Brand\t VISHAY (WTMec tab-delimited)
      /^Manufacturer\t\s*([A-Za-z][\w\s]+\S)/im,        // Manufacturer\tAdvanced Micro D (tab-delimited, start of line)
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const raw = m[1].trim();
        // Normalize to our vendor names
        const vendor = this.extractVendor(raw);
        if (vendor) return vendor;
        // If extractVendor can't match, return as-is (capitalized)
        return raw;
      }
    }
    return null;
  }

  private extractPcnFromStructuredFields(text: string): string | null {
    const patterns = [
      /(?:Manufacturer\s+)?PCN#[:\s\t]+([A-Z0-9][\w(). -]+\S)/i,  // PCN#: CN-202603037I-WPI or 4952(A)
      /PCN\s*Number[:\s\t]+([A-Z0-9][\w(). -]+\S)/i,
      /Notification\s*#[:\s\t]+([A-Z0-9][\w(). -]+\S)/i,
      /PCN编号[：:\s\t]*(PCN\d[\w.-]+)/i,                           // PCN编号:PCN20251215130 (Chinese format, keep PCN prefix)
      /原厂PCN编号[：:\s\t]*(PCN\d[\w.-]+)/i,                       // 原厂PCN编号PCN20251215130
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        // Clean trailing whitespace/tabs
        return m[1].replace(/[\s\t]+$/, "");
      }
    }
    return null;
  }

  private extractPcnNumber(text: string): string | null {
    // Match patterns like "Notification# 20260327000.0", "PCN-2024-001", "FPCN27274X"
    // PCN number must contain at least one digit to avoid matching words like "PCN From"
    const patterns = [
      /Notification#?\s*#?\s*(\d[\d.]+)/i,      // Notification# 20260327000.0 — require leading digit
      /PCN[- ]([A-Z]+-\d[\w.-]+-[A-Z0-9]+)/i,  // PCN-OPT-1484-2026-REV-0 (multi-segment)
      /D-PCN-(\d[\w().-]+\)?)(?=-[A-Z]|$)/i,   // D-PCN-4952(A) — stop before -ADVANTECH
      /(?:PCN|PDN)#\s+(\d[\w.-]+)/i,             // PCN# 20260331003.2 or PDN# 20260330006.3
      /(PCN\d{8,}[\d.]+)/i,                      // PCN20260331003.2 / PCN20251215130 (no separator, keep PCN prefix)
      /(?:PCN|PDN)[\s#:-]+(\d[\w.-]+)/i,        // PCN# 12345, PDN-12345
      /FPCN(\d[\w.-]+)/i,                       // FPCN27274X
      /CN-(\d[\w-]*\w)/i,                       // CN-202603037I-WPI (stop before _ or space)
      /notification\s*number\s*:?\s*([A-Z0-9][\w.-]+)/i,
      /[-–]\s*(\d{8,}[\d.]*)/,                  // trailing number like "- 20260327000"
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1];
    }
    return null;
  }
}
