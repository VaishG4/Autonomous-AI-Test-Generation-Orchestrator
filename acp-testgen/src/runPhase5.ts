import { resolveTargetRepoAbs } from "./util/targetRepo.js";
import path from "node:path";
import { FsPolicy } from "./policy/fsPolicy.js";
import { CopilotAcpClient } from "./acp/copilotAcpClient.js";
import { loadCoverageScope } from "./config/coverageConfig.js";
import { readTestPlan, buildTestPlan } from "./planning/testFilePlanner.js";
import { logStatus } from "./util/status.js";
import { runCoverage } from "./coverage/coverageRunner.js";

async function main() {
  const repo = resolveTargetRepoAbs(process.argv);
  const cov = loadCoverageScope(repo);

  // Load plan. If missing, synthesize a temporary single-entry plan WITHOUT creating scaffolds.
  let plan = readTestPlan(repo);
  if (!plan) {
    logStatus(repo, "No test plan found — synthesizing temporary entry for Phase 6 (no scaffolds will be created)");
    const built = await buildTestPlan(repo, cov as any);
    const planArgv = process.argv;
    const prodRelIdx = planArgv.indexOf("--prodRel");
    const fileIdx = planArgv.indexOf("--file");
    let picked: any = null;
    if (prodRelIdx !== -1 && planArgv[prodRelIdx + 1]) {
    const want = planArgv[prodRelIdx + 1];
      picked = built.find((e: any) => e.prodRel === want || e.prodAbs === want || path.basename(e.prodAbs) === want || e.testAbs === want || path.basename(e.testAbs) === want);
      if (!picked) {
        const prodAbs = path.join(repo, want);
        const base = path.basename(want, ".py");
        const testAbs = path.join(repo, "tests", `test_${base}.py`);
        picked = { prodRel: want, prodAbs, testAbs };
      }
    } else if (fileIdx !== -1 && planArgv[fileIdx + 1]) {
      const want = planArgv[fileIdx + 1];
      picked = built.find((e: any) => e.prodRel === want || e.prodAbs === want || path.basename(e.prodAbs) === want || e.testAbs === want || path.basename(e.testAbs) === want);
      if (!picked) {
        const name = path.basename(want);
        if (name.startsWith("test_")) {
          const base = name.replace(/^test_/, "");
          picked = built.find((e: any) => path.basename(e.prodAbs) === `${base}.py`);
          if (!picked) {
            const prodRel = `src/${base}.py`;
            const prodAbs = path.join(repo, prodRel);
            const testAbs = path.isAbsolute(want) ? want : path.join(repo, want);
            picked = { prodRel, prodAbs, testAbs };
          }
        } else {
          const prodRel = want;
          const prodAbs = path.join(repo, prodRel);
          const base = path.basename(prodRel, ".py");
          const testAbs = path.join(repo, "tests", `test_${base}.py`);
          picked = { prodRel, prodAbs, testAbs };
        }
      }
    } else {
      throw new Error("No selector passed — please pass --prodRel or --file to identify the target for Phase 6");
    }

    plan = { entries: [picked] };
  }

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

  if (!entry) throw new Error("No matching plan entry found for Phase 6");

  const policy = new FsPolicy({ repoRootAbs: repo, testDirRel: "tests", readRootsRel: cov.readRootsRel });
  const acp = new CopilotAcpClient(repo, policy, (e) => {
    if (e.type === "agent_text") process.stdout.write(e.text);
    else process.stdout.write(`\n[EVENT] ${JSON.stringify(e)}\n`);
  });

  await acp.start();
  logStatus(repo, "Started ACP client for Phase 6");

  await acp.prompt(`
Run the test cases using the command "pytest --cov --cov-config=.coveragerc --cov-report=term-missing".
Target file: "${entry.prodRel}" (test file: "${path.relative(repo, entry.testAbs)}"). 

If the coverage is already near 100%, no further action is needed.
Otherwise, you will iteratively identify missing lines/branches for the target file and add/modify tests only in ${path.relative(repo, entry.testAbs)}.
Work one missing-lines set at a time: add/modify tests, run the tests, fix failures if any, and then repeat until coverage for ${entry.prodRel} is near 100%.

You must NOT edit any files outside of the test file above. When you are going to complete this task, please check if all the test cases for this file is passing
`.trim());

  const autoRunTests = argv.includes("--auto-run-tests") || process.env.ACPT_AUTO_RUN_TESTS === "1";

  try {
    // Give the ACP agent a short while to stream initial output.
    await new Promise((res) => setTimeout(res, 1500));
    logStatus(repo, "Phase 6 prompt delivered");

    if (autoRunTests) {
      logStatus(repo, "Auto-run-tests enabled — running pytest/coverage locally");
      try {
        const covRes = await runCoverage(repo);
        // Send a concise coverage summary for the target file to the ACP agent.
        const summary = covRes.coverageSummary;
        let msg = `Coverage run completed. pytest ok=${covRes.ok}.`;
        if (!summary) {
          msg += `\nNo coverage summary was produced. See ${covRes.coverageJsonPath} if available.`;
          if (covRes.pytestStderr) msg += `\nStderr:\n${covRes.pytestStderr}`;
        } else {
          const files = summary.files || {};
          const key = entry.prodRel in files ? entry.prodRel : entry.prodRel.replace(/\\/g, "/");
          const entryCov = files[key];
          const percent = entryCov?.summary?.percent_covered ?? null;
          const missing_lines = entryCov?.missing_lines ?? [];
          const missing_branches = entryCov?.missing_branches ?? [];
          msg += `\nTarget: ${entry.prodRel}`;
          msg += `\nPercent covered: ${percent === null ? "unknown" : percent + "%"}`;
          msg += `\nMissing lines: ${JSON.stringify(missing_lines)}`;
          if (missing_branches.length) msg += `\nMissing branches: ${JSON.stringify(missing_branches)}`;
          if (covRes.coverageSummaryPath) msg += `\nSummary: ${covRes.coverageSummaryPath}`;
        }

        await acp.prompt(msg);
        // small pause to allow streaming
        await new Promise((res) => setTimeout(res, 1200));
      } catch (e) {
        await acp.prompt(`Failed to run coverage locally: ${String(e)}`);
      }
    }
  } finally {
    await acp.stop();
    logStatus(repo, "Stopped ACP client for Phase 6");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
