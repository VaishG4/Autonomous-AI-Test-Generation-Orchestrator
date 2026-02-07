import path from "node:path";
import { TestPlan } from "../planning/types.js";
import { writeFileIfMissing } from "../utils/files.js";
import { toPosix } from "../utils/paths.js";

function skeletonFor(testRelPath: string, prodRelPath: string): string {
  const testName = path.basename(testRelPath);
  return `"""
Auto-generated test skeleton for: ${prodRelPath}
Do not edit production code. Only edit files in /test.
"""

import pytest

# ----------------------------------------- Test cases for module import / smoke ------------------------------
def test_import_smoke():
    # Import should not crash. Adjust import path if repo uses src layout differently.
    # This is intentionally minimal; real tests will be added by the agent later.
    pass


# ----------------------------------------- Test cases for TODO: functions will be added chunk-by-chunk ------------------------------
# (The orchestrator will insert per-function sections as it works through coverage.)
`;
}

export function createTestSkeletons(opts: {
  repoRootAbs: string;
  plan: TestPlan;
}) {
  for (const e of opts.plan.entries) {
    const abs = path.resolve(opts.repoRootAbs, e.test);
    writeFileIfMissing(abs, skeletonFor(toPosix(e.test), toPosix(e.prod)));
  }
}
