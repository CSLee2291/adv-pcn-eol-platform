import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { DenodoWhereUsedService, type ProgressCallback, type ProgressEvent } from "./denodo-whereused.service.js";
import type { WhereUsedRecord, WhereUsedQueryResult } from "./whereused.types.js";

/** Cache TTL: 24 hours (Denodo syncs daily) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface WhereUsedCacheResult extends WhereUsedQueryResult {
  cache_stats: {
    from_cache: number;
    from_denodo: number;
    cached_at?: string; // ISO timestamp of oldest cache hit
  };
}

export class WhereUsedCacheService {
  private denodoService = new DenodoWhereUsedService();

  /**
   * Query where-used with cache-first strategy.
   * 1. Check WhereUsedCache for each itemNumber
   * 2. For uncached/expired items, query Denodo
   * 3. Store new results in cache
   * 4. Merge and return
   */
  async searchWithCache(
    itemNumbers: string[],
    onProgress?: ProgressCallback,
  ): Promise<WhereUsedCacheResult> {
    const now = new Date();
    const cachedRecords: WhereUsedRecord[] = [];
    const uncachedItems: string[] = [];
    let fromCache = 0;
    let fromDenodo = 0;
    let oldestCacheTime: Date | null = null;

    // Step 1: Check cache
    const cacheEntries = await prisma.whereUsedCache.findMany({
      where: { itemNumber: { in: itemNumbers } },
    });
    const cacheMap = new Map(cacheEntries.map((e) => [e.itemNumber, e]));

    for (const itemNum of itemNumbers) {
      const cached = cacheMap.get(itemNum);
      if (cached) {
        const age = now.getTime() - cached.queriedAt.getTime();
        if (age <= CACHE_TTL_MS) {
          // Cache hit
          const records = cached.rawData as unknown as WhereUsedRecord[];
          cachedRecords.push(...records);
          fromCache++;
          if (!oldestCacheTime || cached.queriedAt < oldestCacheTime) {
            oldestCacheTime = cached.queriedAt;
          }
          continue;
        }
      }
      uncachedItems.push(itemNum);
    }

    // Step 2: Query Denodo for uncached items
    let denodoRecords: WhereUsedRecord[] = [];
    if (uncachedItems.length > 0) {
      logger.info(
        { cached: fromCache, toQuery: uncachedItems.length, total: itemNumbers.length },
        "Where-used cache: querying Denodo for uncached items",
      );

      // Wrap progress to account for cached items offset
      const wrappedProgress: ProgressCallback | undefined = onProgress
        ? (event: ProgressEvent) => {
            if (event.step === "query") {
              onProgress({
                ...event,
                cached: fromCache,
                queried: event.current,
                total: itemNumbers.length,
                current: fromCache + event.current,
              });
            } else {
              onProgress(event);
            }
          }
        : undefined;

      const result = await this.denodoService.getWhereUsed(uncachedItems, wrappedProgress);
      denodoRecords = result.where_used;
      fromDenodo = uncachedItems.length;

      // Step 3: Save to cache (per item) — skip items that failed (Denodo unreachable)
      const successItems = uncachedItems.filter((item) => !this.denodoService.failedItems.has(item));
      if (successItems.length > 0) {
        await this.saveToCache(successItems, result.where_used);
      }
      if (this.denodoService.failedItems.size > 0) {
        logger.warn(
          { failed: [...this.denodoService.failedItems] },
          "Skipped caching failed items (Denodo unreachable)",
        );
      }
    } else if (onProgress) {
      // All from cache — send immediate complete
      onProgress({ step: "query", current: itemNumbers.length, total: itemNumbers.length, cached: fromCache, queried: 0 });
    }

    // Step 4: Merge results
    const allWhereUsed = [...cachedRecords, ...denodoRecords];

    // Build by_product_line
    const byProductLine: Record<string, { count: number; products: string[] }> = {};
    for (const r of allWhereUsed) {
      const line = r.Product_Line || "Unknown";
      if (!byProductLine[line]) byProductLine[line] = { count: 0, products: [] };
      byProductLine[line].count++;
      if (!byProductLine[line].products.includes(r.Product_Name)) {
        byProductLine[line].products.push(r.Product_Name);
      }
    }

    onProgress?.({
      step: "complete",
      current: allWhereUsed.length,
      total: allWhereUsed.length,
      cached: fromCache,
      queried: fromDenodo,
      resultCount: allWhereUsed.length,
    });

    return {
      total: allWhereUsed.length,
      by_product_line: byProductLine,
      where_used: allWhereUsed,
      cache_stats: {
        from_cache: fromCache,
        from_denodo: fromDenodo,
        cached_at: oldestCacheTime?.toISOString(),
      },
    };
  }

  /** Force refresh: delete cache, re-query Denodo */
  async forceRefresh(
    itemNumbers: string[],
    onProgress?: ProgressCallback,
  ): Promise<WhereUsedCacheResult> {
    await prisma.whereUsedCache.deleteMany({
      where: { itemNumber: { in: itemNumbers } },
    });
    logger.info({ count: itemNumbers.length }, "Where-used cache cleared for refresh");

    const result = await this.denodoService.getWhereUsed(itemNumbers, onProgress);

    // Only cache items that succeeded
    const successItems = itemNumbers.filter((item) => !this.denodoService.failedItems.has(item));
    if (successItems.length > 0) {
      await this.saveToCache(successItems, result.where_used);
    }

    onProgress?.({
      step: "complete",
      current: result.total,
      total: result.total,
      cached: 0,
      queried: itemNumbers.length,
      resultCount: result.total,
    });

    return {
      ...result,
      cache_stats: { from_cache: 0, from_denodo: itemNumbers.length },
    };
  }

  /** Cache statistics */
  async getCacheStats() {
    const [totalEntries, totalRecords] = await Promise.all([
      prisma.whereUsedCache.count(),
      prisma.whereUsedCache.aggregate({ _sum: { resultCount: true } }),
    ]);
    return {
      totalEntries,
      totalRecords: totalRecords._sum.resultCount ?? 0,
      ttlHours: CACHE_TTL_MS / (60 * 60 * 1000),
    };
  }

  /** Save where-used results to cache, grouped by component item number */
  private async saveToCache(itemNumbers: string[], whereUsed: WhereUsedRecord[]) {
    const now = new Date();

    // Group results by Component (which is the queried item number)
    const byItem = new Map<string, WhereUsedRecord[]>();
    for (const itemNum of itemNumbers) {
      byItem.set(itemNum, []);
    }
    for (const r of whereUsed) {
      const existing = byItem.get(r.Component);
      if (existing) {
        existing.push(r);
      }
    }

    // Upsert each item's results
    for (const [itemNum, records] of byItem) {
      try {
        await prisma.whereUsedCache.upsert({
          where: { itemNumber: itemNum },
          create: {
            itemNumber: itemNum,
            resultCount: records.length,
            rawData: records as any,
            queriedAt: now,
          },
          update: {
            resultCount: records.length,
            rawData: records as any,
            queriedAt: now,
          },
        });
      } catch (err: any) {
        logger.warn({ itemNum, error: err.message }, "Failed to cache where-used result");
      }
    }

    logger.info(
      { items: itemNumbers.length, totalRecords: whereUsed.length },
      "Where-used cache updated",
    );
  }
}
