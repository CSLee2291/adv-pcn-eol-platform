import { getDenodoClient } from "./denodo.client.js";
import { logger } from "../../config/logger.js";
import type { DenodoWhereUsedRecord, DenodoPartInfo, WhereUsedQueryResult } from "./whereused.types.js";
import { ALLOWED_PRODUCT_PART_CAT, ALLOWED_PRODUCT_LIFECYCLE } from "./whereused.types.js";

const VIEW_PATH =
  "/ws_plm_zall_level_where_used_refdes_asis_u_iv_allparts_info_for_ce_app" +
  "/views/iv_plm_zall_level_where_used_refdes_asis_u_iv_allparts_info_for_ce";

const PARTS_VIEW = "/ws_allparts_info_for_ce_app/views/iv_allparts_info_for_ce";

/** Product-level enrichment data from API-2 */
interface ProductEnrichment {
  Model_Name: string | null;
  Product_Owner: string | null;
  Product_Owner_email: string | null;
  EAIPG: string | null;
  EAIPD: string | null;
  Product_Line: string | null;
}

export type ProgressCallback = (event: ProgressEvent) => void;
export interface ProgressEvent {
  step: "query" | "enrich" | "complete";
  current: number;
  total: number;
  itemNumber?: string;
  cached?: number;
  queried?: number;
  resultCount?: number;
}

export class DenodoWhereUsedService {
  private client = getDenodoClient();

  /** Items that failed during getWhereUsed — should NOT be cached */
  failedItems: Set<string> = new Set();

  async getWhereUsed(
    itemNumbers: string[],
    onProgress?: ProgressCallback,
  ): Promise<WhereUsedQueryResult> {
    const allRecords: DenodoWhereUsedRecord[] = [];
    this.failedItems = new Set();

    for (let i = 0; i < itemNumbers.length; i++) {
      const itemNum = itemNumbers[i];
      onProgress?.({ step: "query", current: i + 1, total: itemNumbers.length, itemNumber: itemNum });
      try {
        const http = this.client.getHttpClient();
        const response = await http.get(VIEW_PATH, {
          params: { IDNRK: itemNum, $format: "json" },
          timeout: 180000, // 3 min timeout for large queries
        });

        const records = (response.data.elements ?? []) as DenodoWhereUsedRecord[];

        // Filter: only keep valid product types and lifecycle phases
        const filtered = records.filter(
          (r) =>
            ALLOWED_PRODUCT_PART_CAT.includes(r.Item_Number_Part_Cat) &&
            ALLOWED_PRODUCT_LIFECYCLE.includes(r.Item_Number_LifeCycle_Phase)
        );

        allRecords.push(...filtered);
        logger.debug({ itemNum, raw: records.length, filtered: filtered.length }, "Where-used query completed");
      } catch (err: any) {
        logger.error({ itemNum, error: err.message }, "Where-used query failed");
        this.failedItems.add(itemNum);
      }
    }

    // Enrich: look up missing Model_Name/Product_Owner/PG/PD from API-2 (AllParts)
    const enrichmentMap = await this.enrichProductInfo(allRecords, onProgress);

    const byProductLine = this.groupByProductLine(allRecords, enrichmentMap);

    return {
      total: allRecords.length,
      by_product_line: byProductLine,
      where_used: allRecords.map((r) => {
        const enrich = enrichmentMap.get(r.Item_Number);
        return {
          Component: r.IDNRK,
          Part_Cat: r.IDNRK_Part_Cat,
          Item_Desc: r.Description,
          LifeCycle_Phase: r.LifeCycle_Phase,
          Product_Name: r.Item_Number,
          Product_Part_Cat: r.Item_Number_Part_Cat,
          Product_LifeCycle: r.Item_Number_LifeCycle_Phase,
          "Model Name": r.Model_Name || enrich?.Model_Name || null,
          Request_for_Plant: r.Request_for_Plant,
          Product_Line: r.Product_Line || enrich?.Product_Line || null,
          PG: r.EAIPG || enrich?.EAIPG || null,
          PD: r.EAIPD || enrich?.EAIPD || null,
          Product_Owner: r.Product_Owner || enrich?.Product_Owner || null,
          EMAIL: r.Product_Owner_email || enrich?.Product_Owner_email || null,
        };
      }),
    };
  }

  /**
   * Batch-enrich product-level info (Model_Name, Product_Owner, PG, PD) from API-2.
   * Only queries for unique Product_Names that have missing fields.
   */
  private async enrichProductInfo(records: DenodoWhereUsedRecord[], onProgress?: ProgressCallback): Promise<Map<string, ProductEnrichment>> {
    const enrichMap = new Map<string, ProductEnrichment>();

    // Collect unique product Item_Numbers that need enrichment
    const needsEnrichment = new Set<string>();
    for (const r of records) {
      if (!r.Model_Name && !r.Product_Owner && !r.EAIPG) {
        needsEnrichment.add(r.Item_Number);
      }
    }

    if (needsEnrichment.size === 0) return enrichMap;

    logger.info({ count: needsEnrichment.size }, "Enriching product info from API-2");

    // Query in parallel batches of 10
    const productIds = [...needsEnrichment];
    const batchSize = 10;
    let enrichedCount = 0;
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      const promises = batch.map(async (productId) => {
        try {
          const parts = await this.client.get<DenodoPartInfo>(PARTS_VIEW, {
            Item_Number: productId,
          });
          const part = parts[0];
          if (part) {
            enrichMap.set(productId, {
              Model_Name: part.Model_Name || null,
              Product_Owner: part.Product_Owner || null,
              Product_Owner_email: part.Product_Owner_email || null,
              EAIPG: part.EAIPG || null,
              EAIPD: part.EAIPD || null,
              Product_Line: part.Product_Line || null,
            });
          }
        } catch {
          // Skip failed lookups silently
        }
      });
      await Promise.all(promises);
      enrichedCount += batch.length;
      onProgress?.({ step: "enrich", current: Math.min(enrichedCount, needsEnrichment.size), total: needsEnrichment.size });
    }

    logger.info({ enriched: enrichMap.size, total: needsEnrichment.size }, "Product enrichment complete");
    return enrichMap;
  }

  private groupByProductLine(records: DenodoWhereUsedRecord[], enrichMap?: Map<string, ProductEnrichment>) {
    const groups: Record<string, { count: number; products: string[] }> = {};
    for (const r of records) {
      const line = r.Product_Line || enrichMap?.get(r.Item_Number)?.Product_Line || "Unknown";
      if (!groups[line]) groups[line] = { count: 0, products: [] };
      groups[line].count++;
      if (!groups[line].products.includes(r.Item_Number)) {
        groups[line].products.push(r.Item_Number);
      }
    }
    return groups;
  }
}
