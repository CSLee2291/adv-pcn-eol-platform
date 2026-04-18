import { describe, it, expect } from "vitest";
import { z } from "zod";

// ==================== Zod Schema Validation Tests ====================
// Test the AI response schema used to validate gpt-5.4 output

const aiResponseSchema = z.object({
  summary: z.string(),
  changeDescription: z.string(),
  formChanged: z.boolean(),
  fitChanged: z.boolean(),
  functionChanged: z.boolean(),
  affectedParts: z
    .array(z.object({ mpn: z.string(), oldMpn: z.string().nullable().optional(), newMpn: z.string().nullable().optional() }))
    .optional()
    .default([]),
  riskLevel: z.string().transform((v) => v.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"),
  riskReason: z.string().optional(),
  pcnType: z
    .string()
    .transform((v) => v.toUpperCase() as "PCN" | "EOL" | "PDN" | "OTHER")
    .optional(),
  effectiveDate: z.string().nullable().optional(),
  recommendedActions: z.array(z.string()).optional().default([]),
});

describe("AI Response Schema Validation", () => {
  it("should parse a valid AI response", () => {
    const input = {
      summary: "TI issued a PCN for package change",
      changeDescription: "QFN to BGA migration",
      formChanged: true,
      fitChanged: false,
      functionChanged: false,
      affectedParts: [{ mpn: "LM358DR", oldMpn: null, newMpn: null }],
      riskLevel: "HIGH",
      riskReason: "Package type change",
      pcnType: "PCN",
      effectiveDate: "2026-06-01",
      recommendedActions: ["Verify footprint compatibility"],
    };
    const result = aiResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.riskLevel).toBe("HIGH");
      expect(result.data.formChanged).toBe(true);
      expect(result.data.affectedParts).toHaveLength(1);
    }
  });

  it("should normalize lowercase riskLevel from gpt-5.4", () => {
    const input = {
      summary: "test",
      changeDescription: "test",
      formChanged: false,
      fitChanged: false,
      functionChanged: false,
      riskLevel: "low", // gpt-5.4 sometimes returns lowercase
      pcnType: "pcn",
    };
    const result = aiResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.riskLevel).toBe("LOW");
      expect(result.data.pcnType).toBe("PCN");
    }
  });

  it("should handle missing optional fields", () => {
    const input = {
      summary: "Datasheet update only",
      changeDescription: "No change",
      formChanged: false,
      fitChanged: false,
      functionChanged: false,
      riskLevel: "LOW",
    };
    const result = aiResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.affectedParts).toEqual([]);
      expect(result.data.recommendedActions).toEqual([]);
    }
  });

  it("should reject missing required fields", () => {
    const input = { summary: "test" }; // missing changeDescription, F/F/F, riskLevel
    const result = aiResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should handle large affectedParts arrays (608 MPNs)", () => {
    const parts = Array.from({ length: 608 }, (_, i) => ({ mpn: `PART-${i}`, oldMpn: null, newMpn: null }));
    const input = {
      summary: "Vishay PCN",
      changeDescription: "Bond wire change",
      formChanged: false,
      fitChanged: false,
      functionChanged: false,
      riskLevel: "LOW",
      affectedParts: parts,
    };
    const result = aiResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.affectedParts).toHaveLength(608);
    }
  });
});

