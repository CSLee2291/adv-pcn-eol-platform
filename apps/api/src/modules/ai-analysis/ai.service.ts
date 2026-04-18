import { AzureOpenAI } from "openai";
import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { PCN_SUMMARY_SYSTEM_PROMPT, PCN_ANALYSIS_USER_PROMPT } from "./prompt-templates/pcn-summary.js";
import { aiResponseSchema } from "./ai.types.js";

export interface IAiService {
  analyzePcn(eventId: string): Promise<any>;
  getResult(eventId: string): Promise<any>;
  translateToTraditionalChinese?(texts: { summary: string; changeDescription: string; riskReason: string }): Promise<{ summary: string; changeDescription: string; riskReason: string }>;
}

// Real Azure OpenAI implementation
class RealAiService implements IAiService {
  private client: AzureOpenAI;

  constructor() {
    logger.info(
      { endpoint: env.AZURE_OPENAI_ENDPOINT, deployment: env.AZURE_OPENAI_DEPLOYMENT },
      "Initializing Azure OpenAI client"
    );
    this.client = new AzureOpenAI({
      endpoint: env.AZURE_OPENAI_ENDPOINT!,
      apiKey: env.AZURE_OPENAI_API_KEY!,
      apiVersion: env.AZURE_OPENAI_API_VERSION,
    });
  }

