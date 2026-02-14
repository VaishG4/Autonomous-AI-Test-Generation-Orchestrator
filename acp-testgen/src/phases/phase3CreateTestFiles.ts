import path from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { getRegionsPython } from "../chunking/chunkPlanner";

export async function phase3CreateTestFileScaffolds(entries: Array<{ prodAbs: string; testAbs: string }>) {
  for (const e of entries) {
    mkdirSync(path.dirname(e.testAbs), { recursive: true });

    const regions = getRegionsPython(e.prodAbs).filter((r) => r.name !== "<module>");
    const sections = regions.map((r) =>
      `\n# ----------------------------------------- Test cases for ${r.name} ------------------------------\n`
    );

    const header = `# Auto-generated test scaffold for ${path.basename(e.prodAbs)}\n# Tests will be added in Phase 4/5.\n\nimport pytest\n\n`;

    // If the test file does not exist, create it with full scaffold
    if (!existsSync(e.testAbs)) {
      const content = header + sections.join("\n");
      writeFileSync(e.testAbs, content, "utf8");
      continue;
    }

    // If it exists, append only missing region blocks and preserve user content
    const existing = readFileSync(e.testAbs, "utf8");
    const missingSections = sections.filter((sec) => !existing.includes(sec.trim()));
    if (missingSections.length > 0) {
      const toAdd = "\n" + missingSections.join("\n");
      writeFileSync(e.testAbs, existing + toAdd, "utf8");
    }
  }
}
