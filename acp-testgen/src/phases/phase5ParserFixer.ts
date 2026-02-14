import path from "node:path";
import { readFileSync } from "node:fs";
import { CopilotAcpClient } from "../acp/copilotAcpClient";
import { runCoverage } from "../coverage/coverageRunner";
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
}) {
  const { repoRootAbs, acp, prodRel, prodAbs, testAbs } = params;

  while (true) {
    const res = await runCoverage(repoRootAbs);

    // Prefer the reduced summary produced by runCoverage when available.
    let missing: number[] = [];
    let missingBranches: any[] = [];
    let percentCovered: number | null = null;

    if (res.coverageSummary) {
      const constinfo: any = getMissingFromSummary(res.coverageSummary, prodRel);
      missing = constinfo.missing_lines;
      missingBranches = constinfo.missing_branches;
      percentCovered = constinfo.percent;
    } else if (res.coverageSummaryPath) {
      try {
        const summ = JSON.parse(readFileSync(res.coverageSummaryPath, "utf8"));
        const constinfo: any = getMissingFromSummary(summ, prodRel);
        missing = constinfo.missing_lines;
        missingBranches = constinfo.missing_branches;
        percentCovered = constinfo.percent;
      } catch (e) {
        // fall back to raw coverage.json
      }
    }

    let cov: any = undefined;
    if (missing.length === 0) {
      // fallback: read the full coverage.json to determine missing lines
      try {
        cov = JSON.parse(readFileSync(res.coverageJsonPath, "utf8"));
        missing = getMissing(cov, prodRel);
      } catch (e) {
        if (!res.ok) {
          throw new Error(`pytest failed before fixing.\n${res.pytestStderr}\n${res.pytestStdout}`);
        }
      }
    }
    
    if (missing.length === 0) break;
    if (missing.length === 0) break;

    // “one set of missing lines at a time”
    const chunks = planChunks(prodAbs, missing);
    const one = chunks[0];
    const region = one.region;
    const rangesText = one.ranges.map(r => `${r.start}-${r.end}`).join(", ");
    const snippet = readSnippet(prodAbs, region.start, region.end);

    await acp.prompt(`
Run the test cases using the command "pytest --cov --cov-config=.coveragerc --cov-report=term-missing".
Target file: "${prodRel}" (test file: "${path.relative(repoRootAbs, testAbs)}").

Current coverage for this file: ${percentCovered ?? "unknown"} %.
Missing lines: ${missing.join(", ") || "(none)"}.
Missing branches: ${JSON.stringify(missingBranches || [])}.

You need to add/modify the test cases for the missing lines only, one set at a time.
Take one missing-lines set and add/modify the tests accordingly, then run the tests.
If the tests fail, fix them and retry; then move to the next missing-lines set.
Proceed until coverage for ${prodRel} is 100%.

You must only edit: ${path.relative(repoRootAbs, testAbs)} and no other files.
Work only in ${path.relative(repoRootAbs, testAbs)}; do not modify other files.

If you attempt to cover the same missing-lines set more than 8 times, stop and report the situation.

Also add a separation comment in the test file for test cases grouped by function in the main file, for example:
"# ----------------------------------------- Test cases for ${region.name} ------------------------------"

Production snippet:
${snippet}

Proceed.
`.trim());

    const rerun = await runCoverage(repoRootAbs);
    if (!rerun.ok) {
      await acp.prompt(`
Tests failed. Fix ONLY ${path.relative(repoRootAbs, testAbs)}.
stderr:
${rerun.pytestStderr}

stdout:
${rerun.pytestStdout}
`.trim());
    }
  }
}
