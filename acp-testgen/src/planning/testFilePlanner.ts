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
    for (const m of matches) files.add(m);
  }

  const out: TestPlanEntry[] = [];
  for (const rel of Array.from(files).sort()) {
    // ignore tests under test/ if any
    if (rel.startsWith("test/")) continue;
    const prodAbs = path.join(repoRootAbs, rel);
    const base = path.basename(rel, ".py");
    const testFileName = `test_${base}.py`;
    const testAbs = path.join(repoRootAbs, "test", testFileName);
    // produce prodRel in POSIX form for coverage lookup
    const prodRel = toPosix(rel);
    out.push({ prodRel, prodAbs, testAbs });
  }

  return out;
}

export function writeTestPlan(repoRootAbs: string, plan: TestPlanEntry[]) {
  const dir = path.join(repoRootAbs, "test");
  // Ensure `test` is a directory we can write into. If a file named `test`
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
    const p = path.join(repoRootAbs, "test", "_test_plan.json");
    const raw = require("node:fs").readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
