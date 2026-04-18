import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: `.env.${process.env.NODE_ENV || "local"}`, override: true });
dotenv.config({ override: true }); // fallback to .env — override system env vars

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().url(),

  // Azure OpenAI
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().default("gpt-5.4"),
  AZURE_OPENAI_API_VERSION: z.string().default("2024-12-01-preview"),

  // AI mode: "real" | "mock"
  AI_SERVICE_MODE: z.enum(["real", "mock"]).default("mock"),

  // Denodo
  DENODO_REST_BASE_URL: z.string().default("https://dataplatform.advantech.com.tw:9443/server/dx_ce"),
  DENODO_USERNAME: z.string().optional(),
  DENODO_PASSWORD: z.string().optional(),

  // Email Ingestion
  EMAIL_INGEST_MODE: z.enum(["real", "mock"]).default("mock"),

  // Email Sending
  EMAIL_SEND_ENABLED: z.string().default("false").transform((v) => v === "true" || v === "1"), // Master switch
  EMAIL_TRANSPORT: z.enum(["smtp", "gmail", "disabled"]).default("disabled"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().default("ce-notification@advantech.com"),
  SMTP_FROM_NAME: z.string().default("Advantech CE Platform"),
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),

  // Local uploads
  LOCAL_UPLOAD_DIR: z.string().default("./uploads"),

  // Azure Blob Storage (staging/production)
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
