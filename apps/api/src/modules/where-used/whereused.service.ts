import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { DenodoMpnSearchService } from "./denodo-mpn.service.js";
import { DenodoPartsInfoService } from "./denodo-parts.service.js";
import { DenodoWhereUsedService } from "./denodo-whereused.service.js";
import { DenodoExportService } from "./denodo-export.service.js";
import type { MpnSearchResult } from "./whereused.types.js";

export class WhereUsedService {
  private mpnSearch = new DenodoMpnSearchService();
  private partsInfo = new DenodoPartsInfoService();
  private whereUsed = new DenodoWhereUsedService();
  private exportService = new DenodoExportService();

  /**
   * Full PCN impact analysis pipeline:
   * Step 1: Get affected MPNs from AI analysis
   * Step 2: MPN → ITEM_NUMBER mapping (API-1)
   * Step 3: Parts info + Where-used in parallel (API-2+4, API-3)
   * Step 4: Export Excel report
   */
  async fullImpactAnalysis(ceAssessmentId: string) {
    const assessment = await prisma.ceAssessment.findUniqueOrThrow({
      where: { id: ceAssessmentId },
      include: { pcnEvent: { include: { aiAnalysis: true } } },
    });

    const aiResult = assessment.pcnEvent.aiAnalysis;
    if (!aiResult?.affectedParts) {
      throw new Error("No AI analysis or affected parts found");
    }

    const affectedMpns = (aiResult.affectedParts as { mpn: string }[]).map((p) => p.mpn);
    logger.info({ ceAssessmentId, mpnCount: affectedMpns.length }, "Starting full impact analysis");

    // Step 2: MPN → ITEM_NUMBER
    const mpnResult = await this.mpnSearch.searchMpn(affectedMpns);
    const itemNumbers = this.extractItemNumbers(mpnResult);
    const manufactureData = this.buildManufactureMap(mpnResult);

    // Step 3: Parallel queries
    const [partsResult, whereUsedResult] = await Promise.all([
      this.partsInfo.getPartsInfo(itemNumbers, manufactureData),
      this.whereUsed.getWhereUsed(itemNumbers),
    ]);

    // Step 4: Excel export
    const exportResult = await this.exportService.exportExcel({
      parts_info: partsResult.parts_info,
      where_used: whereUsedResult.where_used,
    });

    // Save to DB
    await this.saveResults(ceAssessmentId, mpnResult, partsResult, whereUsedResult);

    // Update event status
    await prisma.pcnEventMaster.update({
      where: { id: assessment.pcnEventId },
      data: { status: "WHERE_USED_DONE" },
    });

    return {
      mpnSearchResult: mpnResult,
      partsInfo: partsResult,
      whereUsed: whereUsedResult,
      excelReport: exportResult,
      summary: {
        totalMpnsSearched: affectedMpns.length,
        totalItemNumbersFound: itemNumbers.length,
        totalProductsImpacted: whereUsedResult.total,
        productLineBreakdown: whereUsedResult.by_product_line,
        ceOwners: [...new Set(partsResult.parts_info.map((p) => p["CE Owner"]).filter(Boolean))],
      },
    };
  }

  async getResult(assessmentId: string) {
    return prisma.whereUsedResult.findMany({
      where: { ceAssessmentId: assessmentId },
    });
  }

  private extractItemNumbers(mpnResult: MpnSearchResult): string[] {
    const items = new Set<string>();
    for (const records of Object.values(mpnResult.by_manufacturer)) {
      for (const r of records) {
        items.add(r.ITEM_NUMBER);
      }
    }
    return [...items];
  }

  private buildManufactureMap(mpnResult: MpnSearchResult) {
    const map: Record<string, { MPN: string; Manufacturer: string }> = {};
    for (const [mfr, records] of Object.entries(mpnResult.by_manufacturer)) {
      for (const r of records) {
        map[r.ITEM_NUMBER] = { MPN: r.MFR_PART_NUMBER, Manufacturer: mfr };
      }
    }
    return map;
  }

  private async saveResults(
    ceAssessmentId: string,
    mpnResult: MpnSearchResult,
    partsResult: any,
    whereUsedResult: any
  ) {
    for (const partInfo of partsResult.parts_info) {
      await prisma.whereUsedResult.create({
        data: {
          ceAssessmentId,
          mpn: partInfo.MPN,
          itemNumber: partInfo["Part Number"],
          mfrName: partInfo.Manufacturer,
          partCat: partInfo.Part_Cat,
          itemDesc: partInfo.Description,
          lifecyclePhase: partInfo.LifeCycle_Phase,
          ceOwnerName: partInfo["CE Owner"]?.split("@")[0] ?? "",
          ceOwnerEmail: partInfo["CE Owner"],
          rawDenodoData: { partsInfo: partInfo },
        },
      });
    }
  }
}
