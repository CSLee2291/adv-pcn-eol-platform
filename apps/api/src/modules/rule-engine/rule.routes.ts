import type { FastifyInstance } from "fastify";
import { RuleController } from "./rule.controller.js";

export async function ruleRoutes(app: FastifyInstance) {
  const controller = new RuleController();

  app.post("/evaluate/:eventId", controller.evaluate);
}
