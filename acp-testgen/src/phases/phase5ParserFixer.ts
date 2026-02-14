import path from "node:path";
import { readFileSync } from "node:fs";
import { CopilotAcpClient } from "../acp/copilotAcpClient";
import { planChunks, readSnippet } from "../chunking/chunkPlanner";

function getMissing(coverageJson: any, prodRel: string): number[] {
  const entry = coverageJson.files?.[prodRel] ?? coverageJson.files?.[prodRel.replace(/\\/g, "/")];
  return entry?.missing_lines ?? [];
}

function getMissingFromSummary(summary: any, prodRel: string): { missing_lines: number[]; missing_branches: any[]; percent: number | null } {
  if (!summary || !summary.files) return { missing_lines: [], missing_branches: [], percent: null };
  const key = prodRel in summary.files ? prodRel : prodRel.replace(/\\/g, "/");
  const entry = summary.files[key];
  if (!entry) return { missing_lines: [], missing_branches: [], percent: null };
  const percent = entry.summary?.percent_covered ?? null;
  return { missing_lines: entry.missing_lines ?? [], missing_branches: entry.missing_branches ?? [], percent };
}

export async function phase5ParserFixer(params: {
  repoRootAbs: string;
  acp: CopilotAcpClient;
  prodRel: string; // "src/click/parser.py"
  prodAbs: string;
  testAbs: string; // "tests/test_parser.py"
  noTests?: boolean;
}) {
  const { repoRootAbs, acp, prodRel, prodAbs, testAbs, noTests } = params;

  // Do NOT run coverage or write coverage artifacts. Only send the single
  // prompt to the ACP client as requested. If `noTests` is true, explicitly
  // instruct the agent not to run pytest in this environment.
  if (noTests) {
    await acp.prompt(`
You must NOT run tests in this environment. Do NOT execute pytest or any test commands here.
Target file: "${prodRel}" (test file: "${path.relative(repoRootAbs, testAbs)}").

Add/modify tests one set at a time for missing lines, and provide the exact test changes you would make in "${path.relative(repoRootAbs, testAbs)}".
Do NOT run tests here; the operator will run tests locally and report results back.
If you attempt to cover the same missing-lines set more than 8 times, stop and report the situation.

Also add a separation comment in the test file for test cases grouped by function in the main file, for example:
"# ----------------------------------------- Test cases for <function_name> ------------------------------"

Proceed.
`.trim());
  } else {
    await acp.prompt(`
Run the test cases using the command "pytest --cov --cov-config=.coveragerc --cov-report=term-missing".
Target file: "${prodRel}" (test file: "${path.relative(repoRootAbs, testAbs)}").

You must only edit: ${path.relative(repoRootAbs, testAbs)} and no other files.
Work only in ${path.relative(repoRootAbs, testAbs)}; do not modify other files.

Add/modify tests one set at a time for missing lines, run tests, fix failures if any, and repeat until coverage is 100%.
If you attempt to cover the same missing-lines set more than 8 times, stop and report the situation.

Also add a separation comment in the test file for test cases grouped by function in the main file, for example:
"# ----------------------------------------- Test cases for <function_name> ------------------------------"

Proceed.
`.trim());
  }
}