// ==================== Vendor Extraction Tests ====================
describe("Vendor Extraction Logic", () => {
  function extractVendor(text: string): string | null {
    const fullNames = [
      "Texas Instruments", "Analog Devices", "ON Semiconductor",
      "STMicroelectronics", "Diodes Incorporated",
      "Advanced Micro Devices", "Advanced Micro D",
      "Infineon", "NXP", "Microchip", "onsemi",
      "Renesas", "ROHM", "Murata", "TDK",
      "Samsung", "Vishay", "Nexperia",
      "Broadcom", "Intel", "Qualcomm", "Maxim",
    ];
    const lower = text.toLowerCase();
    for (const v of fullNames) {
      if (lower.includes(v.toLowerCase())) {
        if (v.startsWith("Advanced Micro")) return "AMD";
        return v;
      }
    }
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

  it("should match full vendor names", () => {
    expect(extractVendor("Texas Instruments PCN")).toBe("Texas Instruments");
    expect(extractVendor("Vishay Product Notification")).toBe("Vishay");
    expect(extractVendor("onsemi Final PCN")).toBe("onsemi");
    expect(extractVendor("NXP Quality Notification")).toBe("NXP");
    expect(extractVendor("Murata PCN notice")).toBe("Murata");
    expect(extractVendor("Intel Product Change")).toBe("Intel");
  });

  it("should normalize AMD variants", () => {
    expect(extractVendor("Advanced Micro Devices PCN")).toBe("AMD");
    expect(extractVendor("Advanced Micro D-PCN-4952")).toBe("AMD");
  });

  it("should NOT match TI in Notification", () => {
    expect(extractVendor("Product Notification - details")).toBeNull();
    expect(extractVendor("Notification about changes")).toBeNull();
  });

  it("should match TI as word boundary", () => {
    expect(extractVendor("TI PCN Notice")).toBe("Texas Instruments");
    expect(extractVendor("From TI regarding changes")).toBe("Texas Instruments");
  });

  it("should NOT match ST in step/string", () => {
    expect(extractVendor("Step by step guide")).toBeNull();
    expect(extractVendor("First step")).toBeNull();
  });

  it("should prioritize full names over abbreviations", () => {
    expect(extractVendor("Vishay Product Notification - PCN")).toBe("Vishay");
    // Vishay should match before any TI abbreviation issue
  });
});

// ==================== PCN Number Extraction Tests ====================
describe("PCN Number Extraction", () => {
  function extractPcnFromStructuredFields(text: string): string | null {
    const patterns = [
      /(?:Manufacturer\s+)?PCN#[:\s\t]+([A-Z0-9][\w(). -]+\S)/i,
      /PCN\s*Number[:\s\t]+([A-Z0-9][\w(). -]+\S)/i,
      /Notification\s*#[:\s\t]+([A-Z0-9][\w(). -]+\S)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1].replace(/[\s\t]+$/, "");
    }
    return null;
  }

  function extractPcnNumber(text: string): string | null {
    const patterns = [
      /Notification#?\s*#?\s*(\d[\d.]+)/i,
      /PCN[- ]([A-Z]+-\d[\w.-]+-[A-Z0-9]+)/i,
      /D-PCN-(\d[\w().-]+\)?)(?=-[A-Z]|$)/i,
      /(?:PCN|PDN)#\s+(\d[\w.-]+)/i,
      /PCN(\d{8,}[\d.]+)/i,
      /(?:PCN|PDN)[\s#:-]+(\d[\w.-]+)/i,
      /FPCN(\d[\w.-]+)/i,
      /CN-(\d[\w-]*\w)/i,
      /notification\s*number\s*:?\s*([A-Z0-9][\w.-]+)/i,
      /[-–]\s*(\d{8,}[\d.]*)/,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1];
    }
    return null;
  }

  it("should extract structured PCN# from email body", () => {
    expect(extractPcnFromStructuredFields("PCN#:\t CN-202603037I-WPI\t")).toBe("CN-202603037I-WPI");
    expect(extractPcnFromStructuredFields("Manufacturer PCN#\t4952(A)\t")).toBe("4952(A)");
    expect(extractPcnFromStructuredFields("PCN Number\t FPCN27274X\t")).toBe("FPCN27274X");
  });

  it("should extract TI Notification# format", () => {
    expect(extractPcnNumber("Notification# 20260327000.0")).toBe("20260327000.0");
  });

  it("should extract Vishay PCN format", () => {
    expect(extractPcnNumber("PCN-OPT-1484-2026-REV-0")).toBe("OPT-1484-2026-REV-0");
  });

  it("should extract AMD D-PCN format without trailing company name", () => {
    expect(extractPcnNumber("D-PCN-4952(A)-ADVANTECH CO")).toBe("4952(A)");
  });

  it("should extract onsemi FPCN format", () => {
    expect(extractPcnNumber("FPCN27274X")).toBe("27274X");
  });

  it("should extract PDN format", () => {
    expect(extractPcnNumber("PDN# 20260330006.3")).toBe("20260330006.3");
  });

  it("should extract PCN from filename without separator", () => {
    expect(extractPcnNumber("PCN20260331003.2_Notification.pdf")).toBe("20260331003.2");
  });

  it("should NOT extract dot from Notification.pdf", () => {
    expect(extractPcnNumber("Notification.pdf")).toBeNull();
  });

  it("should NOT extract From as PCN number", () => {
    // "From" contains no digits, so should not match any pattern
    const result = extractPcnNumber("New PCN From Texas Instruments");
    expect(result).not.toBe("From");
  });
});
