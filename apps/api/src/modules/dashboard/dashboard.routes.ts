import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/kpi", async (_request, reply) => {
    const [
      activePcns,
      eolAlerts,
      highRisk,
      pendingReview,
      totalCompleted,
      aiAnalyzed,
    ] = await Promise.all([
      prisma.pcnEventMaster.count({ where: { status: { not: "CLOSED" } } }),
      prisma.pcnEventMaster.count({ where: { pcnType: "EOL", status: { not: "CLOSED" } } }),
      prisma.aiAnalysisResult.count({ where: { riskLevel: { in: ["HIGH", "CRITICAL"] } } }),
      prisma.pcnEventMaster.count({ where: { status: "PENDING" } }),
      prisma.pcnEventMaster.count({ where: { status: "CLOSED" } }),
      prisma.aiAnalysisResult.count(),
    ]);

    // Calculate average resolution time (completed events only)
    const completedEvents = await prisma.pcnEventMaster.findMany({
      where: { status: "CLOSED", completionDate: { not: null } },
      select: { receivedDate: true, completionDate: true },
    });

    let avgResolutionDays = 0;
    if (completedEvents.length > 0) {
      const totalDays = completedEvents.reduce((sum, e) => {
        const diff = (e.completionDate!.getTime() - e.receivedDate.getTime()) / (1000 * 60 * 60 * 24);
        return sum + diff;
      }, 0);
      avgResolutionDays = Math.round((totalDays / completedEvents.length) * 10) / 10;
    }

    return reply.send({
      success: true,
      data: {
        activePcns,
        eolAlerts,
        highRisk,
        pendingReview,
        avgResolutionDays,
        aiAccuracy: 85, // Placeholder — Phase II will compute from CE feedback
        totalCompleted,
        aiAnalyzed,
      },
    });
  });
}
