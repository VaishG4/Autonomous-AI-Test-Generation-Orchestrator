import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { CopilotAcpClient } from "../acp/copilotAcpClient";
import { planChunks, readSnippet } from "../chunking/chunkPlanner";
import { runCoverage } from "../coverage/coverageRunner";

function extractMissingLinesForFile(coverageJson: any, prodRel: string): number[] {
  // coverage JSON shape varies; common: coverageJson.files[filepath].missing_lines
  const entry = coverageJson.files?.[prodRel] ?? coverageJson.files?.[prodRel.replace(/\\/g, "/")];
  return entry?.missing_lines ?? [];
}

function insertUnderSection(testText: string, sectionName: string, insertion: string): string {
  const marker = `# ----------------------------------------- Test cases for ${sectionName} ------------------------------`;
  const idx = testText.indexOf(marker);
  if (idx === -1) return testText + "\n\n" + marker + "\n" + insertion + "\n";
  const after = idx + marker.length;
  return testText.slice(0, after) + "\n" + insertion + "\n" + testText.slice(after);
}

export async function phase4TestWriterLoop(params: {
  repoRootAbs: string;
  acp: CopilotAcpClient;
  plan: Array<{ prodRel: string; prodAbs: string; testAbs: string }>;
}) {
  const { repoRootAbs, acp, plan } = params;

  for (const entry of plan) {
    // Run coverage to find missing lines for this prod file. Continue even if pytest fails so the agent
    // can be fed failures and attempt fixes; coverage json may still be produced.
    const res = await runCoverage(repoRootAbs);

    if (!res.ok) {
      // record stderr for agent feedback, but do not throw — allow the loop to prompt the agent to fix tests
      await acp.prompt(`Initial pytest run failed for repo. Pytest stderr:\n${res.pytestStderr}\n\nProceeding to gather coverage.json if available.`);
    }

    // Try to read coverage JSON even if pytest failed
    let coverageJson: any = null;
    try {
      coverageJson = JSON.parse(readFileSync(res.coverageJsonPath, "utf8"));
    } catch (e) {
      throw new Error(`Unable to read coverage json at ${res.coverageJsonPath}: ${String(e)}\nPytest stderr:\n${res.pytestStderr}`);
    }

    let missing = extractMissingLinesForFile(coverageJson, entry.prodRel);

    // Loop until no missing lines for this file
    while (missing.length > 0) {
      const chunks = planChunks(entry.prodAbs, missing);

      // Work chunk-by-chunk (function order)
      for (const chunk of chunks) {
        const region = chunk.region;
        const rangesText = chunk.ranges.map(r => `${r.start}-${r.end}`).join(", ");
        const snippet = readSnippet(entry.prodAbs, region.start, region.end);

        const prompt = `
You are generating pytest tests.
HARD RULES:
- You MAY ONLY modify files under: ${path.join(repoRootAbs, "test")}
- Do NOT modify production code.
- Goal: cover missing lines in ${entry.prodRel}, region ${region.name}, lines ${rangesText}.
- Put new tests under the existing section separator:
  "# ----------------------------------------- Test cases for ${region.name} ------------------------------"

Production code (region ${region.name}):
${snippet}

Now write/modify ONLY the test file: ${path.relative(repoRootAbs, entry.testAbs)}
Make tests deterministic (no network), use monkeypatch for I/O where needed.
`.trim();

        await acp.prompt(prompt);

        // After agent edits tests, run coverage again
        const rerun = await runCoverage(repoRootAbs);
        if (!rerun.ok) {
          // Feed failure back to agent
          await acp.prompt(`
Tests failed. Fix ONLY ${path.relative(repoRootAbs, entry.testAbs)}.
Pytest stderr:
${rerun.pytestStderr}

Pytest stdout:
${rerun.pytestStdout}
`.trim());
        }

        const cov2 = JSON.parse(readFileSync(rerun.coverageJsonPath, "utf8"));
        missing = extractMissingLinesForFile(cov2, entry.prodRel);
        if (missing.length === 0) break;
      }
    }
  }
}
