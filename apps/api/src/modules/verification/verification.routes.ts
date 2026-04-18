import type { FastifyInstance } from "fastify";
import { VerificationController } from "./verification.controller.js";

export async function verificationRoutes(app: FastifyInstance) {
  const c = new VerificationController();

  // Excel PCN list (for picker)
  app.get("/excel-pcns", c.listExcelPcns);

  // Batch management
  app.post("/generate", c.generateBatch);
  app.get("/batches", c.listBatches);
  app.get("/batches/:batchId", c.getBatch);
  app.post("/batches/:batchId/add", c.addToBatch);
  app.post("/batches/:batchId/run-all", c.runAllReady);
  app.post("/batches/:batchId/rerun", c.rerunBatch);

  // Record management
  app.get("/records/:id", c.getRecord);
  app.delete("/records/:id", c.removeRecord);
  app.patch("/records/:id/email-ready", c.markEmailReady);
  app.post("/records/:id/run", c.runRecord);

  // History / trend
  app.get("/history", c.getHistory);
}
