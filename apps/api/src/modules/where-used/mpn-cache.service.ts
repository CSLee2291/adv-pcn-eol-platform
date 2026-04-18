import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { DenodoMpnSearchService } from "./denodo-mpn.service.js";
import type { DenodoManufactureRecord, MpnSearchResult } from "./whereused.types.js";

/** Cache TTL: 30 days for found, 7 days for not-found */
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheSource = "cache" | "denodo";

export interface CachedMpnRecord extends DenodoManufactureRecord {
  search_mpn: string;
  source: CacheSource;
}

export interface CachedMpnSearchResult {
  total: number;
  by_manufacturer: Record<string, CachedMpnRecord[]>;
  errors: { mpn: string; error: string }[];
  cache_stats: {
    from_cache: number;
    from_denodo: number;
    not_found: string[];
  };
}

export class MpnCacheService {
  private denodoService = new DenodoMpnSearchService();

  /**
   * Search MPNs with cache-first strategy.
   * 1. Check local cache for all MPNs
   * 2. Query Denodo only for uncached/expired MPNs
   * 3. Store new results in cache
   * 4. Return combined results with source indicator
   */
  async searchWithCache(mpnList: string[]): Promise<CachedMpnSearchResult> {
    const now = new Date();
    const byManufacturer: Record<string, CachedMpnRecord[]> = {};
    const errors: { mpn: string; error: string }[] = [];
    const notFoundMpns: string[] = [];
    let fromCache = 0;
    let fromDenodo = 0;

    // Step 1: Check cache for all MPNs
    const cacheEntries = await prisma.mpnCacheEntry.findMany({
      where: { searchMpn: { in: mpnList } },
    });

    // Group cache entries by searchMpn
    const cacheMap = new Map<string, typeof cacheEntries>();
    for (const entry of cacheEntries) {
      const existing = cacheMap.get(entry.searchMpn) ?? [];
      existing.push(entry);
      cacheMap.set(entry.searchMpn, existing);
    }

    // Step 2: Classify MPNs
    const uncachedMpns: string[] = [];

    for (const mpn of mpnList) {
      const cached = cacheMap.get(mpn);
      if (!cached || cached.length === 0) {
        uncachedMpns.push(mpn);
        continue;
      }

      // Check TTL
      const firstEntry = cached[0];
      const ttl = firstEntry.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
      const age = now.getTime() - firstEntry.queriedAt.getTime();
      if (age > ttl) {
        uncachedMpns.push(mpn);
        continue;
      }

      // Use cache
      if (!firstEntry.found) {
        notFoundMpns.push(mpn);
        fromCache++;
        continue;
      }

      for (const entry of cached) {
        if (entry.itemNumber === "NOT_FOUND") continue;
        const rec = this.cacheEntryToRecord(entry);
        const mfr = entry.manufactureName || "Unknown";
        if (!byManufacturer[mfr]) byManufacturer[mfr] = [];
        byManufacturer[mfr].push(rec);
      }
      fromCache++;
    }

    // Step 3: Query Denodo for uncached MPNs
    if (uncachedMpns.length > 0) {
      logger.info({ count: uncachedMpns.length, mpns: uncachedMpns }, "Querying Denodo for uncached MPNs");

      const denodoResult = await this.denodoService.searchMpn(uncachedMpns);
      errors.push(...denodoResult.errors);

      // Collect which MPNs got results
      const mpnsWithResults = new Set<string>();
      for (const [mfr, recs] of Object.entries(denodoResult.by_manufacturer)) {
        if (!byManufacturer[mfr]) byManufacturer[mfr] = [];
        for (const rec of recs) {
          mpnsWithResults.add(rec.search_mpn);
          byManufacturer[mfr].push({ ...rec, source: "denodo" as CacheSource });
        }
      }

      // Save results to cache
      await this.saveToCache(denodoResult, uncachedMpns);

      // Track not-found MPNs (exclude errored ones)
      const erroredMpns = new Set(denodoResult.errors.map((e) => e.mpn));
      for (const mpn of uncachedMpns) {
        if (!mpnsWithResults.has(mpn) && !erroredMpns.has(mpn)) {
          notFoundMpns.push(mpn);
        }
      }

      fromDenodo += uncachedMpns.length;
    }

    const total = Object.values(byManufacturer).flat().length;
    return {
      total,
      by_manufacturer: byManufacturer,
      errors,
      cache_stats: { from_cache: fromCache, from_denodo: fromDenodo, not_found: notFoundMpns },
    };
  }

