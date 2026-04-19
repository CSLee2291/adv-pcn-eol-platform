import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";

export interface CorrectionInput {
  pcnEventId: string;
  assessorName: string;
  corrections: {
    field: string;           // riskLevel | formChanged | fitChanged | functionChanged | affectedParts | summary
    originalValue: any;
    correctedValue: any;
    rationale?: string;
  }[];
}

export class AiFeedbackService {
  /** Submit CE corrections for an AI analysis */
  async submitCorrections(input: CorrectionInput) {
    const event = await prisma.pcnEventMaster.findUnique({
      where: { id: input.pcnEventId },
      include: { aiAnalysis: true },
    });
    if (!event?.aiAnalysis) throw new Error("PCN event or AI analysis not found");

    const records = [];
    for (const c of input.corrections) {
      const record = await prisma.aiFeedback.create({
        data: {
          pcnEventId: input.pcnEventId,
          aiAnalysisId: event.aiAnalysis.id,
          assessorName: input.assessorName,
          correctedField: c.field,
          originalValue: JSON.stringify(c.originalValue),
          correctedValue: JSON.stringify(c.correctedValue),
          rationale: c.rationale,
          vendorName: event.vendorName,
          pcnType: event.pcnType,
        },
      });
      records.push(record);
    }

    // Recalculate confidence for this analysis
    await this.updateConfidence(event.aiAnalysis.id);

    logger.info(
      { eventId: input.pcnEventId, corrections: input.corrections.length, assessor: input.assessorName },
      "AI feedback submitted",
    );

    return records;
  }

  /** Get all corrections for an event */
  async getCorrections(eventId: string) {
    return prisma.aiFeedback.findMany({
      where: { pcnEventId: eventId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Calculate and update confidence for a specific analysis */
  async updateConfidence(aiAnalysisId: string) {
    const analysis = await prisma.aiAnalysisResult.findUnique({ where: { id: aiAnalysisId } });
    if (!analysis) return;

    // Get corrections for this analysis
    const corrections = await prisma.aiFeedback.findMany({ where: { aiAnalysisId } });

    // If no corrections, keep current confidence (AI self-reported or default)
    if (corrections.length === 0) return;

    // Count corrected fields
    const correctedFields = new Set(corrections.map((c) => c.correctedField));
    const totalFields = 6; // riskLevel, formChanged, fitChanged, functionChanged, affectedParts, summary
    const agreementRate = (totalFields - correctedFields.size) / totalFields;

    // Combined: 40% AI self-report + 60% CE agreement
    const aiSelfConfidence = analysis.confidence || 0.85;
    const finalConfidence = Math.round((aiSelfConfidence * 0.4 + agreementRate * 0.6) * 100) / 100;

    await prisma.aiAnalysisResult.update({
      where: { id: aiAnalysisId },
      data: { confidence: finalConfidence },
    });

    logger.info(
      { aiAnalysisId, aiSelf: aiSelfConfidence, ceAgreement: agreementRate, final: finalConfidence },
      "Confidence recalculated",
    );
  }

  /** Platform-wide feedback statistics */
  async getStats() {
    const [totalAnalyses, totalWithAssessment, totalFeedback, fieldCounts] = await Promise.all([
      prisma.aiAnalysisResult.count(),
      prisma.ceAssessment.groupBy({ by: ["pcnEventId"] }).then((r) => r.length),
      prisma.aiFeedback.count(),
      prisma.aiFeedback.groupBy({ by: ["correctedField"], _count: true }),
    ]);

    // Events with corrections vs total assessed
    const eventsWithCorrections = await prisma.aiFeedback.groupBy({ by: ["pcnEventId"] }).then((r) => r.length);

    // Risk override rate from CE assessments
    const riskOverrides = await prisma.ceAssessment.count({ where: { overrideRiskLevel: { not: null } } });
    const totalAssessments = await prisma.ceAssessment.count();

    const overallAccuracy = totalWithAssessment > 0
      ? Math.round(((totalWithAssessment - eventsWithCorrections) / totalWithAssessment) * 100)
      : 100;

    const riskAgreementRate = totalAssessments > 0
      ? Math.round(((totalAssessments - riskOverrides) / totalAssessments) * 100)
      : 100;

    // Per-field correction rates
    const fieldStats = fieldCounts.map((f: any) => ({
      field: f.correctedField,
      corrections: f._count,
    }));

    // Per-vendor accuracy
    const vendorFeedback = await prisma.aiFeedback.groupBy({
      by: ["vendorName"],
      _count: true,
    });

    return {
      totalAnalyses,
      totalAssessments,
      totalFeedback,
      eventsWithCorrections,
      overallAccuracy,
      riskAgreementRate,
      fieldStats,
      vendorFeedback: vendorFeedback.map((v: any) => ({
        vendor: v.vendorName,
        corrections: v._count,
      })),
    };
  }

  /** Import corrections from existing CE assessments (risk overrides) */
  async importFromAssessments() {
    const assessments = await prisma.ceAssessment.findMany({
      where: { overrideRiskLevel: { not: null } },
      include: { pcnEvent: { include: { aiAnalysis: true } } },
    });

    let imported = 0;
    for (const a of assessments) {
      if (!a.pcnEvent?.aiAnalysis) continue;
      const aiRisk = a.pcnEvent.aiAnalysis.riskLevel;
      const ceRisk = a.overrideRiskLevel;
      if (aiRisk === ceRisk) continue; // Not actually a correction

      // Check if already imported
      const existing = await prisma.aiFeedback.findFirst({
        where: {
          pcnEventId: a.pcnEventId,
          correctedField: "riskLevel",
          assessorName: a.assessorName,
        },
      });
      if (existing) continue;

      await prisma.aiFeedback.create({
        data: {
          pcnEventId: a.pcnEventId,
          aiAnalysisId: a.pcnEvent.aiAnalysis.id,
          assessorName: a.assessorName,
          correctedField: "riskLevel",
          originalValue: JSON.stringify(aiRisk),
          correctedValue: JSON.stringify(ceRisk),
          rationale: a.comments ?? "Imported from CE assessment risk override",
          vendorName: a.pcnEvent.vendorName,
          pcnType: a.pcnEvent.pcnType,
        },
      });
      imported++;
    }

    logger.info({ imported, total: assessments.length }, "Imported feedback from CE assessments");
    return { imported, total: assessments.length };
  }

  /** Get few-shot examples for a given vendor/pcnType */
  async getFewShotExamples(vendorName?: string, pcnType?: string, limit = 3) {
    const where: any = {};
    if (vendorName) where.vendorName = vendorName;
    if (pcnType) where.pcnType = pcnType;

    const feedback = await prisma.aiFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit * 2, // Get more to deduplicate by event
      include: {
        pcnEvent: { select: { pcnNumber: true, vendorName: true } },
      },
    });

    // Deduplicate by event, group corrections
    const byEvent = new Map<string, { pcnNumber: string; vendor: string; corrections: any[] }>();
    for (const f of feedback) {
      const key = f.pcnEventId;
      if (!byEvent.has(key)) {
        byEvent.set(key, {
          pcnNumber: f.pcnEvent.pcnNumber,
          vendor: f.pcnEvent.vendorName,
          corrections: [],
        });
      }
      byEvent.get(key)!.corrections.push({
        field: f.correctedField,
        aiSaid: JSON.parse(f.originalValue),
        ceCorrectedTo: JSON.parse(f.correctedValue),
        reason: f.rationale,
      });
    }

    return [...byEvent.values()].slice(0, limit);
  }
}
