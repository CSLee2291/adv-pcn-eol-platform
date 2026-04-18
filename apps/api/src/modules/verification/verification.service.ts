import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import path from "path";
import fs from "fs";

// Use env or auto-detect paths
const EXCEL_PATH = process.env.VERIFICATION_EXCEL_PATH
  || "C:/Users/cs.lee.ADVANTECH/Documents/ClaudeCodeProjects/adv_pcn_eol_ai-assistant/2026_PCN_List.xlsx";
const EMAIL_DIR = process.env.VERIFICATION_EMAIL_DIR
  || "C:/Users/cs.lee.ADVANTECH/Documents/ClaudeCodeProjects/adv_pcn_eol_ai-assistant/pcn-eol-platform/test-fixtures/vendor-emails";

// ==================== Excel Data Types ====================

interface ExcelPcnSummary {
  pcnNumber: string;
  vendor: string;
  agent: string;
  title: string;
  ceOwner: string;
  category: string;
  ceComment: string;
  notifyPm: string;
  followUp: string;
  folder: string;
  mpnCount: number;
  itemCount: number;
  mpns: string[];
  items: string[];
}

// ==================== Excel Reader (cached) ====================

let excelCache: ExcelPcnSummary[] | null = null;

async function readExcelPcns(): Promise<ExcelPcnSummary[]> {
  if (excelCache) return excelCache;

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.default.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.getWorksheet("2026");
  if (!ws) throw new Error("Sheet '2026' not found in Excel");

  const pcnMap = new Map<string, ExcelPcnSummary>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const pcn = String(row.getCell(5).value || "").trim();
    if (!pcn || pcn === "-") continue;

    if (!pcnMap.has(pcn)) {
      pcnMap.set(pcn, {
        pcnNumber: pcn,
        vendor: String(row.getCell(3).value || ""),
        agent: String(row.getCell(4).value || ""),
        title: String(row.getCell(6).value || ""),
        ceOwner: String(row.getCell(9).value || ""),
        category: String(row.getCell(16).value || ""),
        ceComment: String(row.getCell(12).value || ""),
        notifyPm: String(row.getCell(13).value || ""),
        followUp: String(row.getCell(15).value || ""),
        folder: String(row.getCell(18).value || ""),
        mpnCount: 0,
        itemCount: 0,
        mpns: [],
        items: [],
      });
    }
    const entry = pcnMap.get(pcn)!;
    const mpn = String(row.getCell(7).value || "").trim();
    const item = String(row.getCell(8).value || "").trim();
    if (mpn && mpn !== "-" && !entry.mpns.includes(mpn)) {
      entry.mpns.push(mpn);
    }
    if (item && item !== "-" && !entry.items.includes(item)) {
      entry.items.push(item);
    }
  }

  // Set counts
  for (const entry of pcnMap.values()) {
    entry.mpnCount = entry.mpns.length;
    entry.itemCount = entry.items.length;
  }

  excelCache = [...pcnMap.values()];
  logger.info({ count: excelCache.length }, "Excel PCN data loaded");
  return excelCache;
}

// ==================== Email Auto-Detection ====================

function findEmailFile(pcnNumber: string): string | null {
  if (!fs.existsSync(EMAIL_DIR)) return null;
  const files = fs.readdirSync(EMAIL_DIR);
  // Try exact match or partial match on PCN# in filename
  const match = files.find((f) => {
    const lower = f.toLowerCase();
    return lower.includes(pcnNumber.toLowerCase()) && (lower.endsWith(".msg") || lower.endsWith(".eml"));
  });
  return match || null;
}

// ==================== Service ====================

export class VerificationService {
  // --- Excel PCN List (for picker UI) ---
  async listExcelPcns() {
    const pcns = await readExcelPcns();
    return pcns.map((p) => ({
      pcnNumber: p.pcnNumber,
      vendor: p.vendor,
      agent: p.agent,
      title: p.title.substring(0, 80),
      ceOwner: p.ceOwner,
      mpnCount: p.mpnCount,
      itemCount: p.itemCount,
      folder: p.folder,
    }));
  }

