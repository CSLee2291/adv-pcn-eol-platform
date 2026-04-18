import type { FastifyRequest, FastifyReply } from "fastify";
import { NotificationService } from "./notification.service.js";

export class NotificationController {
  private service = new NotificationService();

  send = async (request: FastifyRequest, reply: FastifyReply) => {
    const { caseId } = request.params as { caseId: string };
    const result = await this.service.evaluateAndNotify(caseId);
    return reply.send({ success: true, data: result });
  };

  getLog = async (request: FastifyRequest, reply: FastifyReply) => {
    const { caseId } = request.params as { caseId: string };
    const result = await this.service.getNotificationLog(caseId);
    return reply.send({ success: true, data: result });
  };
}
