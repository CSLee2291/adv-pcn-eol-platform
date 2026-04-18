import type { FastifyRequest, FastifyReply } from "fastify";
import { PcnService } from "./pcn.service.js";

export class PcnController {
  private service = new PcnService();

  upload = async (request: FastifyRequest, reply: FastifyReply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ success: false, error: { code: "NO_FILE", message: "No file uploaded" } });
    }
    const result = await this.service.uploadPcn(file);
    return reply.status(201).send({ success: true, data: result });
  };

  uploadEmail = async (request: FastifyRequest, reply: FastifyReply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ success: false, error: { code: "NO_FILE", message: "No file uploaded" } });
    }
    const ext = file.filename.toLowerCase().split(".").pop();
    if (ext !== "msg" && ext !== "eml") {
      return reply.status(400).send({
        success: false,
        error: { code: "INVALID_FORMAT", message: "Only .msg and .eml files are supported" },
      });
    }
    const result = await this.service.uploadEmail(file);
    return reply.status(201).send({ success: true, data: result });
  };

  approve = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const event = await this.service.approveEvent(id);
    return reply.send({ success: true, data: event });
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { page?: string; pageSize?: string; status?: string; search?: string };
    const result = await this.service.listEvents({
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 20,
      status: query.status,
    });
    return reply.send({ success: true, ...result });
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.getEventById(id);
    if (!result) {
      return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "PCN event not found" } });
    }
    return reply.send({ success: true, data: result });
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const result = await this.service.updateEvent(id, body);
    return reply.send({ success: true, data: result });
  };

  createAssessment = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const result = await this.service.createCeAssessment(id, body);
    return reply.status(201).send({ success: true, data: result });
  };

  getAssessments = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.getCeAssessments(id);
    return reply.send({ success: true, data: result });
  };
}
