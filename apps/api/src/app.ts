import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/database.js";
import { pcnRoutes } from "./modules/pcn/pcn.routes.js";
import { aiRoutes } from "./modules/ai-analysis/ai.routes.js";
import { ruleRoutes } from "./modules/rule-engine/rule.routes.js";
import { whereUsedRoutes } from "./modules/where-used/whereused.routes.js";
import { notificationRoutes } from "./modules/notification/notification.routes.js";
import { notificationRulesRoutes } from "./modules/notifications/notification-rules.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { verificationRoutes } from "./modules/verification/verification.routes.js";
import { rdVerificationRoutes } from "./modules/rd-verification/rd-verification.routes.js";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "development" ? "debug" : "info",
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
  bodyLimit: 50 * 1024 * 1024, // 50MB — needed for large where-used Excel exports
});

async function start() {
  // Plugins
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // API routes
  await app.register(pcnRoutes, { prefix: "/api/v1/pcn" });
  await app.register(aiRoutes, { prefix: "/api/v1/ai" });
  await app.register(ruleRoutes, { prefix: "/api/v1/rules" });
  await app.register(whereUsedRoutes, { prefix: "/api/v1/whereused" });
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });
  await app.register(notificationRulesRoutes, { prefix: "/api/v1/notification-rules" });
  await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  await app.register(verificationRoutes, { prefix: "/api/v1/verification" });
  await app.register(rdVerificationRoutes, { prefix: "/api/v1/rd-verification" });

  // Global error handler
  app.setErrorHandler((error: any, _request, reply) => {
    app.log.error(error);
    reply.status(error.statusCode ?? 500).send({
      success: false,
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.message,
      },
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down...");
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Server running on http://localhost:${env.PORT}`);
}

start().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});

export { app };
