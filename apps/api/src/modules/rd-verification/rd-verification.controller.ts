import type { FastifyRequest, FastifyReply } from "fastify";
import { RdVerificationService } from "./rd-verification.service.js";

export class RdVerificationController {
  private service = new RdVerificationService();

  /** Auto-suggest RD based on product owners from Where-Used data */
  suggestRd = async (req: FastifyRequest, reply: FastifyReply) => {
    const { assessmentId } = req.params as { assessmentId: string };
    const suggestions = await this.service.suggestRd(assessmentId);
    return reply.send({ success: true, data: suggestions });
  };

  /** Create an RD verification task */
  createTask = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    if (!body.ceAssessmentId || !body.pcnEventId || !body.assignedRdName || !body.assignedRdEmail || !body.assignedBy) {
      return reply.status(400).send({
        success: false,
        error: { message: "ceAssessmentId, pcnEventId, assignedRdName, assignedRdEmail, assignedBy required" },
      });
    }
    const task = await this.service.createTask(body);
    return reply.status(201).send({ success: true, data: task });
  };

  /** List tasks with optional filters */
  listTasks = async (req: FastifyRequest, reply: FastifyReply) => {
    const filters = req.query as { status?: string; assignedRdEmail?: string; pcnEventId?: string };
    const tasks = await this.service.listTasks(filters);
    return reply.send({ success: true, data: tasks });
  };

  /** Get a single task */
  getTask = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const task = await this.service.getTask(id);
    if (!task) return reply.status(404).send({ success: false, error: { message: "Task not found" } });
    return reply.send({ success: true, data: task });
  };

  /** RD responds with decision */
  respond = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { rdDecision, rdComments } = req.body as { rdDecision: string; rdComments?: string };
    if (!rdDecision) {
      return reply.status(400).send({ success: false, error: { message: "rdDecision required (PASS/FAIL/CONDITIONAL)" } });
    }
    const task = await this.service.respond(id, { rdDecision, rdComments });
    return reply.send({ success: true, data: task });
  };

  /** Cancel a task */
  cancelTask = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const task = await this.service.cancelTask(id);
    return reply.send({ success: true, data: task });
  };

  /** Send reminder to assigned RD */
  sendReminder = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = await this.service.sendReminder(id);
    return reply.send({ success: true, data: result });
  };
}