  /**
   * Force re-search specific MPNs from Denodo, bypassing cache.
   * Deletes old cache entries and stores fresh results.
   */
  async forceRefresh(mpnList: string[]): Promise<CachedMpnSearchResult> {
    // Delete existing cache entries
    await prisma.mpnCacheEntry.deleteMany({
      where: { searchMpn: { in: mpnList } },
    });

    logger.info({ count: mpnList.length, mpns: mpnList }, "Force refreshing MPNs from Denodo");

    // Query Denodo directly
    const denodoResult = await this.denodoService.searchMpn(mpnList);

    // Save to cache
    await this.saveToCache(denodoResult, mpnList);

    // Build response
    const byManufacturer: Record<string, CachedMpnRecord[]> = {};
    const mpnsWithResults = new Set<string>();
    const notFoundMpns: string[] = [];

    for (const [mfr, recs] of Object.entries(denodoResult.by_manufacturer)) {
      byManufacturer[mfr] = recs.map((rec) => {
        mpnsWithResults.add(rec.search_mpn);
        return { ...rec, source: "denodo" as CacheSource };
      });
    }

    const erroredMpns = new Set(denodoResult.errors.map((e) => e.mpn));
    for (const mpn of mpnList) {
      if (!mpnsWithResults.has(mpn) && !erroredMpns.has(mpn)) {
        notFoundMpns.push(mpn);
      }
    }

    const total = Object.values(byManufacturer).flat().length;
    return {
      total,
      by_manufacturer: byManufacturer,
      errors: denodoResult.errors,
      cache_stats: { from_cache: 0, from_denodo: mpnList.length, not_found: notFoundMpns },
    };
  }

  /** Get cache statistics */
  async getCacheStats() {
    const [totalEntries, foundEntries, notFoundEntries] = await Promise.all([
      prisma.mpnCacheEntry.count(),
      prisma.mpnCacheEntry.count({ where: { found: true } }),
      prisma.mpnCacheEntry.count({ where: { found: false } }),
    ]);
    const uniqueMpns = await prisma.mpnCacheEntry.groupBy({
      by: ["searchMpn"],
      _count: true,
    });
    return {
      totalEntries,
      foundEntries,
      notFoundEntries,
      uniqueMpns: uniqueMpns.length,
    };
  }

  private async saveToCache(result: MpnSearchResult, allMpns: string[]) {
    const now = new Date();
    const mpnsWithResults = new Set<string>();

    // Upsert found records
    for (const [, recs] of Object.entries(result.by_manufacturer)) {
      for (const rec of recs) {
        mpnsWithResults.add(rec.search_mpn);
        try {
          await prisma.mpnCacheEntry.upsert({
            where: {
              mpn_item_unique: {
                searchMpn: rec.search_mpn,
                itemNumber: rec.ITEM_NUMBER,
              },
            },
            create: {
              searchMpn: rec.search_mpn,
              found: true,
              itemNumber: rec.ITEM_NUMBER,
              manufactureName: rec.MANUFACTURE_NAME,
              mfrPartNumber: rec.MFR_PART_NUMBER,
              mfrPartLifecyclePhase: rec.MFR_PART_LIFECYCLE_PHASE,
              preferredStatus: rec.PREDERRED_STATUS,
              rawData: rec as any,
              queriedAt: now,
            },
            update: {
              found: true,
              manufactureName: rec.MANUFACTURE_NAME,
              mfrPartNumber: rec.MFR_PART_NUMBER,
              mfrPartLifecyclePhase: rec.MFR_PART_LIFECYCLE_PHASE,
              preferredStatus: rec.PREDERRED_STATUS,
              rawData: rec as any,
              queriedAt: now,
            },
          });
        } catch (err: any) {
          logger.warn({ mpn: rec.search_mpn, error: err.message }, "Failed to cache MPN result");
        }
      }
    }

    // Upsert not-found records (exclude errored MPNs)
    const erroredMpns = new Set(result.errors.map((e) => e.mpn));
    for (const mpn of allMpns) {
      if (!mpnsWithResults.has(mpn) && !erroredMpns.has(mpn)) {
        try {
          await prisma.mpnCacheEntry.upsert({
            where: {
              mpn_item_unique: {
                searchMpn: mpn,
                itemNumber: "NOT_FOUND",
              },
            },
            create: {
              searchMpn: mpn,
              found: false,
              itemNumber: "NOT_FOUND",
              queriedAt: now,
            },
            update: {
              found: false,
              queriedAt: now,
            },
          });
        } catch (err: any) {
          logger.warn({ mpn, error: err.message }, "Failed to cache not-found MPN");
        }
      }
    }

    logger.info(
      { found: mpnsWithResults.size, notFound: allMpns.length - mpnsWithResults.size - erroredMpns.size },
      "MPN cache updated"
    );
  }

  private cacheEntryToRecord(entry: any): CachedMpnRecord {
    // Restore from rawData if available, otherwise build from fields
    const raw = entry.rawData as DenodoManufactureRecord | null;
    if (raw) {
      return { ...raw, search_mpn: entry.searchMpn, source: "cache" as CacheSource };
    }
    return {
      ITEM_NUMBER: entry.itemNumber,
      MANUFACTURE_NAME: entry.manufactureName ?? "",
      MANUFACTURE_NAME2: "",
      MFR_PART_NUMBER: entry.mfrPartNumber ?? "",
      MFR_PART_DESCRIPTION: "",
      MFR_PART_LIFECYCLE_PHASE: entry.mfrPartLifecyclePhase ?? "",
      MFR_PART_PACKING_TYPE: "",
      PREDERRED_STATUS: entry.preferredStatus ?? "",
      MANUFACTURE_LIFECYCLE_PHASE: "",
      MFR_PART_URL: "",
      MANUFACTURE_ATTACHMENTS_URL: "",
      MPDATUM: null,
      CITY: "",
      COUNTRY_CODE: "",
      search_mpn: entry.searchMpn,
      source: "cache" as CacheSource,
    };
  }
}
