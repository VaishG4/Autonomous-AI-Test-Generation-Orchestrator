import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { getRegionsPython } from "../chunking/chunkPlanner";

export async function phase3CreateTestFileScaffolds(entries: Array<{ prodAbs: string; testAbs: string }>) {
  for (const e of entries) {
    mkdirSync(path.dirname(e.testAbs), { recursive: true });

    const regions = getRegionsPython(e.prodAbs).filter((r) => r.name !== "<module>");
    const sections = regions.map((r) =>
      `\n# ----------------------------------------- Test cases for ${r.name} ------------------------------\n`
    );

    const content = `# Auto-generated test scaffold for ${path.basename(e.prodAbs)}
# Tests will be added in Phase 4/5.

import pytest

${sections.join("\n")}
`;

    writeFileSync(e.testAbs, content, "utf8");
  }
}
