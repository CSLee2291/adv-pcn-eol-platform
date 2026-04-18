import type { FastifyInstance } from "fastify";
import { NotificationController } from "./notification.controller.js";

export async function notificationRoutes(app: FastifyInstance) {
  const controller = new NotificationController();

  app.post("/send/:caseId", controller.send);
  app.get("/log/:caseId", controller.getLog);
}
