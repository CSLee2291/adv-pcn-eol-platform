import type { FastifyInstance } from "fastify";
import { AiController } from "./ai.controller.js";
import { AiFeedbackService } from "./ai-feedback.service.js";
import type { FastifyRequest, FastifyReply } from "fastify";

export async function aiRoutes(app: FastifyInstance) {
  const controller = new AiController();
  const feedbackService = new AiFeedbackService();

  // Analysis
  app.post("/analyze/:eventId", controller.analyze);
  app.get("/result/:eventId", controller.getResult);
  app.post("/translate", controller.translate);

  // AI Feedback
  app.post("/feedback", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    if (!body.pcnEventId || !body.assessorName || !body.corrections?.length) {
      return reply.status(400).send({ success: false, error: { message: "pcnEventId, assessorName, corrections[] required" } });
    }
    const data = await feedbackService.submitCorrections(body);
    return reply.send({ success: true, data });
  });

  app.get("/feedback/:eventId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as { eventId: string };
    const data = await feedbackService.getCorrections(eventId);
    return reply.send({ success: true, data });
  });

  app.get("/feedback-stats", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await feedbackService.getStats();
    return reply.send({ success: true, data });
  });

  app.post("/feedback/import-assessments", async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await feedbackService.importFromAssessments();
    return reply.send({ success: true, data });
  });
}
