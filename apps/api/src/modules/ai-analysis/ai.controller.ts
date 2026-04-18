import type { FastifyRequest, FastifyReply } from "fastify";
import { AiServiceFactory } from "./ai.service.js";

export class AiController {
  private service = AiServiceFactory.create();

  analyze = async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = request.params as { eventId: string };
    const result = await this.service.analyzePcn(eventId);
    return reply.send({ success: true, data: result });
  };

  getResult = async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = request.params as { eventId: string };
    const result = await this.service.getResult(eventId);
    if (!result) {
      return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "Analysis result not found" } });
    }
    return reply.send({ success: true, data: result });
  };

  translate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { summary, changeDescription, riskReason } = request.body as {
      summary: string; changeDescription: string; riskReason: string;
    };
    if (!this.service.translateToTraditionalChinese) {
      return reply.status(400).send({ success: false, error: { message: "Translation not available in mock mode" } });
    }
    const result = await this.service.translateToTraditionalChinese({ summary, changeDescription, riskReason });
    return reply.send({ success: true, data: result });
  };
}
