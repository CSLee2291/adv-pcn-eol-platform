/** API-1: Manufacturer Part Number search result */
export interface DenodoManufactureRecord {
  ITEM_NUMBER: string;
  CITY: string;
  MANUFACTURE_NAME: string;
  MANUFACTURE_NAME2: string;
  MFR_PART_NUMBER: string;
  MFR_PART_DESCRIPTION: string;
  MFR_PART_LIFECYCLE_PHASE: string;
  MFR_PART_PACKING_TYPE: string;
  PREDERRED_STATUS: string;
  MANUFACTURE_LIFECYCLE_PHASE: string;
  MFR_PART_URL: string;
  MANUFACTURE_ATTACHMENTS_URL: string;
  MPDATUM: string | null;
  COUNTRY_CODE: string;
}

/** API-2: Advantech part info (key fields for PCN/EOL) */
export interface DenodoPartInfo {
  Item_Number: string;
  Item_Desc: string;
  Model_Name: string;
  PrjCode: string;
  Product_Line: string;
  Part_Cat: string;
  LifeCycle_Phase: string;
  PhaseOut_Date: string | null;
  LTB_Date: string | null;
  CO_ESTIMATED_EOL_DATUM: string | null;
  Inactive_Date: string | null;
  INACTIVE: string;
  OTH_REPLACED_BY: string | null;
  OTH_ORIGINAL_MATNR: string | null;
  OTH_COMMENT: string | null;
  CO_MATNR_CAT: string;
  ZZMCATG_M: string;
  ZZMCATG_S: string;
  CATE_M_NAME: string;
  CATE_S_NAME: string;
  STRA_LV1: string;
  STRA_LV2: string;
  Key_Component: string;
  CO_MAINSTREAM: string;
  Product_Owner: string;
  Product_Owner_email: string;
  Request_for_Plant: string;
  ESTIMATE_GREEN_STATUS: string;
  CO_RoHS: string;
  QC_Control: string;
  APPROVE_DATUM: string | null;
  Pur_Mfg: string;
  Brand: string;
  EAIPG: string;
  EAIPD: string;
}

/** API-3: Where-used BOM record */
export interface DenodoWhereUsedRecord {
  Item_Number: string;
  Item_Number_ID: string;
  Item_Number_Part_Cat: string;
  STUFE: string;
  IDNRK: string;
  IDNRK_Part_Cat: string;
  PIDNRK: string;
  PIDNRK_Part_Cat: string;
  QTY: string;
  FIND_NUMBER: string;
  IDNRK_LOCATION: string;
  PCB_MATNR: string;
  LifeCycle_Phase: string;
  Item_Number_LifeCycle_Phase: string;
  PIDNRK_LifeCycle_Phase: string;
  Description: string;
  REV_Number: string;
  ESTIMATE_GREEN_STATUS: string;
  Request_for_Plant: string;
  LTB_Date: string | null;
  Product_Owner: string;
  Model_Name: string;
  OEM_ODM_Type: string;
  PrjCode: string;
  CO_MATNR_CAT: string;
  ZZMCATG_M: string;
  ZZMCATG_S: string;
  STRA_LV1: string;
  STRA_LV2: string;
  EAIPG: string;
  EAIPD: string;
  Product_Line: string;
  Product_Owner_email: string;
}

/** API-4: CE owner mapping */
export interface DenodoCeOwnerRecord {
  PartCategory: string;
  MCateId: string;
  SCateId: string;
  EMAIL_ADDR: string;
}

/** MPN search aggregated result */
export interface MpnSearchResult {
  total: number;
  by_manufacturer: Record<string, (DenodoManufactureRecord & { search_mpn: string })[]>;
  errors: { mpn: string; error: string }[];
}

/** Parts info result */
export interface PartsInfoResult {
  total: number;
  parts_info: PartsInfoRecord[];
}

export interface PartsInfoRecord {
  MPN: string;
  Manufacturer: string;
  "Part Number": string;
  Part_Cat: string;
  Description: string;
  LifeCycle_Phase: string;
  "Material Category": string;
  QC_Control: string;
  "Replaced by": string;
  Comment: string;
  "Approve Date": string;
  "CE Owner": string;
}

/** Where-used result */
export interface WhereUsedQueryResult {
  total: number;
  by_product_line: Record<string, { count: number; products: string[] }>;
  where_used: WhereUsedRecord[];
}

export interface WhereUsedRecord {
  Component: string;
  Part_Cat: string;
  Item_Desc: string;
  LifeCycle_Phase: string;
  Product_Name: string;
  Product_Part_Cat: string;
  Product_LifeCycle: string;
  "Model Name": string;
  Request_for_Plant: string;
  Product_Line: string;
  PG: string;
  PD: string;
  Product_Owner: string;
  EMAIL: string;
}

/** Filtering constants — aligned with actual Denodo data values */
export const ALLOWED_PRODUCT_PART_CAT = [
  "FG", "SA", "PCBA", "PCB", "Module",
  "Product", "ACA", "ANA-Product", "CM-Product", "CM-Assembly",
  "94 SMT Assembly", "95 DIP Assembly", "96/97 Assembly", "968 Assembly",
  "CTOS",
];

export const ALLOWED_PRODUCT_LIFECYCLE = [
  "PVT", "M/P", "Phase Out", "NRND", "DVT", "EVT",
  "Part Number Release",
];
