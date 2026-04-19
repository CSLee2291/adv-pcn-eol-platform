import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
});

// Dashboard
export const fetchKpi = () => api.get("/dashboard/kpi").then((r) => r.data.data);

// PCN Events
export const fetchEvents = (params?: Record<string, string>) =>
  api.get("/pcn/events", { params }).then((r) => r.data);
export const fetchEvent = (id: string) =>
  api.get(`/pcn/events/${id}`).then((r) => r.data.data);
export const uploadPcn = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/pcn/upload", form).then((r) => r.data.data);
};

export const uploadEmail = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/pcn/upload-email", form).then((r) => r.data.data);
};
export const updateEvent = (id: string, data: Record<string, any>) =>
  api.patch(`/pcn/events/${id}`, data).then((r) => r.data.data);
export const approveEvent = (id: string) =>
  api.post(`/pcn/events/${id}/approve`).then((r) => r.data.data);
export const createCeAssessment = (eventId: string, data: {
  assessorName: string;
  ceDecision: string;
  comments?: string;
  overrideRiskLevel?: string;
  needRdVerification?: boolean;
}) => api.post(`/pcn/events/${eventId}/assessment`, data).then((r) => r.data.data);
export const fetchCeAssessments = (eventId: string) =>
  api.get(`/pcn/events/${eventId}/assessments`).then((r) => r.data.data);

// AI Analysis
export const triggerAnalysis = (eventId: string) =>
  api.post(`/ai/analyze/${eventId}`).then((r) => r.data.data);
export const fetchAnalysis = (eventId: string) =>
  api.get(`/ai/result/${eventId}`).then((r) => r.data.data);
export const translateAnalysis = (texts: { summary: string; changeDescription: string; riskReason: string }) =>
  api.post("/ai/translate", texts).then((r) => r.data.data);

// Rule Engine
export const triggerRules = (eventId: string) =>
  api.post(`/rules/evaluate/${eventId}`).then((r) => r.data.data);

// Where-used
export const triggerWhereUsed = (assessmentId: string) =>
  api.post(`/whereused/analyze/${assessmentId}`).then((r) => r.data.data);
export const fetchWhereUsed = (assessmentId: string) =>
  api.get(`/whereused/result/${assessmentId}`).then((r) => r.data.data);

// MPN search (with cache)
export const searchMpn = (mpns: string[]) =>
  api.post("/whereused/search-mpn", { mpns }).then((r) => r.data.data);
export const refreshMpn = (mpns: string[]) =>
  api.post("/whereused/search-mpn/refresh", { mpns }).then((r) => r.data.data);
export const getCacheStats = () =>
  api.get("/whereused/cache-stats").then((r) => r.data.data);

// Direct Denodo queries (with cache)
export const getPartsInfo = (itemNumbers: string[], manufactureData?: Record<string, { MPN: string; Manufacturer: string }>) =>
  api.post("/whereused/parts-info", { itemNumbers, manufactureData }).then((r) => r.data.data);
export const getWhereUsedQuery = (itemNumbers: string[]) =>
  api.post("/whereused/where-used-query", { itemNumbers }).then((r) => r.data.data);
export const refreshWhereUsedQuery = (itemNumbers: string[]) =>
  api.post("/whereused/where-used-query/refresh", { itemNumbers }).then((r) => r.data.data);
export const exportWhereUsedExcel = (parts_info: any[], where_used: any[]) =>
  api.post("/whereused/export-excel", { parts_info, where_used }, { responseType: "blob" });
export const exportExcelFromCache = (
  itemNumbers: string[],
  opts?: { manufactureData?: Record<string, { MPN: string; Manufacturer: string }>; parts_info?: any[] },
) =>
  api.post("/whereused/export-excel-cached", { itemNumbers, ...opts }, { responseType: "blob" });

