import type { FastifyRequest, FastifyReply } from "fastify";
import { WhereUsedService } from "./whereused.service.js";
import { DenodoMpnSearchService } from "./denodo-mpn.service.js";
import { DenodoPartsInfoService } from "./denodo-parts.service.js";
import { DenodoWhereUsedService } from "./denodo-whereused.service.js";
import { MpnCacheService } from "./mpn-cache.service.js";
import { WhereUsedCacheService } from "./whereused-cache.service.js";
import { DenodoExportService } from "./denodo-export.service.js";

export class WhereUsedController {
  private service = new WhereUsedService();
  private mpnService = new DenodoMpnSearchService();
  private partsService = new DenodoPartsInfoService();
  private whereUsedService = new DenodoWhereUsedService();
  private cacheService = new MpnCacheService();
  private wuCacheService = new WhereUsedCacheService();
  private exportService = new DenodoExportService();

  analyze = async (request: FastifyRequest, reply: FastifyReply) => {
    const { assessmentId } = request.params as { assessmentId: string };
    const result = await this.service.fullImpactAnalysis(assessmentId);
    return reply.send({ success: true, data: result });
  };

  getResult = async (request: FastifyRequest, reply: FastifyReply) => {
    const { assessmentId } = request.params as { assessmentId: string };
    const result = await this.service.getResult(assessmentId);
    return reply.send({ success: true, data: result });
  };

  /** MPN search with local cache — API-1 */
  searchMpn = async (request: FastifyRequest, reply: FastifyReply) => {
    const { mpns } = request.body as { mpns: string[] };
    if (!mpns?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "mpns array required" } });
    }
    const result = await this.cacheService.searchWithCache(mpns);
    return reply.send({ success: true, data: result });
  };

  /** Force re-search specific MPNs from Denodo (bypass cache) */
  refreshMpn = async (request: FastifyRequest, reply: FastifyReply) => {
    const { mpns } = request.body as { mpns: string[] };
    if (!mpns?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "mpns array required" } });
    }
    const result = await this.cacheService.forceRefresh(mpns);
    return reply.send({ success: true, data: result });
  };

  /** Get cache statistics */
  getCacheStats = async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = await this.cacheService.getCacheStats();
    return reply.send({ success: true, data: stats });
  };

  /** Parts info lookup — API-2 + API-4 */
  getPartsInfo = async (request: FastifyRequest, reply: FastifyReply) => {
    const { itemNumbers, manufactureData } = request.body as {
      itemNumbers: string[];
      manufactureData?: Record<string, { MPN: string; Manufacturer: string }>;
    };
    if (!itemNumbers?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "itemNumbers array required" } });
    }
    const result = await this.partsService.getPartsInfo(itemNumbers, manufactureData);
    return reply.send({ success: true, data: result });
  };

  /** Where-used BOM query with cache — API-3 */
  getWhereUsed = async (request: FastifyRequest, reply: FastifyReply) => {
    const { itemNumbers } = request.body as { itemNumbers: string[] };
    if (!itemNumbers?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "itemNumbers array required" } });
    }
    const result = await this.wuCacheService.searchWithCache(itemNumbers);
    return reply.send({ success: true, data: result });
  };

  /** Force refresh where-used cache */
  refreshWhereUsed = async (request: FastifyRequest, reply: FastifyReply) => {
    const { itemNumbers } = request.body as { itemNumbers: string[] };
    if (!itemNumbers?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "itemNumbers array required" } });
    }
    const result = await this.wuCacheService.forceRefresh(itemNumbers);
    return reply.send({ success: true, data: result });
  };

  /** SSE streaming where-used query with progress */
  streamWhereUsed = async (request: FastifyRequest, reply: FastifyReply) => {
    const { itemNumbers, refresh } = request.body as { itemNumbers: string[]; refresh?: boolean };
    if (!itemNumbers?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "itemNumbers array required" } });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const onProgress = (event: any) => {
        sendEvent("progress", event);
      };

      const result = refresh
        ? await this.wuCacheService.forceRefresh(itemNumbers, onProgress)
        : await this.wuCacheService.searchWithCache(itemNumbers, onProgress);

      // Send only metadata via SSE (not the full dataset — too large for SSE)
      // Frontend will fetch full data via the cached REST endpoint after this
      sendEvent("complete", {
        total: result.total,
        cache_stats: result.cache_stats,
      });
    } catch (err: any) {
      sendEvent("error", { message: err.message });
    }

    reply.raw.end();
  };

  /** Where-used cache stats */
  getWhereUsedCacheStats = async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = await this.wuCacheService.getCacheStats();
    return reply.send({ success: true, data: stats });
  };

  /** Export Parts Info + Where-Used data as Excel download (data in body) */
  exportExcel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { parts_info, where_used } = request.body as {
      parts_info: any[];
      where_used: any[];
    };
    if (!parts_info?.length && !where_used?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "parts_info or where_used data required" } });
    }
    return this.sendExcel(reply, parts_info ?? [], where_used ?? []);
  };

  /** Export using server-side cached where-used data + optional pre-loaded parts info */
  exportExcelFromCache = async (request: FastifyRequest, reply: FastifyReply) => {
    const { itemNumbers, manufactureData, parts_info } = request.body as {
      itemNumbers: string[];
      manufactureData?: Record<string, { MPN: string; Manufacturer: string }>;
      parts_info?: any[]; // Pass from frontend if already loaded (avoids Denodo re-query)
    };
    if (!itemNumbers?.length) {
      return reply.status(400).send({ success: false, error: { code: "INVALID_INPUT", message: "itemNumbers required" } });
    }

    // Where-used from cache (instant), parts info from frontend or Denodo
    const wuResult = await this.wuCacheService.searchWithCache(itemNumbers);
    const piData = parts_info?.length
      ? parts_info
      : (await this.partsService.getPartsInfo(itemNumbers, manufactureData)).parts_info;

    return this.sendExcel(reply, piData, wuResult.where_used);
  };

  private async sendExcel(reply: FastifyReply, parts_info: any[], where_used: any[]) {
    const result = await this.exportService.exportExcel({ parts_info, where_used });
    const fs = await import("fs");
    const fileBuffer = fs.readFileSync(result.output_path);
    const filename = result.output_path.split(/[/\\]/).pop() ?? "export.xlsx";
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(fileBuffer);
  }
}
