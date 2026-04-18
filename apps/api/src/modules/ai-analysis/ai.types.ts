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
});

export type AiResponse = z.infer<typeof aiResponseSchema>;
