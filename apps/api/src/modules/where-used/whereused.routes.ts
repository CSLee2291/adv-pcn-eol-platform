import type { FastifyInstance } from "fastify";
import { WhereUsedController } from "./whereused.controller.js";

export async function whereUsedRoutes(app: FastifyInstance) {
  const controller = new WhereUsedController();

  // Full pipeline (requires CE assessment)
  app.post("/analyze/:assessmentId", controller.analyze);
  app.get("/result/:assessmentId", controller.getResult);

  // MPN search with cache
  app.post("/search-mpn", controller.searchMpn);
  app.post("/search-mpn/refresh", controller.refreshMpn);
  app.get("/cache-stats", controller.getCacheStats);

  // Direct Denodo queries (with cache)
  app.post("/parts-info", controller.getPartsInfo);
  app.post("/where-used-query", controller.getWhereUsed);
  app.post("/where-used-query/refresh", controller.refreshWhereUsed);
  app.post("/where-used-query/stream", controller.streamWhereUsed);
  app.get("/where-used-cache-stats", controller.getWhereUsedCacheStats);

  // Export
  app.post("/export-excel", controller.exportExcel);
  app.post("/export-excel-cached", controller.exportExcelFromCache);
}
