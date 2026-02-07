import path from "node:path";
import fg from "fast-glob";
import { Minimatch } from "minimatch";
import { CoverageConfig } from "../coverage/coverageConfig.js";
import { toPosix } from "../utils/paths.js";
import { TestPlan, TestPlanEntry } from "./types.js";

function compileMatchers(patterns: string[]): Minimatch[] {
  return patterns.map((p) => new Minimatch(p, { dot: true, nocase: false }));
}

function matchesAny(p: string, ms: Minimatch[]): boolean {
  return ms.some((m) => m.match(p));
}

function prodToTestPath(prodRel: string, testDirRel: string): string {
  // Default: test_<module>.py, using basename first (your preferred style),
  // then disambiguate if needed in later steps if collisions occur.
  const base = path.basename(prodRel, ".py"); // e.g. parser
  return toPosix(path.join(testDirRel, `test_${base}.py`));
}

export async function buildTestPlan(opts: {
  repoRootAbs: string;
  testDirRel: string;
  coverage: CoverageConfig;
}): Promise<TestPlan> {
  const omitMatchers = compileMatchers(opts.coverage.omit);
  const includeMatchers = compileMatchers(opts.coverage.include);

  const roots = opts.coverage.sourceRoots.length ? opts.coverage.sourceRoots : ["src"];

  // Collect python files under source roots
  const patterns = roots.map((r) => toPosix(path.join(r, "**/*.py")));
  const prodFiles = await fg(patterns, {
    cwd: opts.repoRootAbs,
    dot: true,
    onlyFiles: true,
  });

  const entries: TestPlanEntry[] = [];

  for (const rel of prodFiles.map(toPosix)) {
    if (opts.coverage.include.length && !matchesAny(rel, includeMatchers)) continue;
    if (opts.coverage.omit.length && matchesAny(rel, omitMatchers)) continue;

    // Skip obvious non-prod locations (optional safety)
    if (rel.startsWith(toPosix(`${opts.testDirRel}/`))) continue;

    entries.push({
      prod: rel,
      test: prodToTestPath(rel, opts.testDirRel),
    });
  }

  // Deduplicate collisions deterministically
  const seen = new Map<string, number>();
  const fixed: TestPlanEntry[] = entries.map((e) => {
    const key = e.test;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) return e;

    // collision -> include path segments
    const safe = e.prod.replaceAll("/", "_").replaceAll(".py", "");
    return { ...e, test: toPosix(path.join(opts.testDirRel, `test_${safe}.py`)) };
  });

  return {
    generatedAt: new Date().toISOString(),
    entries: fixed.sort((a, b) => a.prod.localeCompare(b.prod)),
  };
}
