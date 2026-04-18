import { getDenodoClient } from "./denodo.client.js";
import { logger } from "../../config/logger.js";
import type { DenodoManufactureRecord, MpnSearchResult } from "./whereused.types.js";

const VIEW_PATH = "/ws_plm_zagile_manufacture_ce_app/views/iv_plm_zagile_manufacture";

export class DenodoMpnSearchService {
  private client = getDenodoClient();

  async searchMpn(mpnList: string[]): Promise<MpnSearchResult> {
    const byManufacturer: Record<string, (DenodoManufactureRecord & { search_mpn: string })[]> = {};
    const errors: { mpn: string; error: string }[] = [];

    for (const mpn of mpnList) {
      try {
        // Try exact MPN first, then normalized variants
        // Denodo may store MPNs differently (e.g., "BZX384-C13 115" vs "BZX384-C13,115")
        const variants = this.getMpnVariants(mpn);
        let found = false;

        for (const variant of variants) {
          const records = await this.client.get<DenodoManufactureRecord>(VIEW_PATH, {
            MFR_PART_NUMBER: variant,
          });

          if (records.length > 0) {
            for (const rec of records) {
              const mfr = rec.MANUFACTURE_NAME || "Unknown";
              if (!byManufacturer[mfr]) byManufacturer[mfr] = [];
              byManufacturer[mfr].push({ ...rec, search_mpn: mpn });
            }
            found = true;
            logger.debug({ mpn, variant, count: records.length }, "MPN search matched");
            break; // Stop at first matching variant
          }
        }

        if (!found) {
          logger.debug({ mpn, variants }, "MPN search: no results for any variant");
        }
      } catch (err: any) {
        errors.push({ mpn, error: err.message });
      }
    }

    const total = Object.values(byManufacturer).flat().length;
    return { total, by_manufacturer: byManufacturer, errors };
  }

  /**
   * Generate MPN search variants to handle format differences between
   * vendor PCN documents and Denodo's stored MPN format.
   *
   * Known format mismatches:
   * - Nexperia: PCN uses "BZX384-C13,115" but Denodo stores "BZX384-C13 115"
   * - Some vendors: PCN uses spaces, Denodo uses dashes
   */
  private getMpnVariants(mpn: string): string[] {
    const variants = [mpn]; // Always try exact match first

    // If MPN contains comma (e.g., Nexperia packaging codes), try space variant
    if (mpn.includes(",")) {
      variants.push(mpn.replace(/,/g, " "));
    }

    // If MPN contains space, try comma variant (reverse case)
    if (mpn.includes(" ")) {
      variants.push(mpn.replace(/ /g, ","));
    }

    return variants;
  }
}