  async analyzePcn(eventId: string) {
    const event = await prisma.pcnEventMaster.findUniqueOrThrow({ where: { id: eventId } });

    if (!event.rawText) {
      throw new Error("No raw text available for analysis");
    }

    // Truncate very long texts to avoid token limits
    // gpt-5.4 supports 128K+ tokens; 50K chars ≈ ~15K tokens — safe limit
    const MAX_TEXT_LENGTH = 50000;
    const truncatedText = event.rawText.length > MAX_TEXT_LENGTH
      ? event.rawText.slice(0, MAX_TEXT_LENGTH) + "\n\n[... truncated for analysis ...]"
      : event.rawText;

    logger.info(
      { eventId, deployment: env.AZURE_OPENAI_DEPLOYMENT, textLen: truncatedText.length },
      "Calling Azure OpenAI for PCN analysis"
    );

    const response = await this.client.chat.completions.create({
      model: env.AZURE_OPENAI_DEPLOYMENT,
      messages: [
        { role: "system", content: PCN_SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: PCN_ANALYSIS_USER_PROMPT(truncatedText) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: 32768,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content;
    logger.info(
      {
        eventId,
        finishReason: choice?.finish_reason,
        hasContent: !!content,
        refusal: choice?.message?.refusal ?? null,
        contentFilter: (response as any).prompt_filter_results ?? null,
      },
      "Azure OpenAI response received"
    );
    if (!content) {
      throw new Error(`Empty AI response (finish_reason: ${choice?.finish_reason}, refusal: ${choice?.message?.refusal ?? "none"})`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      logger.error({ eventId, content: content.slice(0, 500) }, "Failed to parse AI JSON response");
      throw new Error("Invalid JSON in AI response");
    }

    const validation = aiResponseSchema.safeParse(parsed);
    if (!validation.success) {
      logger.error({ eventId, errors: validation.error.flatten() }, "AI response validation failed");
      throw new Error(`AI response validation failed: ${validation.error.message}`);
    }

    return this.saveResult(eventId, validation.data);
  }

  async getResult(eventId: string) {
    return prisma.aiAnalysisResult.findUnique({ where: { pcnEventId: eventId } });
  }

  async translateToTraditionalChinese(texts: { summary: string; changeDescription: string; riskReason: string }) {
    const prompt = `Translate the following PCN (Product Change Notice) analysis texts to Traditional Chinese (繁體中文). Keep technical terms (part numbers, vendor names, acronyms) in English. Return JSON with keys: summary, changeDescription, riskReason.

Summary: ${texts.summary}

Change Description: ${texts.changeDescription}

Risk Reason: ${texts.riskReason}`;

    const response = await this.client.chat.completions.create({
      model: env.AZURE_OPENAI_DEPLOYMENT,
      messages: [
        { role: "system", content: "You are a technical translator specializing in electronics/semiconductor PCN documents. Translate to Traditional Chinese (繁體中文). Keep MPN, vendor names, and technical acronyms in English. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty translation response");
    return JSON.parse(content);
  }

  private async saveResult(eventId: string, data: any) {
    const result = await prisma.aiAnalysisResult.upsert({
      where: { pcnEventId: eventId },
      create: {
        pcnEventId: eventId,
        summary: data.summary,
        changeDescription: data.changeDescription,
        formChanged: data.formChanged,
        fitChanged: data.fitChanged,
        functionChanged: data.functionChanged,
        riskLevel: data.riskLevel,
        riskReason: data.riskReason,
        affectedParts: data.affectedParts,
        aiModelVersion: env.AZURE_OPENAI_DEPLOYMENT,
        confidence: 0.85,
        rawAiResponse: data,
      },
      update: {
        summary: data.summary,
        changeDescription: data.changeDescription,
        formChanged: data.formChanged,
        fitChanged: data.fitChanged,
        functionChanged: data.functionChanged,
        riskLevel: data.riskLevel,
        riskReason: data.riskReason,
        affectedParts: data.affectedParts,
        rawAiResponse: data,
      },
    });

    await prisma.pcnEventMaster.update({
      where: { id: eventId },
      data: {
        status: "AI_ANALYZED",
        pcnType: data.pcnType ?? "OTHER",
        effectiveDate: data.effectiveDate && !isNaN(new Date(data.effectiveDate).getTime()) ? new Date(data.effectiveDate) : undefined,
      },
    });

    logger.info({ eventId, riskLevel: data.riskLevel }, "AI analysis completed");
    return result;
  }
}

// Mock AI service for local dev without Azure OpenAI
class MockAiService implements IAiService {
  async analyzePcn(eventId: string) {
    const event = await prisma.pcnEventMaster.findUniqueOrThrow({ where: { id: eventId } });
    const rawText = (event.rawText ?? "").toLowerCase();

    // Simple heuristic-based mock analysis
    const isEol = rawText.includes("end of life") || rawText.includes("eol") || rawText.includes("discontinu");
    const hasPackageChange = rawText.includes("package") || rawText.includes("qfn") || rawText.includes("bga");
    const hasFunctionChange = rawText.includes("electrical") || rawText.includes("specification") || rawText.includes("parameter");

    const mockResult = {
      summary: `Mock analysis of PCN document for ${event.vendorName}. ${isEol ? "End-of-Life notification detected." : "Product change notification."}`,
      changeDescription: "Mock change description based on document text.",
      formChanged: hasPackageChange,
      fitChanged: false,
      functionChanged: hasFunctionChange,
      riskLevel: isEol ? "CRITICAL" : hasFunctionChange ? "HIGH" : hasPackageChange ? "MEDIUM" : "LOW",
      riskReason: isEol ? "End-of-Life detected" : "Heuristic-based mock assessment",
      affectedParts: [] as { mpn: string; oldMpn: string | null; newMpn: string | null }[],
      pcnType: isEol ? "EOL" : "PCN",
      effectiveDate: null,
      recommendedActions: ["Review PCN document manually", "Verify affected parts"],
    };

    // Extract MPNs from text
    // PDF table extraction often concatenates columns, e.g. "AMC1100DWVRNULL" or "AMC1100DWVRAMC1306M05DWV"
    // Strategy: split on known manufacturer prefixes, then validate each part
    const prefixes = ["AMC", "ISO", "UCC", "TLA", "SN2", "LM", "TPS", "TLV", "OPA", "ADS", "INA", "REF", "DAC", "ADC", "BQ", "TMP", "MSP", "STM", "NXP"];
    const prefixPattern = new RegExp(`(?=${prefixes.join("|")})`, "g");
    const originalText = event.rawText ?? "";

    // Find lines that look like part lists (contain multiple MPN-like strings)
    const allMpns = new Set<string>();
    const lines = originalText.split("\n");
    for (const line of lines) {
      // Split concatenated MPNs by known prefixes
      const parts = line.split(prefixPattern).filter(Boolean);
      for (const part of parts) {
        const trimmed = part.replace(/NULL$/i, "").trim();
        // Valid MPN: starts with letters, has digits, 6-20 chars, no spaces
        if (/^[A-Z]{2,5}\d{2,}[A-Z0-9-]{0,15}$/i.test(trimmed) && trimmed.length >= 6 && trimmed.length <= 20) {
          allMpns.add(trimmed.toUpperCase());
        }
      }
    }

    // Also try standard regex on original text for simpler formats
    const simplePattern = /\b([A-Z]{2,5}\d{3,}[A-Z0-9]{0,12})\b/g;
    let m: RegExpExecArray | null;
    while ((m = simplePattern.exec(originalText)) !== null) {
      const mpn = m[1];
      if (mpn.length >= 6 && mpn.length <= 20) allMpns.add(mpn);
    }

    mockResult.affectedParts = [...allMpns].slice(0, 30).map((mpn) => ({ mpn, oldMpn: null, newMpn: null }));

    const result = await prisma.aiAnalysisResult.upsert({
      where: { pcnEventId: eventId },
      create: {
        pcnEventId: eventId,
        summary: mockResult.summary,
        changeDescription: mockResult.changeDescription,
        formChanged: mockResult.formChanged,
        fitChanged: mockResult.fitChanged,
        functionChanged: mockResult.functionChanged,
        riskLevel: mockResult.riskLevel as any,
        riskReason: mockResult.riskReason,
        affectedParts: mockResult.affectedParts,
        aiModelVersion: "mock-v1",
        confidence: 0.5,
        rawAiResponse: mockResult,
      },
      update: {
        summary: mockResult.summary,
        changeDescription: mockResult.changeDescription,
        formChanged: mockResult.formChanged,
        fitChanged: mockResult.fitChanged,
        functionChanged: mockResult.functionChanged,
        riskLevel: mockResult.riskLevel as any,
        riskReason: mockResult.riskReason,
        affectedParts: mockResult.affectedParts,
        rawAiResponse: mockResult,
      },
    });

    await prisma.pcnEventMaster.update({
      where: { id: eventId },
      data: {
        status: "AI_ANALYZED",
        pcnType: mockResult.pcnType as any,
      },
    });

    logger.info({ eventId, mode: "mock", riskLevel: mockResult.riskLevel }, "Mock AI analysis completed");
    return result;
  }

  async getResult(eventId: string) {
    return prisma.aiAnalysisResult.findUnique({ where: { pcnEventId: eventId } });
  }
}

export class AiServiceFactory {
  static create(): IAiService {
    if (env.AI_SERVICE_MODE === "real") {
      return new RealAiService();
    }
    logger.info("Using mock AI service");
    return new MockAiService();
  }
}
