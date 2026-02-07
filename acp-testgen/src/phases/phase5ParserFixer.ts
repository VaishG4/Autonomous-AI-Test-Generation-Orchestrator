import path from "node:path";
import { readFileSync } from "node:fs";
import { CopilotAcpClient } from "../acp/copilotAcpClient";
import { runCoverage } from "../coverage/coverageRunner";
import { planChunks, readSnippet } from "../chunking/chunkPlanner";

function getMissing(coverageJson: any, prodRel: string): number[] {
  const entry = coverageJson.files?.[prodRel] ?? coverageJson.files?.[prodRel.replace(/\\/g, "/")];
  return entry?.missing_lines ?? [];
}

export async function phase5ParserFixer(params: {
  repoRootAbs: string;
  acp: CopilotAcpClient;
  prodRel: string; // "src/click/parser.py"
  prodAbs: string;
  testAbs: string; // "test/test_parser.py"
}) {
  const { repoRootAbs, acp, prodRel, prodAbs, testAbs } = params;

  while (true) {
    const res = await runCoverage(repoRootAbs);
    if (!res.ok) {
      throw new Error(`pytest failed before fixing.\n${res.pytestStderr}\n${res.pytestStdout}`);
    }
    const cov = JSON.parse(readFileSync(res.coverageJsonPath, "utf8"));
    const missing = getMissing(cov, prodRel);
    if (missing.length === 0) break;

    // “one set of missing lines at a time”
    const chunks = planChunks(prodAbs, missing);
    const one = chunks[0];
    const region = one.region;
    const rangesText = one.ranges.map(r => `${r.start}-${r.end}`).join(", ");
    const snippet = readSnippet(prodAbs, region.start, region.end);

    await acp.prompt(`
You are fixing coverage for ${prodRel}.
You may ONLY edit: ${path.relative(repoRootAbs, testAbs)}
Do NOT edit any other file.

Target missing lines: ${rangesText} (region ${region.name})
Add/modify tests ONLY under:
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
