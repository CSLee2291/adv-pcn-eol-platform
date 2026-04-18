import ExcelJS from "exceljs";
import path from "path";
import fs from "fs/promises";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { PartsInfoRecord, WhereUsedRecord } from "./whereused.types.js";

/** Calculate column widths from headers + first N data rows (not all rows) */
function setColumnWidths(sheet: ExcelJS.Worksheet, headers: string[], sampleRows: any[][]) {
  const widths = headers.map((h) => Math.max(12, h.length + 2));
  for (const row of sampleRows) {
    for (let i = 0; i < row.length && i < widths.length; i++) {
      const len = String(row[i] ?? "").length + 2;
      if (len > widths[i]) widths[i] = len;
    }
  }
  sheet.columns = headers.map((h, i) => ({ header: h, width: Math.min(widths[i], 60) }));
}

export class DenodoExportService {
  async exportExcel(data: {
    parts_info: PartsInfoRecord[];
    where_used: WhereUsedRecord[];
    outputPath?: string;
  }) {
    const t0 = Date.now();
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: 受影響料號清單
    const sheet1 = workbook.addWorksheet("受影響料號清單");
    if (data.parts_info.length > 0) {
      const headers = Object.keys(data.parts_info[0]);
      const rows = data.parts_info.map((item) => Object.values(item));

      // Set column widths from headers + sample
      setColumnWidths(sheet1, headers, rows.slice(0, 50));

      // Style header row
      sheet1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4461EC" } };

      // Add data rows
      for (const row of rows) {
        sheet1.addRow(row);
      }
    }

    // Sheet 2: Where used (only created when data exists)
    if (data.where_used.length > 0) {
      const sheet2 = workbook.addWorksheet("Where used");
      const headers = Object.keys(data.where_used[0]);
      const rows = data.where_used.map((item) => Object.values(item));

      // Set column widths from headers + first 50 rows only
      setColumnWidths(sheet2, headers, rows.slice(0, 50));

      // Style header
      sheet2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4461EC" } };

      // Add data rows
      for (const row of rows) {
        sheet2.addRow(row);
      }
    }

    // Write file
    const outputDir = data.outputPath ?? path.join(env.LOCAL_UPLOAD_DIR, "exports");
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `PCN_Analysis_${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
    const filePath = path.join(outputDir, filename);
    await workbook.xlsx.writeFile(filePath);

    const stats = await fs.stat(filePath);
    const elapsed = Date.now() - t0;
    logger.info({ filePath, size: stats.size, rows: data.where_used.length, ms: elapsed }, "Excel report exported");

    return {
      success: true,
      output_path: filePath,
      file_size_bytes: stats.size,
      sheet1_rows: data.parts_info.length,
      sheet2_rows: data.where_used.length,
    };
  }
}
