import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { CopilotAcpClient } from "../acp/copilotAcpClient";
import { getRegionsPython, readSnippet } from "../chunking/chunkPlanner";

export async function phase4GenerateTestsForEntries(params: {
  repoRootAbs: string;
  acp: CopilotAcpClient;
  entries: Array<{ prodRel: string; prodAbs: string; testAbs: string }>;
}) {
  const { repoRootAbs, acp, entries } = params;

  for (const entry of entries) {
    // Ensure test file exists with region markers
    const testDir = path.dirname(entry.testAbs);
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    if (!existsSync(entry.testAbs)) {
      const regions = getRegionsPython(entry.prodAbs).filter((r) => r.name !== "<module>");
      const sections = regions.map((r) =>
        `\n# ----------------------------------------- Test cases for ${r.name} ------------------------------\n`
      );

      const content = `# Auto-generated test scaffold for ${path.basename(entry.prodAbs)}\n# Tests will be added by Phase 4.\n\nimport pytest\n\n${sections.join("\n")}\n`;
      writeFileSync(entry.testAbs, content, "utf8");
    }

    // Read regions and prompt the agent to write tests for each region.
    const regions = getRegionsPython(entry.prodAbs).filter((r) => r.name !== "<module>").sort((a,b)=>a.start-b.start);

    for (const region of regions) {
      const snippet = readSnippet(entry.prodAbs, region.start, region.end);
      const prompt = `You are generating pytest tests.
HARD RULES:
- You MAY ONLY modify files under: ${path.join(repoRootAbs, "tests")}
- Do NOT modify production code.
- Goal: write tests that exercise functions/classes in region ${region.name} of ${entry.prodRel}.
- Put new tests under the existing section separator:
  "# ----------------------------------------- Test cases for ${region.name} ------------------------------"

Production code (region ${region.name}):
${snippet}

Now write/modify ONLY the test file: ${path.relative(repoRootAbs, entry.testAbs)}
Make tests deterministic (no network), use monkeypatch for I/O where needed.
`.trim();

      await acp.prompt(prompt);

      // give agent time to write via ACP streaming; drain buffer
      try {
        await acp.drainAgentOutput();
      } catch {
        // ignore — agent output optional
      }
    }
  }
}

export default phase4GenerateTestsForEntries;
