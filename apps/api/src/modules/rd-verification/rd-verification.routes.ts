import type { FastifyInstance } from "fastify";
import { RdVerificationController } from "./rd-verification.controller.js";

export async function rdVerificationRoutes(app: FastifyInstance) {
  const c = new RdVerificationController();

  // RD suggestion
  app.get("/suggest/:assessmentId", c.suggestRd);

  // Task CRUD
  app.post("/create", c.createTask);
  app.get("/tasks", c.listTasks);
  app.get("/tasks/:id", c.getTask);

  // RD response
  app.post("/tasks/:id/respond", c.respond);
  app.post("/tasks/:id/remind", c.sendReminder);
  app.delete("/tasks/:id", c.cancelTask);
}
