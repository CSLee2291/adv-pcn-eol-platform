import { z } from "zod";

export const aiResponseSchema = z.object({
  summary: z.string(),
  changeDescription: z.string(),
  formChanged: z.boolean(),
  fitChanged: z.boolean(),
  functionChanged: z.boolean(),
  affectedParts: z.array(
    z.object({
      mpn: z.string(),
      oldMpn: z.string().nullable().optional(),
      newMpn: z.string().nullable().optional(),
    })
  ),
  riskLevel: z.string().transform((v) => v.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"),
  riskReason: z.string(),
  pcnType: z.string().transform((v) => v.toUpperCase() as "PCN" | "EOL" | "PDN" | "OTHER").optional(),
  effectiveDate: z.string().nullable().optional(),
  recommendedActions: z.array(z.string()).optional(),
  // AI self-reported confidence (Phase II)
  confidenceScore: z.number().min(0).max(100).optional(),
  confidenceFactors: z.object({
    textQuality: z.number().min(0).max(100).optional(),
    mpnExtraction: z.number().min(0).max(100).optional(),
    fffClassification: z.number().min(0).max(100).optional(),
    riskAssessment: z.number().min(0).max(100).optional(),
  }).optional(),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;
