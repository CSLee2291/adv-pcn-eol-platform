import axios, { type AxiosInstance } from "axios";
import https from "https";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/**
 * Shared Denodo REST API HTTP client.
 * All 4 APIs use the same base URL and Basic Auth credentials.
 *
 * Note: Denodo OData $ parameters must NOT be URL-encoded.
 */
export class DenodoClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.DENODO_REST_BASE_URL,
      auth: {
        username: env.DENODO_USERNAME ?? "",
        password: env.DENODO_PASSWORD ?? "",
      },
      headers: {
        Accept: "application/json;charset=UTF-8;subtype=denodo-9",
      },
      // Dev/test environments may use self-signed certs
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      // Custom param serializer to avoid encoding $ in OData params
      paramsSerializer: {
        serialize: (params) => {
          return Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
            .join("&");
        },
      },
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        logger.error(
          { url: err.config?.url, status: err.response?.status, message: err.message },
          "Denodo API request failed"
        );
        throw err;
      }
    );
  }

  async get<T>(path: string, params: Record<string, string | undefined>): Promise<T[]> {
    const response = await this.http.get(path, { params: { ...params, $format: "json" } });
    return (response.data.elements ?? []) as T[];
  }

  getHttpClient() {
    return this.http;
  }
}

// Singleton
let instance: DenodoClient | null = null;
export function getDenodoClient(): DenodoClient {
  if (!instance) instance = new DenodoClient();
  return instance;
}
