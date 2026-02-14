import { resolveTargetRepoAbs } from "./util/targetRepo.js";
import path from "node:path";
import { FsPolicy } from "./policy/fsPolicy.js";
import { CopilotAcpClient } from "./acp/copilotAcpClient.js";
import { loadCoverageScope } from "./config/coverageConfig.js";
import { readTestPlan, buildTestPlan } from "./planning/testFilePlanner.js";
import { phase5ParserFixer } from "./phases/phase5ParserFixer.js";
import { logStatus } from "./util/status.js";

async function main() {
  const repo = resolveTargetRepoAbs(process.argv);
  const cov = loadCoverageScope(repo);

  // Load plan. If missing, synthesize a temporary single-entry plan WITHOUT creating scaffolds.
  let plan = readTestPlan(repo);
  if (!plan) {
    logStatus(repo, "No test plan found — synthesizing temporary entry for Phase 5 (no scaffolds will be created)");
    const built = await buildTestPlan(repo, cov as any);
    const argv = process.argv;
    const prodRelIdx = argv.indexOf("--prodRel");
    const fileIdx = argv.indexOf("--file");
    let picked: any = null;
    if (prodRelIdx !== -1 && argv[prodRelIdx + 1]) {
      const want = argv[prodRelIdx + 1];
      picked = built.find((e: any) => e.prodRel === want || e.prodAbs === want || path.basename(e.prodAbs) === want || e.testAbs === want || path.basename(e.testAbs) === want);
      if (!picked) {
        const prodAbs = path.join(repo, want);
        const base = path.basename(want, ".py");
        const testAbs = path.join(repo, "tests", `test_${base}.py`);
        picked = { prodRel: want, prodAbs, testAbs };
      }
    } else if (fileIdx !== -1 && argv[fileIdx + 1]) {
      const want = argv[fileIdx + 1];
      // try to match against planner-built entries first
      picked = built.find((e: any) => e.prodRel === want || e.prodAbs === want || path.basename(e.prodAbs) === want || e.testAbs === want || path.basename(e.testAbs) === want);
      if (!picked) {
        // if user provided a test basename like test_parser.py, try to synthesize prodRel
        const name = path.basename(want);
        if (name.startsWith("test_")) {
          const base = name.replace(/^test_/, "") ;
          // try to find prod by basename match
          picked = built.find((e: any) => path.basename(e.prodAbs) === `${base}.py`);
          if (!picked) {
            const prodRel = `src/${base}.py`;
            const prodAbs = path.join(repo, prodRel);
            const testAbs = path.isAbsolute(want) ? want : path.join(repo, want);
            picked = { prodRel, prodAbs, testAbs };
          }
        } else {
          // assume it's a prod basename provided as file
          const prodRel = want;
          const prodAbs = path.join(repo, prodRel);
          const base = path.basename(prodRel, ".py");
          const testAbs = path.join(repo, "tests", `test_${base}.py`);
          picked = { prodRel, prodAbs, testAbs };
        }
      }
    } else {
      throw new Error("No selector passed — please pass --prodRel or --file to identify the target for Phase 5");
    }

    plan = { entries: [picked] };
  }

  // Accept --prodRel or --file to select an entry
  const argv = process.argv;
  const prodRelIdx = argv.indexOf("--prodRel");
  const fileIdx = argv.indexOf("--file");
  let entry: any = null;
  if (prodRelIdx !== -1 && argv[prodRelIdx + 1]) {
    const want = argv[prodRelIdx + 1];
    entry = plan.entries.find((e: any) => e.prodRel === want || e.prodAbs === want || path.basename(e.prodAbs) === want || e.testAbs === want || path.basename(e.testAbs) === want);
  } else if (fileIdx !== -1 && argv[fileIdx + 1]) {
    const want = argv[fileIdx + 1];
    entry = plan.entries.find((e: any) => e.prodRel === want || e.prodAbs === want || path.basename(e.prodAbs) === want || e.testAbs === want || path.basename(e.testAbs) === want);
  } else {
    throw new Error("Please pass --prodRel <prodRel> or --file <test file> to select the target module");
  }

  if (!entry) throw new Error("No matching plan entry found for Phase 5");

  const policy = new FsPolicy({ repoRootAbs: repo, testDirRel: "tests", readRootsRel: cov.readRootsRel });
  const acp = new CopilotAcpClient(repo, policy, (e) => {
    if (e.type === "agent_text") process.stdout.write(e.text);
    else process.stdout.write(`\n[EVENT] ${JSON.stringify(e)}\n`);
  });

  await acp.start();
  logStatus(repo, "Started ACP client for Phase 5");
  try {
    await phase5ParserFixer({ repoRootAbs: repo, acp, prodRel: entry.prodRel, prodAbs: entry.prodAbs, testAbs: entry.testAbs });
    logStatus(repo, "Phase 5 completed for entry");
  } finally {
    await acp.stop();
    logStatus(repo, "Stopped ACP client for Phase 5");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
