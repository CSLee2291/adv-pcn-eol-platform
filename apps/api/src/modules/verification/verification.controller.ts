import type { FastifyRequest, FastifyReply } from "fastify";
import { VerificationService } from "./verification.service.js";

export class VerificationController {
  private service = new VerificationService();

  listExcelPcns = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listExcelPcns();
    return reply.send({ success: true, data });
  };

  generateBatch = async (req: FastifyRequest, reply: FastifyReply) => {
    const { count = 20 } = req.body as { count?: number };
    const data = await this.service.generateBatch(count);
    return reply.status(201).send({ success: true, data });
  };

  listBatches = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listBatches();
    return reply.send({ success: true, data });
  };

  getBatch = async (req: FastifyRequest, reply: FastifyReply) => {
    const { batchId } = req.params as { batchId: string };
    const data = await this.service.getBatch(batchId);
    if (!data) return reply.status(404).send({ success: false, error: { message: "Batch not found" } });
    return reply.send({ success: true, data });
  };

  addToBatch = async (req: FastifyRequest, reply: FastifyReply) => {
    const { batchId } = req.params as { batchId: string };
    const { pcnNumber } = req.body as { pcnNumber: string };
    if (!pcnNumber) return reply.status(400).send({ success: false, error: { message: "pcnNumber required" } });
    const data = await this.service.addToBatch(batchId, pcnNumber);
    return reply.status(201).send({ success: true, data });
  };

  removeRecord = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const data = await this.service.removeFromBatch(id);
    return reply.send({ success: true, data });
  };

  markEmailReady = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { fileName } = req.body as { fileName: string };
    if (!fileName) return reply.status(400).send({ success: false, error: { message: "fileName required" } });
    const data = await this.service.markEmailReady(id, fileName);
    return reply.send({ success: true, data });
  };

  runRecord = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const data = await this.service.runVerification(id);
    return reply.send({ success: true, data });
  };

  runAllReady = async (req: FastifyRequest, reply: FastifyReply) => {
    const { batchId } = req.params as { batchId: string };
    const data = await this.service.runAllReady(batchId);
    return reply.send({ success: true, data });
  };

  rerunBatch = async (req: FastifyRequest, reply: FastifyReply) => {
    const { batchId } = req.params as { batchId: string };
    const data = await this.service.rerunBatch(batchId);
    return reply.status(201).send({ success: true, data });
  };

  getRecord = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const data = await this.service.getRecord(id);
    if (!data) return reply.status(404).send({ success: false, error: { message: "Record not found" } });
    return reply.send({ success: true, data });
  };

  getHistory = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.getHistory();
    return reply.send({ success: true, data });
  };
}
