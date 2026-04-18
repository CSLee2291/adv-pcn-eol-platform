import type { FastifyInstance } from "fastify";
import { PcnController } from "./pcn.controller.js";

export async function pcnRoutes(app: FastifyInstance) {
  const controller = new PcnController();

  app.post("/upload", controller.upload);
  app.post("/upload-email", controller.uploadEmail);
  app.get("/events", controller.list);
  app.get("/events/:id", controller.getById);
  app.patch("/events/:id", controller.update);
  app.post("/events/:id/approve", controller.approve);
  app.post("/events/:id/assessment", controller.createAssessment);
  app.get("/events/:id/assessments", controller.getAssessments);
}
