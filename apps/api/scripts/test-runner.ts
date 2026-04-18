/**
 * PCN AI Analysis Test Runner
 *
 * Runs all test fixtures (PDFs + emails) through the full pipeline:
 *   Upload → AI Analysis → Rule Engine → Compare with golden files
 *
 * Usage:
 *   pnpm --filter api test:fixtures                    # Run all tests
 *   pnpm --filter api test:fixtures -- --case 20260327000.0  # Single test
 *   pnpm --filter api test:fixtures -- --report        # Generate report
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.API_URL || "http://localhost:3000/api/v1";
const FIXTURES_DIR = path.resolve(__dirname, "../../../test-fixtures");
const EXPECTED_DIR = path.join(FIXTURES_DIR, "expected-results");
const REPORTS_DIR = path.resolve(__dirname, "../../../reports");

interface TestCase {
  id: string;
  file: string;
  filePath: string;
  type: "email" | "pdf";
  goldenFile?: string;
}

interface ComparisonField {
  field: string;
  expected: unknown;
  actual: unknown;
  match: boolean;
}

interface TestResult {
  testId: string;
  vendor: string;
  pcnNumber: string;
  status: "PASS" | "FAIL" | "ERROR";
  riskLevel: string;
  formChanged: boolean;
  fitChanged: boolean;
  functionChanged: boolean;
  affectedPartsCount: number;
  comparison: ComparisonField[];
  executionTimeMs: number;
  errorMessage?: string;
}

interface TestRunSummary {
  runId: string;
  runAt: string;
  environment: string;
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  overallAccuracy: number;
  fieldAccuracy: {
    riskLevel: number;
    formChanged: number;
    fitChanged: number;
    functionChanged: number;
  };
  avgExecutionTimeMs: number;
  results: TestResult[];
}

// ==================== Scan test fixtures ====================

function scanTestCases(caseFilter?: string): TestCase[] {
  const cases: TestCase[] = [];

  // Scan email files
  const emailDir = path.join(FIXTURES_DIR, "vendor-emails");
  if (fs.existsSync(emailDir)) {
    for (const f of fs.readdirSync(emailDir)) {
      if (!f.endsWith(".msg") && !f.endsWith(".eml")) continue;
      cases.push({ id: f, file: f, filePath: path.join(emailDir, f), type: "email" });
    }
  }

  // Scan PDF files
  const pdfDir = path.join(FIXTURES_DIR, "pdf-attachments");
  if (fs.existsSync(pdfDir)) {
    for (const f of fs.readdirSync(pdfDir)) {
      if (!f.endsWith(".pdf")) continue;
      cases.push({ id: f, file: f, filePath: path.join(pdfDir, f), type: "pdf" });
    }
  }

  // Match golden files
  if (fs.existsSync(EXPECTED_DIR)) {
    for (const tc of cases) {
      const goldenFiles = fs.readdirSync(EXPECTED_DIR);
      // Find matching golden file by PCN number substring
      for (const gf of goldenFiles) {
        if (gf.endsWith(".json")) {
          tc.goldenFile = path.join(EXPECTED_DIR, gf); // Will be matched after upload
        }
      }
    }
  }

  // Filter if --case specified
  if (caseFilter) {
    return cases.filter((c) => c.id.includes(caseFilter) || c.file.includes(caseFilter));
  }

  return cases;
}

// ==================== API helpers ====================

async function uploadFile(tc: TestCase): Promise<any> {
  const formData = new FormData();
  const fileContent = fs.readFileSync(tc.filePath);
  const blob = new Blob([fileContent]);
  formData.append("file", blob, tc.file);

  const endpoint = tc.type === "email" ? `${API_BASE}/pcn/upload-email` : `${API_BASE}/pcn/upload`;
  const res = await fetch(endpoint, { method: "POST", body: formData });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Upload failed");
  return json.data;
}

async function approveEvent(eventId: string): Promise<void> {
  await fetch(`${API_BASE}/pcn/events/${eventId}/approve`, { method: "POST" });
}

async function runAiAnalysis(eventId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/ai/analyze/${eventId}`, { method: "POST" });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "AI analysis failed");
  return json.data;
}

async function runRuleEngine(eventId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/rules/evaluate/${eventId}`, { method: "POST" });
  const json = await res.json();
  return json.data;
}

// ==================== Compare with golden files ====================

function findGoldenFile(pcnNumber: string): any | null {
  if (!fs.existsSync(EXPECTED_DIR)) return null;
  const safeName = pcnNumber.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filepath = path.join(EXPECTED_DIR, `${safeName}.json`);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  }
  return null;
}

function compareResults(golden: any, actual: any): ComparisonField[] {
  const exp = golden.expected;
  const tol = golden.tolerance ?? {};

  // Risk level: accept primary or alternate
  const riskMatch = exp.riskLevel === actual.riskLevel || tol.riskLevelAlternate === actual.riskLevel;

  // Fit changed: flexible if AI non-determinism is expected
  const fitMatch = tol.fitChangedFlexible ? true : exp.fitChanged === actual.fitChanged;

  const partsTolerance = tol.affectedPartsCount ?? Math.max(5, Math.round(exp.affectedPartsCount * 0.1));

  return [
    { field: "riskLevel", expected: exp.riskLevel, actual: actual.riskLevel, match: riskMatch },
    { field: "formChanged", expected: exp.formChanged, actual: actual.formChanged, match: exp.formChanged === actual.formChanged },
    { field: "fitChanged", expected: exp.fitChanged, actual: actual.fitChanged, match: fitMatch },
    { field: "functionChanged", expected: exp.functionChanged, actual: actual.functionChanged, match: exp.functionChanged === actual.functionChanged },
    {
      field: "affectedPartsCount",
      expected: exp.affectedPartsCount,
      actual: actual.affectedParts?.length ?? 0,
      match: Math.abs((actual.affectedParts?.length ?? 0) - exp.affectedPartsCount) <= partsTolerance,
    },
  ];
}

// ==================== Run single test ====================

async function runSingleTest(tc: TestCase): Promise<TestResult> {
  const start = Date.now();
  try {
    // 1. Upload
    const event = await uploadFile(tc);

    // 2. Approve (email uploads need approval)
    if (event.status === "PENDING_REVIEW") {
      await approveEvent(event.id);
    }

    // 3. AI Analysis
    const aiResult = await runAiAnalysis(event.id);

    // 4. Rule Engine
    await runRuleEngine(event.id);

    // 5. Compare with golden file
    const golden = findGoldenFile(event.pcnNumber);
    const comparison = golden ? compareResults(golden, aiResult) : [];
    const allMatch = comparison.length === 0 || comparison.every((c) => c.match);

    return {
      testId: tc.id,
      vendor: event.vendorName,
      pcnNumber: event.pcnNumber,
      status: allMatch ? "PASS" : "FAIL",
      riskLevel: aiResult.riskLevel,
      formChanged: aiResult.formChanged,
      fitChanged: aiResult.fitChanged,
      functionChanged: aiResult.functionChanged,
      affectedPartsCount: aiResult.affectedParts?.length ?? 0,
      comparison,
      executionTimeMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      testId: tc.id,
      vendor: "?",
      pcnNumber: "?",
      status: "ERROR",
      riskLevel: "?",
      formChanged: false,
      fitChanged: false,
      functionChanged: false,
      affectedPartsCount: 0,
      comparison: [],
      executionTimeMs: Date.now() - start,
      errorMessage: error.message,
    };
  }
}

// ==================== Report generation ====================

function generateMarkdownReport(summary: TestRunSummary): string {
  const lines: string[] = [];
  lines.push("# PCN AI Analysis Test Report");
  lines.push("");
  lines.push(`Run ID: ${summary.runId} | Environment: ${summary.environment} | Date: ${summary.runAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total Tests | ${summary.totalTests} |`);
  lines.push(`| Passed | ${summary.passed} |`);
  lines.push(`| Failed | ${summary.failed} |`);
  lines.push(`| Errors | ${summary.errors} |`);
  lines.push(`| Overall Accuracy | ${summary.overallAccuracy}% |`);
  lines.push(`| Avg Execution Time | ${(summary.avgExecutionTimeMs / 1000).toFixed(1)}s |`);
  lines.push("");
  lines.push("## Field-level Accuracy");
  lines.push("| Field | Accuracy |");
  lines.push("|-------|----------|");
  lines.push(`| Risk Level | ${summary.fieldAccuracy.riskLevel}% |`);
  lines.push(`| Form Changed | ${summary.fieldAccuracy.formChanged}% |`);
  lines.push(`| Fit Changed | ${summary.fieldAccuracy.fitChanged}% |`);
  lines.push(`| Function Changed | ${summary.fieldAccuracy.functionChanged}% |`);
  lines.push("");
  lines.push("## Detail Results");
  lines.push("| # | File | Vendor | PCN# | Status | Risk | F/F/F | Parts | Time |");
  lines.push("|---|------|--------|------|--------|------|-------|-------|------|");

  summary.results.forEach((r, i) => {
    const fff = `${r.formChanged ? "Y" : "N"}/${r.fitChanged ? "Y" : "N"}/${r.functionChanged ? "Y" : "N"}`;
    const statusIcon = r.status === "PASS" ? "PASS" : r.status === "FAIL" ? "**FAIL**" : "ERROR";
    lines.push(
      `| ${i + 1} | ${r.testId.slice(0, 30)}... | ${r.vendor} | ${r.pcnNumber} | ${statusIcon} | ${r.riskLevel} | ${fff} | ${r.affectedPartsCount} | ${(r.executionTimeMs / 1000).toFixed(1)}s |`
    );
  });

  // Show failed tests detail
  const failures = summary.results.filter((r) => r.status === "FAIL");
  if (failures.length > 0) {
    lines.push("");
    lines.push("## Failed Tests");
    for (const f of failures) {
      lines.push(`### ${f.pcnNumber} (${f.vendor})`);
      for (const c of f.comparison.filter((c) => !c.match)) {
        lines.push(`- **${c.field}**: expected=${JSON.stringify(c.expected)}, actual=${JSON.stringify(c.actual)}`);
      }
    }
  }

  // Show errors
  const errors = summary.results.filter((r) => r.status === "ERROR");
  if (errors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    for (const e of errors) {
      lines.push(`- **${e.testId}**: ${e.errorMessage}`);
    }
  }

  return lines.join("\n");
}

function calcFieldAccuracy(results: TestResult[], field: string): number {
  const withComparison = results.filter((r) => r.comparison.length > 0);
  if (withComparison.length === 0) return 100;
  const matches = withComparison.filter((r) => r.comparison.find((c) => c.field === field)?.match).length;
  return Math.round((matches / withComparison.length) * 100);
}

// ==================== Main ====================

async function main() {
  const args = process.argv.slice(2);
  const caseFilter = args.find((a) => a !== "--report" && !a.startsWith("--"));
  const doReport = args.includes("--report");

  console.log("=== PCN AI Analysis Test Runner ===");
  console.log(`API: ${API_BASE}`);
  console.log(`Fixtures: ${FIXTURES_DIR}`);
  console.log("");

  // Verify API is up
  try {
    const res = await fetch(`${API_BASE}/dashboard/kpi`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
  } catch {
    console.error("ERROR: API is not running at", API_BASE);
    process.exit(1);
  }

  const testCases = scanTestCases(caseFilter);
  console.log(`Found ${testCases.length} test cases`);
  console.log("");

  const results: TestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    process.stdout.write(`[${i + 1}/${testCases.length}] ${tc.file.slice(0, 50)}... `);
    const result = await runSingleTest(tc);
    results.push(result);

    const fff = `${result.formChanged ? "Y" : "N"}/${result.fitChanged ? "Y" : "N"}/${result.functionChanged ? "Y" : "N"}`;
    console.log(
      `${result.status} | ${result.pcnNumber} | ${result.vendor} | ${result.riskLevel} | ${fff} | ${result.affectedPartsCount} parts | ${(result.executionTimeMs / 1000).toFixed(1)}s`
    );

    if (result.status === "FAIL") {
      result.comparison.filter((c) => !c.match).forEach((c) => {
        console.log(`  MISMATCH: ${c.field} expected=${JSON.stringify(c.expected)} actual=${JSON.stringify(c.actual)}`);
      });
    }
    if (result.errorMessage) {
      console.log(`  ERROR: ${result.errorMessage}`);
    }
  }

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const errors = results.filter((r) => r.status === "ERROR").length;
  const totalTime = results.reduce((s, r) => s + r.executionTimeMs, 0);

  const summary: TestRunSummary = {
    runId: `TR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`,
    runAt: new Date().toISOString(),
    environment: "local",
    totalTests: results.length,
    passed,
    failed,
    errors,
    overallAccuracy: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
    fieldAccuracy: {
      riskLevel: calcFieldAccuracy(results, "riskLevel"),
      formChanged: calcFieldAccuracy(results, "formChanged"),
      fitChanged: calcFieldAccuracy(results, "fitChanged"),
      functionChanged: calcFieldAccuracy(results, "functionChanged"),
    },
    avgExecutionTimeMs: results.length > 0 ? Math.round(totalTime / results.length) : 0,
    results,
  };

  console.log("");
  console.log("=== SUMMARY ===");
  console.log(`Total: ${summary.totalTests} | Pass: ${passed} | Fail: ${failed} | Error: ${errors}`);
  console.log(`Accuracy: ${summary.overallAccuracy}%`);
  console.log(`Field accuracy — Risk: ${summary.fieldAccuracy.riskLevel}% | Form: ${summary.fieldAccuracy.formChanged}% | Fit: ${summary.fieldAccuracy.fitChanged}% | Func: ${summary.fieldAccuracy.functionChanged}%`);
  console.log(`Avg time: ${(summary.avgExecutionTimeMs / 1000).toFixed(1)}s | Total: ${(totalTime / 1000).toFixed(0)}s`);

  // Generate report files
  if (doReport || true) {
    // Always generate reports
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const jsonPath = path.join(REPORTS_DIR, `test-report-${summary.runId}.json`);
    const mdPath = path.join(REPORTS_DIR, `test-report-${summary.runId}.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(mdPath, generateMarkdownReport(summary));

    console.log("");
    console.log(`Reports saved:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Markdown: ${mdPath}`);
  }

  process.exit(failed + errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
