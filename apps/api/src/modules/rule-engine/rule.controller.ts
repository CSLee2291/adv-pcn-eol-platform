import type { FastifyRequest, FastifyReply } from "fastify";
import { RuleEngineService } from "./rule.service.js";

export class RuleController {
  private service = new RuleEngineService();

  evaluate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = request.params as { eventId: string };
    const result = await this.service.evaluate(eventId);
    return reply.send({ success: true, data: result });
  };
}
