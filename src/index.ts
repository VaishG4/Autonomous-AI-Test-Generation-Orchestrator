import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import { loadConfig, resolveInRepo } from "./config.js";
import { EventLogger } from "./events.js";
import { readState, writeState } from "./state.js";
import { readCoverageConfig } from "./coverage/coverageConfig.js";
import { buildTestPlan } from "./planning/testFilePlanner.js";
import { runCoverage } from "./coverage/coverageRunner.js";
import { createTestSkeletons } from "./phases/phase3_initTests.js";

const program = new Command();

program
  .name("orchestrator")
  .option("-c, --config <path>", "config yaml path", "orchestrator/config.yaml");

program.command("plan").description("Build test plan from coverage config").action(async () => {
  const { config: cfgPath } = program.opts<{ config: string }>();
  const cfg = loadConfig(cfgPath);

  const repoRootAbs = path.resolve(cfg.repoRoot);
  const pyprojectAbs = resolveInRepo(cfg, cfg.pyprojectPath);
  const testDirRel = cfg.testDir;

  const events = new EventLogger(path.resolve("orchestrator/events.jsonl"));
  const statePath = path.resolve("orchestrator/run_state.json");

  const st = readState(statePath);
  st.phase = "plan";
  st.startedAt ??= new Date().toISOString();
  st.lastCommand = "plan";
  writeState(statePath, st);

  events.log("phase_started", { phase: "plan" });

  const cov = readCoverageConfig(pyprojectAbs);
  events.log("coverage_config_loaded", cov);

  const plan = await buildTestPlan({ repoRootAbs, testDirRel, coverage: cov });

  const outPath = resolveInRepo(cfg, cfg.testDir, "_test_plan.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), "utf8");

  events.log("plan_written", { outPath, count: plan.entries.length });
  st.phase = "idle";
  writeState(statePath, st);

  console.log(`Wrote plan: ${outPath} (${plan.entries.length} entries)`);
});

program.command("init-tests").description("Create empty test files from plan").action(async () => {
  const { config: cfgPath } = program.opts<{ config: string }>();
  const cfg = loadConfig(cfgPath);

  const repoRootAbs = path.resolve(cfg.repoRoot);
  const planPath = resolveInRepo(cfg, cfg.testDir, "_test_plan.json");

  const events = new EventLogger(path.resolve("orchestrator/events.jsonl"));
  const statePath = path.resolve("orchestrator/run_state.json");
  const st = readState(statePath);

  st.phase = "init-tests";
  st.lastCommand = "init-tests";
  writeState(statePath, st);

  if (!fs.existsSync(planPath)) throw new Error(`Plan not found: ${planPath}`);
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));

  events.log("phase_started", { phase: "init-tests" });
  createTestSkeletons({ repoRootAbs, plan });

  events.log("test_skeletons_created", { count: plan.entries.length });
  st.phase = "idle";
  writeState(statePath, st);

  console.log(`Created skeleton test files under ${cfg.testDir}/`);
});

program.command("coverage").description("Run pytest + coverage json").action(async () => {
  const { config: cfgPath } = program.opts<{ config: string }>();
  const cfg = loadConfig(cfgPath);

  const repoRootAbs = path.resolve(cfg.repoRoot);
  const testDirAbs = resolveInRepo(cfg, cfg.testDir);

  const events = new EventLogger(path.resolve("orchestrator/events.jsonl"));
  const statePath = path.resolve("orchestrator/run_state.json");
  const st = readState(statePath);

  st.phase = "coverage";
  st.lastCommand = "coverage";
  writeState(statePath, st);

  events.log("phase_started", { phase: "coverage" });
  const res = await runCoverage({ repoRootAbs, testDirAbs });

  events.log("coverage_finished", { ok: res.ok, coverageJsonPath: res.coverageJsonPath });
  st.phase = "idle";
  writeState(statePath, st);

  console.log(res.ok ? "✅ coverage OK" : "❌ coverage failed");
  console.log(`coverage json: ${res.coverageJsonPath}`);
  if (!res.ok) {
    console.error(res.pytestStderr);
    process.exitCode = 1;
  }
});

program.parseAsync(process.argv);