/** SSE streaming where-used query with progress callbacks */
export function streamWhereUsedQuery(
  itemNumbers: string[],
  options: {
    onProgress?: (event: any) => void;
    onComplete?: (data: any) => void;
    onError?: (error: string) => void;
    refresh?: boolean;
  },
): AbortController {
  const controller = new AbortController();
  const baseUrl = api.defaults.baseURL || "/api/v1";

  fetch(`${baseUrl}/whereused/where-used-query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemNumbers, refresh: options.refresh }),
    signal: controller.signal,
  })
    .then(async (response) => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line
        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") options.onProgress?.(data);
              else if (eventType === "complete") options.onComplete?.(data);
              else if (eventType === "error") options.onError?.(data.message);
            } catch { /* ignore parse errors */ }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") options.onError?.(err.message);
    });

  return controller;
}

// Notification Rules
const nr = "/notification-rules";
export const fetchNotificationRules = () => api.get(`${nr}/rules`).then((r) => r.data.data);
export const createNotificationRule = (data: any) => api.post(`${nr}/rules`, data).then((r) => r.data.data);
export const updateNotificationRule = (id: string, data: any) => api.patch(`${nr}/rules/${id}`, data).then((r) => r.data.data);
export const deleteNotificationRule = (id: string) => api.delete(`${nr}/rules/${id}`).then((r) => r.data);
export const seedNotificationRules = () => api.post(`${nr}/seed`).then((r) => r.data.data);

// Notification Customers
export const fetchNotificationCustomers = () => api.get(`${nr}/customers`).then((r) => r.data.data);
export const searchNotificationCustomers = (params: Record<string, any>) => api.get(`${nr}/customers/search`, { params }).then((r) => r.data.data);
export const createNotificationCustomer = (data: any) => api.post(`${nr}/customers`, data).then((r) => r.data.data);
export const updateNotificationCustomer = (id: string, data: any) => api.patch(`${nr}/customers/${id}`, data).then((r) => r.data.data);
export const assignCustomerRule = (customerId: string, ruleId: string) => api.post(`${nr}/customer-rules/assign`, { customerId, ruleId }).then((r) => r.data.data);
export const removeCustomerRule = (customerId: string, ruleId: string) => api.post(`${nr}/customer-rules/remove`, { customerId, ruleId }).then((r) => r.data.data);
export const bulkAssignCustomerRule = (customerIds: string[], ruleId: string) => api.post(`${nr}/customer-rules/bulk-assign`, { customerIds, ruleId }).then((r) => r.data.data);
export const bulkRemoveCustomerRule = (customerIds: string[], ruleId: string) => api.post(`${nr}/customer-rules/bulk-remove`, { customerIds, ruleId }).then((r) => r.data.data);

// Tracked Products
export const fetchTrackedProducts = () => api.get(`${nr}/products`).then((r) => r.data.data);
export const searchTrackedProducts = (params: Record<string, any>) => api.get(`${nr}/products/search`, { params }).then((r) => r.data.data);
export const createTrackedProduct = (data: any) => api.post(`${nr}/products`, data).then((r) => r.data.data);
export const assignProductRule = (productId: string, ruleId: string, customerId?: string) => api.post(`${nr}/product-rules/assign`, { productId, ruleId, customerId }).then((r) => r.data.data);
export const removeProductRule = (id: string) => api.delete(`${nr}/product-rules/${id}`).then((r) => r.data);
export const bulkAssignProductRule = (productIds: string[], ruleId: string) => api.post(`${nr}/product-rules/bulk-assign`, { productIds, ruleId }).then((r) => r.data.data);
export const bulkRemoveProductRule = (productIds: string[], ruleId: string) => api.post(`${nr}/product-rules/bulk-remove`, { productIds, ruleId }).then((r) => r.data.data);

// Templates
export const fetchTemplates = () => api.get(`${nr}/templates`).then((r) => r.data.data);

// Email preview & sending
export const getEmailPreviewUrl = (eventId: string) => `${api.defaults.baseURL}${nr}/email/preview/${eventId}`;
export const sendTestEmail = (eventId: string, recipientEmail: string) =>
  api.post(`${nr}/email/send-test`, { eventId, recipientEmail }).then((r) => r.data.data);
export const getEmailStatus = () => api.get(`${nr}/email/status`).then((r) => r.data.data);
export const applyTemplate = (templateId: string, entityType: "customer" | "product", entityIds: string[]) => api.post(`${nr}/templates/apply`, { templateId, entityType, entityIds }).then((r) => r.data.data);

// Notification Queue
export const evaluateNotifications = (eventId: string) => api.post(`${nr}/evaluate/${eventId}`).then((r) => r.data.data);
export const fetchNotificationQueue = (status?: string) => api.get(`${nr}/queue`, { params: status ? { status } : {} }).then((r) => r.data.data);
export const approveNotification = (id: string, reviewedBy: string) => api.post(`${nr}/queue/${id}/approve`, { reviewedBy }).then((r) => r.data.data);
export const skipNotification = (id: string, reviewedBy: string) => api.post(`${nr}/queue/${id}/skip`, { reviewedBy }).then((r) => r.data.data);

// Verification
const vr = "/verification";
export const fetchExcelPcns = () => api.get(`${vr}/excel-pcns`).then((r) => r.data.data);
export const generateVerificationBatch = (count: number) => api.post(`${vr}/generate`, { count }).then((r) => r.data.data);
export const fetchVerificationBatches = () => api.get(`${vr}/batches`).then((r) => r.data.data);
export const fetchVerificationBatch = (batchId: string) => api.get(`${vr}/batches/${batchId}`).then((r) => r.data.data);
export const addPcnToBatch = (batchId: string, pcnNumber: string) => api.post(`${vr}/batches/${batchId}/add`, { pcnNumber }).then((r) => r.data.data);
export const removeVerificationRecord = (id: string) => api.delete(`${vr}/records/${id}`).then((r) => r.data);
export const markVerificationEmailReady = (id: string, fileName: string) => api.patch(`${vr}/records/${id}/email-ready`, { fileName }).then((r) => r.data.data);
export const runVerificationRecord = (id: string) => api.post(`${vr}/records/${id}/run`).then((r) => r.data.data);
export const runAllReadyInBatch = (batchId: string) => api.post(`${vr}/batches/${batchId}/run-all`).then((r) => r.data.data);
export const rerunVerificationBatch = (batchId: string) => api.post(`${vr}/batches/${batchId}/rerun`).then((r) => r.data.data);
export const fetchVerificationHistory = () => api.get(`${vr}/history`).then((r) => r.data.data);

// RD Verification
const rd = "/rd-verification";
export const suggestRd = (assessmentId: string) => api.get(`${rd}/suggest/${assessmentId}`).then((r) => r.data.data);
export const createRdTask = (data: {
  ceAssessmentId: string; pcnEventId: string;
  assignedRdName: string; assignedRdEmail: string; assignedBy: string;
  priority?: string; dueDate?: string;
}) => api.post(`${rd}/create`, data).then((r) => r.data.data);
export const fetchRdTasks = (filters?: Record<string, string>) => api.get(`${rd}/tasks`, { params: filters }).then((r) => r.data.data);
export const fetchRdTask = (id: string) => api.get(`${rd}/tasks/${id}`).then((r) => r.data.data);
export const respondRdTask = (id: string, data: { rdDecision: string; rdComments?: string }) =>
  api.post(`${rd}/tasks/${id}/respond`, data).then((r) => r.data.data);
export const remindRdTask = (id: string) => api.post(`${rd}/tasks/${id}/remind`).then((r) => r.data.data);
export const cancelRdTask = (id: string) => api.delete(`${rd}/tasks/${id}`).then((r) => r.data.data);

// Teams
export const sendTestTeamsCard = (eventId: string) =>
  api.post(`${nr}/teams/test`, { eventId }).then((r) => r.data.data);
export const getTeamsStatus = () => api.get(`${nr}/teams/status`).then((r) => r.data.data);

export default api;
