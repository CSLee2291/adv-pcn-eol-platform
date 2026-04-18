import type { FastifyInstance } from "fastify";
import { NotificationRulesController } from "./notification-rules.controller.js";

export async function notificationRulesRoutes(app: FastifyInstance) {
  const c = new NotificationRulesController();

  // Rules CRUD
  app.get("/rules", c.listRules);
  app.get("/rules/:id", c.getRule);
  app.post("/rules", c.createRule);
  app.patch("/rules/:id", c.updateRule);
  app.delete("/rules/:id", c.deleteRule);

  // Templates
  app.get("/templates", c.listTemplates);
  app.post("/templates/apply", c.applyTemplate);

  // Customers
  app.get("/customers", c.listCustomers);
  app.get("/customers/search", c.searchCustomers);
  app.post("/customers", c.createCustomer);
  app.patch("/customers/:id", c.updateCustomer);
  app.post("/customer-rules/assign", c.assignCustomerRule);
  app.post("/customer-rules/remove", c.removeCustomerRule);
  app.post("/customer-rules/bulk-assign", c.bulkAssignCustomerRule);
  app.post("/customer-rules/bulk-remove", c.bulkRemoveCustomerRule);

  // Tracked Products
  app.get("/products", c.listProducts);
  app.get("/products/search", c.searchProducts);
  app.post("/products", c.createProduct);
  app.post("/product-rules/assign", c.assignProductRule);
  app.delete("/product-rules/:id", c.removeProductRule);
  app.post("/product-rules/bulk-assign", c.bulkAssignProductRule);
  app.post("/product-rules/bulk-remove", c.bulkRemoveProductRule);

  // Evaluation
  app.post("/evaluate/:eventId", c.evaluate);

  // Queue
  app.get("/queue", c.listQueue);
  app.post("/queue/:id/approve", c.approveNotification);
  app.post("/queue/:id/skip", c.skipNotification);

  // Import
  app.post("/import-ce-owners", c.importCeOwners);

  // Seed
  app.post("/seed", c.seedRules);

  // Email preview & sending
  app.get("/email/preview/:eventId", c.previewEmail);          // Returns rendered HTML
  app.get("/email/preview-json/:eventId", c.previewEmailJson); // Returns JSON data
  app.post("/email/send-test", c.sendTestEmail);               // Send test email
  app.get("/email/status", c.emailStatus);                     // Transport status
}
