import type { FastifyInstance } from "fastify";
import { AiController } from "./ai.controller.js";

export async function aiRoutes(app: FastifyInstance) {
  const controller = new AiController();

  app.post("/analyze/:eventId", controller.analyze);
  app.get("/result/:eventId", controller.getResult);
  app.post("/translate", controller.translate);
}