  // --- Generate Batch ---
  async generateBatch(count: number) {
    const pcns = await readExcelPcns();
    // Random shuffle and pick
    const shuffled = [...pcns].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, pcns.length));

    const batchNumber = `VB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Date.now()).slice(-4)}`;

    const batch = await prisma.verificationBatch.create({
      data: {
        batchNumber,
        totalCount: selected.length,
        pendingCount: selected.length,
      },
    });

    const records = [];
    for (const pcn of selected) {
      const emailFile = findEmailFile(pcn.pcnNumber);
      const record = await prisma.pcnVerificationRecord.create({
        data: {
          pcnNumber: pcn.pcnNumber,
          batchId: batch.id,
          excelVendor: pcn.vendor,
          excelAgent: pcn.agent || null,
          excelTitle: pcn.title || null,
          excelCeOwner: pcn.ceOwner || null,
          excelCategory: pcn.category || null,
          excelCeComment: pcn.ceComment || null,
          excelNotifyPm: pcn.notifyPm || null,
          excelFollowUp: pcn.followUp || null,
          excelFolder: pcn.folder || null,
          excelMpnCount: pcn.mpnCount,
          excelItemCount: pcn.itemCount,
          excelMpns: pcn.mpns,
          excelItems: pcn.items,
          status: emailFile ? "EMAIL_READY" : "PENDING",
          emailFileName: emailFile,
        },
      });
      records.push(record);
    }

    // Update batch counts
    const readyCount = records.filter((r) => r.status === "EMAIL_READY").length;
    await prisma.verificationBatch.update({
      where: { id: batch.id },
      data: { pendingCount: selected.length - readyCount },
    });

    logger.info({ batchId: batch.id, total: selected.length, emailReady: readyCount }, "Verification batch generated");
    return { batch, records };
  }

  // --- Add PCN to Batch ---
  async addToBatch(batchId: string, pcnNumber: string) {
    const pcns = await readExcelPcns();
    const pcn = pcns.find((p) => p.pcnNumber === pcnNumber);
    if (!pcn) throw new Error(`PCN# '${pcnNumber}' not found in Excel`);

    const emailFile = findEmailFile(pcn.pcnNumber);
    const record = await prisma.pcnVerificationRecord.create({
      data: {
        pcnNumber: pcn.pcnNumber,
        batchId,
        excelVendor: pcn.vendor,
        excelAgent: pcn.agent || null,
        excelTitle: pcn.title || null,
        excelCeOwner: pcn.ceOwner || null,
        excelCategory: pcn.category || null,
        excelCeComment: pcn.ceComment || null,
        excelNotifyPm: pcn.notifyPm || null,
        excelFollowUp: pcn.followUp || null,
        excelFolder: pcn.folder || null,
        excelMpnCount: pcn.mpnCount,
        excelItemCount: pcn.itemCount,
        excelMpns: pcn.mpns,
        excelItems: pcn.items,
        status: emailFile ? "EMAIL_READY" : "PENDING",
        emailFileName: emailFile,
      },
    });

    await this.updateBatchCounts(batchId);
    return record;
  }

  // --- Remove Record from Batch ---
  async removeFromBatch(recordId: string) {
    const record = await prisma.pcnVerificationRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new Error("Record not found");
    await prisma.pcnVerificationRecord.delete({ where: { id: recordId } });
    await this.updateBatchCounts(record.batchId);
    return { deleted: true };
  }

  // --- List Batches ---
  async listBatches() {
    return prisma.verificationBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { records: true } } },
    });
  }

  // --- Get Batch with Records ---
  async getBatch(batchId: string) {
    return prisma.verificationBatch.findUnique({
      where: { id: batchId },
      include: { records: { orderBy: { createdAt: "asc" } } },
    });
  }

  // --- Mark Email Ready ---
  async markEmailReady(recordId: string, fileName: string) {
    const record = await prisma.pcnVerificationRecord.update({
      where: { id: recordId },
      data: { status: "EMAIL_READY", emailFileName: fileName },
    });
    await this.updateBatchCounts(record.batchId);
    return record;
  }

  // --- Run Single Verification ---
  async runVerification(recordId: string) {
    const record = await prisma.pcnVerificationRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new Error("Record not found");
    if (!record.emailFileName) throw new Error("Email file not set");

    const emailPath = path.join(EMAIL_DIR, record.emailFileName);
    if (!fs.existsSync(emailPath)) throw new Error(`Email file not found: ${emailPath}`);

    await prisma.pcnVerificationRecord.update({
      where: { id: recordId },
      data: { status: "ANALYZING" },
    });

    try {
      const { PcnService } = await import("../pcn/pcn.service.js");
      const pcnService = new PcnService();
      const { AiServiceFactory } = await import("../ai-analysis/ai.service.js");
      const aiService = AiServiceFactory.create();

      let eventId: string;
      let eventVendor: string;
      let eventPcnNumber: string;

      // Priority 1: Use appEventId from a previous run (most reliable — exact event)
      let existing = record.appEventId
        ? await prisma.pcnEventMaster.findUnique({
            where: { id: record.appEventId },
            include: { aiAnalysis: true },
          })
        : null;

      // Priority 2: Check by PCN# exact match only (no fuzzy — avoids wrong-event matching)
      if (!existing) {
        existing = await prisma.pcnEventMaster.findFirst({
          where: { pcnNumber: record.pcnNumber },
          include: { aiAnalysis: true },
          orderBy: { receivedDate: "desc" },
        });
      }

      if (existing) {
        eventId = existing.id;
        eventVendor = existing.vendorName;
        eventPcnNumber = existing.pcnNumber;

        if (existing.aiAnalysis) {
          // Reuse existing AI result
          logger.info({ pcn: record.pcnNumber, eventId }, "Reusing existing PCN event for verification");
        } else {
          // Event exists but no AI analysis — run analysis now
          logger.info({ pcn: record.pcnNumber, eventId }, "Found existing event without AI, running analysis");
          if (existing.status === "PENDING_REVIEW" || existing.status === "PENDING") {
            try { await pcnService.approveEvent(existing.id); } catch { /* already approved */ }
          }
          const aiResult = await aiService.analyzePcn(existing.id);
          await prisma.pcnEventMaster.update({ where: { id: existing.id }, data: { status: "AI_ANALYZED" } });
        }
      } else {
        // Upload fresh — handle unique constraint (P2002) gracefully
        let event: any;
        try {
          const fileBuffer = fs.readFileSync(emailPath);
          const mockFile = {
            filename: record.emailFileName,
            mimetype: "application/octet-stream",
            file: { bytesRead: fileBuffer.length },
            toBuffer: async () => fileBuffer,
          } as any;

          event = await pcnService.uploadEmail(mockFile);
        } catch (uploadErr: any) {
          // If duplicate PCN# error, find the event that caused the conflict
          if (uploadErr.code === "P2002" || uploadErr.message?.includes("Unique constraint")) {
            // The conflicting event has the same PCN# that our upload extracted.
            // Find the most recent event — it's likely the one from a previous verification run.
            const found = await prisma.pcnEventMaster.findFirst({
              include: { aiAnalysis: true },
              orderBy: { receivedDate: "desc" },
              // Try to find by the PCN# our upload would have extracted (search by email title)
              where: { pcnTitle: { contains: (record.emailFileName || "").substring(0, 20) } },
            });
            if (found) {
              eventId = found.id;
              eventVendor = found.vendorName;
              eventPcnNumber = found.pcnNumber;
              logger.info({ pcn: record.pcnNumber, foundPcn: found.pcnNumber, eventId }, "Found event after P2002");
              if (!found.aiAnalysis) {
                if (found.status === "PENDING_REVIEW" || found.status === "PENDING") {
                  try { await pcnService.approveEvent(found.id); } catch { /* ok */ }
                }
                await aiService.analyzePcn(found.id);
                await prisma.pcnEventMaster.update({ where: { id: found.id }, data: { status: "AI_ANALYZED" } });
              }
              const aiData = await prisma.aiAnalysisResult.findFirst({ where: { pcnEventId: eventId } });
              if (aiData) {
                await this.compareAndSave(recordId, record, eventId, eventVendor, eventPcnNumber, aiData);
                return prisma.pcnVerificationRecord.findUnique({ where: { id: recordId } });
              }
            }
            throw new Error(`PCN# conflict: upload extracted a different PCN# than Excel '${record.pcnNumber}'. The email may have been uploaded before with a different PCN#.`);
          }
          throw uploadErr;
        }

        await pcnService.approveEvent(event.id);
        await aiService.analyzePcn(event.id);
        await prisma.pcnEventMaster.update({ where: { id: event.id }, data: { status: "AI_ANALYZED" } });

        eventId = event.id;
        eventVendor = event.vendorName;
        eventPcnNumber = event.pcnNumber;
      }

      // Fetch AI result for comparison
      const aiData = await prisma.aiAnalysisResult.findFirst({ where: { pcnEventId: eventId } });
      if (!aiData) throw new Error("No AI analysis result found");

      await this.compareAndSave(recordId, record, eventId, eventVendor, eventPcnNumber, aiData);
      return prisma.pcnVerificationRecord.findUnique({ where: { id: recordId } });
    } catch (err: any) {
      await prisma.pcnVerificationRecord.update({
        where: { id: recordId },
        data: { status: "ERROR", notes: err.message?.substring(0, 500) },
      });
      await this.updateBatchCounts(record.batchId);
      throw err;
    }
  }

  // --- Run All Ready in Batch ---
  async runAllReady(batchId: string) {
    const batch = await prisma.verificationBatch.findUnique({
      where: { id: batchId },
      include: { records: true },
    });
    if (!batch) throw new Error("Batch not found");

    const ready = batch.records.filter((r) => r.status === "EMAIL_READY");
    const results = [];
    for (const record of ready) {
      try {
        const result = await this.runVerification(record.id);
        results.push(result);
      } catch (err: any) {
        logger.error({ pcn: record.pcnNumber, error: err.message }, "Verification failed");
        results.push({ id: record.id, pcnNumber: record.pcnNumber, status: "ERROR", error: err.message });
      }
    }

    await this.updateBatchCounts(batchId);
    return { ran: ready.length, results };
  }

  // --- Re-run Batch (new run number, same PCNs) ---
  async rerunBatch(batchId: string) {
    const original = await prisma.verificationBatch.findUnique({
      where: { id: batchId },
      include: { records: true },
    });
    if (!original) throw new Error("Batch not found");

    // Find max run number for this parent
    const parentId = original.parentBatchId || original.id;
    const maxRun = await prisma.verificationBatch.aggregate({
      where: { OR: [{ id: parentId }, { parentBatchId: parentId }] },
      _max: { runNumber: true },
    });
    const newRunNumber = (maxRun._max.runNumber || 1) + 1;

    const batchNumber = `${original.batchNumber.replace(/-R\d+$/, "")}-R${newRunNumber}`;

    const newBatch = await prisma.verificationBatch.create({
      data: {
        batchNumber,
        runNumber: newRunNumber,
        parentBatchId: parentId,
        totalCount: original.records.length,
        pendingCount: original.records.length,
      },
    });

    // Copy records with fresh status, carry over appEventId + email from previous run
    for (const rec of original.records) {
      const emailFile = rec.emailFileName || findEmailFile(rec.pcnNumber);
      await prisma.pcnVerificationRecord.create({
        data: {
          pcnNumber: rec.pcnNumber,
          batchId: newBatch.id,
          excelVendor: rec.excelVendor,
          excelAgent: rec.excelAgent,
          excelTitle: rec.excelTitle,
          excelCeOwner: rec.excelCeOwner,
          excelCategory: rec.excelCategory,
          excelCeComment: rec.excelCeComment,
          excelNotifyPm: rec.excelNotifyPm,
          excelFollowUp: rec.excelFollowUp,
          excelFolder: rec.excelFolder,
          excelMpnCount: rec.excelMpnCount,
          excelItemCount: rec.excelItemCount,
          excelMpns: rec.excelMpns,
          excelItems: rec.excelItems,
          // Only carry over appEventId if previous run was PASS (correct event matched)
          appEventId: rec.status === "PASS" ? rec.appEventId : null,
          status: emailFile ? "EMAIL_READY" : "PENDING",
          emailFileName: emailFile,
        },
      });
    }

    await this.updateBatchCounts(newBatch.id);
    logger.info({ newBatchId: newBatch.id, runNumber: newRunNumber }, "Batch re-run created");
    return this.getBatch(newBatch.id);
  }

  // --- Accuracy History (for trend chart) ---
  async getHistory() {
    return prisma.verificationBatch.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        batchNumber: true,
        runNumber: true,
        totalCount: true,
        passCount: true,
        failCount: true,
        accuracy: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  // --- Get Single Record Detail ---
  async getRecord(recordId: string) {
    return prisma.pcnVerificationRecord.findUnique({ where: { id: recordId } });
  }

  // --- Fuzzy MPN matching ---
  // Handles common MPN format differences between Excel and AI extraction:
  // - Nexperia: ",115" / ",215" / " 115" suffixes
  // - TI: "/2K5" / "/250" / "/3K" packaging suffixes
  // - Murata: PNK ↔ PNL suffix variants (same part, different packaging)
  // - Last character R↔T variants (reel vs tube packaging)
  private mpnFuzzyMatch(excelMpn: string, appMpns: string[]): boolean {
    if (appMpns.includes(excelMpn)) return true;
    // Level 0.5: Space↔Comma substitution (e.g., "FTXXV710-AM2 SLLZ3" ↔ "FTXXV710-AM2,SLLZ3")
    const spaceComma = excelMpn.includes(" ") ? excelMpn.replace(/ /g, ",") : excelMpn.replace(/,/g, " ");
    if (appMpns.includes(spaceComma)) return true;
    // Level 1: Strip common suffixes (Nexperia ",115", TI "/2K5")
    const normalize = (m: string) => m.replace(/[, ]\d{2,3}$/, "").replace(/\/\d+[A-Z]*\d*$/, "").trim();
    const normExcel = normalize(excelMpn);
    if (appMpns.some((a) => normalize(a) === normExcel || a.startsWith(normExcel))) return true;
    // Level 2: Last-char packaging variant (PNK↔PNL, T↔R)
    const baseExcel = excelMpn.slice(0, -1);
    if (baseExcel.length >= 6 && appMpns.some((a) => a.slice(0, -1) === baseExcel)) return true;
    // Level 3: Excel MPN is a longer variant of an App MPN (e.g., ACM2012H-900-2P-T03 starts with ACM2012)
    if (appMpns.some((a) => a.length >= 5 && excelMpn.startsWith(a))) return true;
    return false;
  }

  // --- Compare AI result with Excel and save ---
  private async compareAndSave(
    recordId: string,
    record: any,
    eventId: string,
    eventVendor: string,
    eventPcnNumber: string,
    aiData: any,
  ) {
    const affectedParts = (aiData.affectedParts as any[]) || [];
    const appMpns = affectedParts.map((p: any) => p.mpn).filter(Boolean);
    const excelMpns = (record.excelMpns as string[]) || [];

    // Fuzzy matching — handles suffix variants (,115 / ,215 / /250 / /2K5)
    const mpnMatch = excelMpns.filter((m) => this.mpnFuzzyMatch(m, appMpns));
    const onlyInExcel = excelMpns.filter((m) => !this.mpnFuzzyMatch(m, appMpns));
    const onlyInApp = appMpns.filter((m: string) => !excelMpns.some((e) => this.mpnFuzzyMatch(e, [m])));

    // Vendor comparison — check English name, abbreviations, Chinese name, agent, folder
    const vendorTexts = [
      record.excelVendor, record.excelAgent || "", record.excelFolder || "",
    ].join(" ").toLowerCase();
    const appVendorLower = (eventVendor || "").toLowerCase();
    // Map of vendor abbreviations used in folder names
    const vendorAbbrevMap: Record<string, string[]> = {
      "texas instruments": ["ti"], "stmicroelectronics": ["st"], "analog devices": ["adi"],
      "onsemi": ["on", "onsemi"], "nexperia": ["nexperia"], "murata": ["murata"],
      "nxp": ["nxp"], "intel": ["intel"], "vishay": ["vishay"], "amd": ["amd"],
      "sunlord": ["sunlord"], "marvell": ["marvell"], "microchip": ["microchip"],
      "renesas": ["renesas"], "broadcom": ["broadcom"], "diodes": ["diodes"],
      "macronix": ["macronix"], "micron": ["micron"], "mps": ["mps"],
    };
    const abbrevs = vendorAbbrevMap[appVendorLower] || [appVendorLower.substring(0, 5)];
    const folderLower = (record.excelFolder || "").toLowerCase();
    const vendorMatch = !!(appVendorLower && (
      vendorTexts.includes(appVendorLower) ||
      folderLower.includes(appVendorLower) ||
      abbrevs.some((a) => folderLower.includes("_" + a + "_") || folderLower.includes("_" + a + "-"))
    ));

    // Pass: all Excel MPNs found in App (App may have extras)
    const pass = excelMpns.length === 0 || onlyInExcel.length === 0;

    await prisma.pcnVerificationRecord.update({
      where: { id: recordId },
      data: {
        appEventId: eventId,
        appVendor: eventVendor,
        appPcnNumber: eventPcnNumber,
        appRiskLevel: aiData.riskLevel,
        appFormChanged: aiData.formChanged,
        appFitChanged: aiData.fitChanged,
        appFuncChanged: aiData.functionChanged,
        appMpnCount: appMpns.length,
        appMpns: appMpns,
        mpnMatchCount: mpnMatch.length,
        mpnOnlyInExcel: onlyInExcel,
        mpnOnlyInApp: onlyInApp,
        vendorMatch,
        status: pass ? "PASS" : "FAIL",
      },
    });

    await this.updateBatchCounts(record.batchId);
    logger.info({
      pcn: record.pcnNumber, pass,
      mpnMatch: mpnMatch.length, onlyInExcel: onlyInExcel.length, onlyInApp: onlyInApp.length,
    }, "Verification completed");
  }

  // --- Update Batch Counts ---
  private async updateBatchCounts(batchId: string) {
    const records = await prisma.pcnVerificationRecord.findMany({ where: { batchId } });
    const total = records.length;
    const pass = records.filter((r) => r.status === "PASS").length;
    const fail = records.filter((r) => r.status === "FAIL").length;
    const error = records.filter((r) => r.status === "ERROR").length;
    const pending = total - pass - fail - error;
    // Accuracy = PASS / (PASS + FAIL + ERROR) — ERROR counts as failure
    const compared = pass + fail + error;
    const accuracy = compared > 0 ? Math.round((pass / compared) * 1000) / 10 : null;
    const allDone = pending === 0 && records.every((r) => ["PASS", "FAIL", "ERROR"].includes(r.status));

    await prisma.verificationBatch.update({
      where: { id: batchId },
      data: {
        totalCount: total,
        passCount: pass,
        failCount: fail + error,
        pendingCount: pending,
        accuracy,
        status: allDone ? "COMPLETED" : "DRAFT",
        completedAt: allDone ? new Date() : null,
      },
    });
  }
}
