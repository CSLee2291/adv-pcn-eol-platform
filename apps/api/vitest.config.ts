import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 120_000, // 2 min for real AI calls
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      shared: path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
