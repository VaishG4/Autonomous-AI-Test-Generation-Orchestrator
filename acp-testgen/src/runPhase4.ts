import { resolveTargetRepoAbs } from "./util/targetRepo.js";
import path from "node:path";
import { FsPolicy } from "./policy/fsPolicy.js";
import { CopilotAcpClient } from "./acp/copilotAcpClient.js";
import { loadCoverageScope } from "./config/coverageConfig.js";
import { readTestPlan, buildTestPlan, writeTestPlan } from "./planning/testFilePlanner.js";
import { phase3CreateTestFileScaffolds } from "./phases/phase3CreateTestFiles.js";
import { phase4TestWriterLoop } from "./phases/phase4TestWriterLoop.js";
import { phase4GenerateTestsForEntries } from "./phases/phase4GenerateTests.js";
import { logStatus } from "./util/status.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

async function main() {
  const repo = resolveTargetRepoAbs(process.argv);
  const cov = loadCoverageScope(repo);

  // Ensure coverage.json exists for Phase 4 consumption. If a .coverage
  // file exists (repo/.coverage or repo/test/.coverage) attempt to convert
  // it locally so the orchestrator can read coverage data. This avoids
  // relying on the agent to execute conversion commands.
  const coverageJsonPath = path.join(repo, "tests", "coverage.json");
  if (!existsSync(coverageJsonPath)) {
    const repoCov = path.join(repo, ".coverage");
    const testCov = path.join(repo, "tests", ".coverage");
    if (existsSync(testCov) || existsSync(repoCov)) {
      logStatus(repo, "Found .coverage — generating tests/coverage.json before Phase 4");
      try {
        if (existsSync(testCov)) {
          spawnSync("python", ["-m", "coverage", "json", "--data-file", testCov, "-o", coverageJsonPath], {
            cwd: repo,
            stdio: "inherit",
          });
        } else {
          spawnSync("python", ["-m", "coverage", "json", "-o", coverageJsonPath], { cwd: repo, stdio: "inherit" });
        }
        if (!existsSync(coverageJsonPath)) {
          logStatus(repo, "Coverage conversion did not produce coverage.json — Phase 4 may still fail");
        } else {
          logStatus(repo, "Generated tests/coverage.json");
        }
      } catch (e) {
        logStatus(repo, `Failed to generate coverage.json: ${String(e)}`);
      }
    }
  }

  // Ensure we have a plan
  let planData = readTestPlan(repo);
  if (!planData) {
    logStatus(repo, "No test plan found — building plan");
    const plan = await buildTestPlan(repo, cov as any);
    writeTestPlan(repo, plan);
    // create scaffolds so Phase 4 can run
    phase3CreateTestFileScaffolds(plan);
    planData = { entries: plan };
  }

  // Optionally accept --file <prodRelOrAbs> to run a single module
  const argv = process.argv;
  const idx = argv.indexOf("--file");
  let entries = planData.entries;
  if (idx !== -1 && argv[idx + 1]) {
    const want = argv[idx + 1];
    // Accept production path, absolute path, basename, or test file path/basename
    entries = entries.filter(
      (e) =>
        e.prodRel === want ||
        e.prodAbs === want ||
        path.basename(e.prodAbs) === want ||
        e.testAbs === want ||
        path.relative(repo, e.testAbs) === want ||
        path.basename(e.testAbs) === want
    );
  }

  if (entries.length === 0) throw new Error("No matching plan entries to run Phase 4 on.");

  const policy = new FsPolicy({ repoRootAbs: repo, testDirRel: "tests", readRootsRel: cov.readRootsRel });

  const acp = new CopilotAcpClient(repo, policy, (e) => {
    if (e.type === "agent_text") process.stdout.write(e.text);
    else process.stdout.write(`\n[EVENT] ${JSON.stringify(e)}\n`);
  });

  await acp.start();
  logStatus(repo, "Started ACP client for Phase 4");
  try {
    // Phase 4 (generation): ask the agent to write tests for all regions
    // in the selected entries without consulting coverage.
    await phase4GenerateTestsForEntries({ repoRootAbs: repo, acp, entries });
    logStatus(repo, "Phase 4 (generation) completed for selected entries");
  } finally {
    await acp.stop();
    logStatus(repo, "Stopped ACP client for Phase 4");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
