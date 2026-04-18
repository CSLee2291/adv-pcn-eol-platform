import { getDenodoClient } from "./denodo.client.js";
import { logger } from "../../config/logger.js";
import type { DenodoPartInfo, DenodoCeOwnerRecord, PartsInfoResult } from "./whereused.types.js";

const PARTS_VIEW = "/ws_allparts_info_for_ce_app/views/iv_allparts_info_for_ce";
const CE_OWNER_VIEW = "/ws_srm_materialcategorymappingce_ce_app/views/iv_srm_materialcategorymappingce";

export class DenodoPartsInfoService {
  private client = getDenodoClient();

  async getPartsInfo(
    itemNumbers: string[],
    manufactureData?: Record<string, { MPN: string; Manufacturer: string }>
  ): Promise<PartsInfoResult> {
    const partsInfo = [];

    for (const itemNum of itemNumbers) {
      try {
        // Step 1: Query API-2 for part info
        const parts = await this.client.get<DenodoPartInfo>(PARTS_VIEW, {
          Item_Number: itemNum,
        });
        const part = parts[0];
        if (!part) continue;

        // Step 2: Query API-4 for CE Owner (by ZZMCATG_M + ZZMCATG_S)
        let ceOwner = "";
        if (part.ZZMCATG_M && part.ZZMCATG_S) {
          try {
            const ceRecords = await this.client.get<DenodoCeOwnerRecord>(CE_OWNER_VIEW, {
              MCateId: part.ZZMCATG_M,
              SCateId: part.ZZMCATG_S,
            });
            ceOwner = ceRecords[0]?.EMAIL_ADDR ?? "";
          } catch {
            logger.warn({ itemNum }, "CE owner lookup failed");
          }
        }

        // Step 3: Merge manufacture data from API-1
        const mfrData = manufactureData?.[itemNum];

        partsInfo.push({
          MPN: mfrData?.MPN ?? "",
          Manufacturer: mfrData?.Manufacturer ?? "",
          "Part Number": part.Item_Number,
          Part_Cat: part.Part_Cat,
          Description: part.Item_Desc,
          LifeCycle_Phase: part.LifeCycle_Phase,
          "Material Category": `${part.CATE_M_NAME} > ${part.CATE_S_NAME}`,
          QC_Control: part.QC_Control,
          "Replaced by": part.OTH_REPLACED_BY ?? "",
          Comment: part.OTH_COMMENT ?? "",
          "Approve Date": part.APPROVE_DATUM ?? "",
          "CE Owner": ceOwner,
        });
      } catch (err: any) {
        logger.error({ itemNum, error: err.message }, "Failed to get parts info");
      }
    }

    return { total: partsInfo.length, parts_info: partsInfo };
  }
}
