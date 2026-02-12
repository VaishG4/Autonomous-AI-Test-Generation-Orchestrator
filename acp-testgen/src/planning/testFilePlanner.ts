import path from "node:path";
import fg from "fast-glob";
import { writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { toPosix } from "../util/paths";

export type TestPlanEntry = { prodRel: string; prodAbs: string; testAbs: string };

export async function buildTestPlan(repoRootAbs: string, covScope: { readRootsRel: string[] }): Promise<TestPlanEntry[]> {
  const roots = covScope.readRootsRel.length ? covScope.readRootsRel : ["src"];

  const files = new Set<string>();
  for (const r of roots) {
    const glob = path.join(r, "**", "*.py");
    const matches = await fg([glob], { cwd: repoRootAbs, onlyFiles: true, dot: false });
    for (const m of matches) {
      // ignore existing test files when collecting source files
      if (m.startsWith("tests/")) continue;
      files.add(m);
    }
  }

  // If no files found for the configured roots, try a common alternative
  // layout where sources live under `src/<root>` (some projects use that).
  if (files.size === 0) {
    for (const r of roots) {
      const alt = path.join("src", r, "**", "*.py");
      const matches = await fg([alt], { cwd: repoRootAbs, onlyFiles: true, dot: false });
      for (const m of matches) {
        if (m.startsWith("tests/")) continue;
        files.add(m);
      }
    }
  }

  const out: TestPlanEntry[] = [];
  for (const rel of Array.from(files).sort()) {
    // ignore tests under tests/ if any
    if (rel.startsWith("tests/")) continue;
    const prodAbs = path.join(repoRootAbs, rel);
    const base = path.basename(rel, ".py");
    const testFileName = `test_${base}.py`;
    const testAbs = path.join(repoRootAbs, "tests", testFileName);
    // produce prodRel in POSIX form for coverage lookup
    const prodRel = toPosix(rel);
    out.push({ prodRel, prodAbs, testAbs });
  }

  return out;
}

export function writeTestPlan(repoRootAbs: string, plan: TestPlanEntry[]) {
  const dir = path.join(repoRootAbs, "tests");
  // Ensure `tests` is a directory we can write into. If a file named `tests`
  // already exists, surface a helpful error instead of failing with ENOENT.
  if (existsSync(dir)) {
    try {
      const st = statSync(dir);
      if (!st.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${dir}`);
      }
    } catch (e) {
      throw new Error(`Cannot create test directory: ${String(e)}`);
    }
  } else {
    mkdirSync(dir, { recursive: true });
  }

  const p = path.join(dir, "_test_plan.json");
  writeFileSync(p, JSON.stringify({ entries: plan }, null, 2), "utf8");
}

export function readTestPlan(repoRootAbs: string): { entries: TestPlanEntry[] } | null {
  try {
    const p = path.join(repoRootAbs, "tests", "_test_plan.json");
    const raw = require("node:fs").readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
