import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import path from "node:path";

import { resolveTargetRepoAbs } from "./util/targetRepo.js";
import { loadCoverageScope } from "./config/coverageConfig.js";
import { buildTestPlan, writeTestPlan } from "./planning/testFilePlanner.js";
import { phase3CreateTestFileScaffolds } from "./phases/phase3CreateTestFiles.js";
import { logStatus } from "./util/status.js";

async function helloAcp(targetRepoAbs: string) {
  const executable = process.env.COPILOT_CLI_PATH ?? "copilot";

  // IMPORTANT: cwd is the TARGET repo, not orchestrator
  const proc = spawn(executable, ["--acp", "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
    cwd: targetRepoAbs,
  });

  if (!proc.stdin || !proc.stdout) {
    throw new Error("Failed to start Copilot ACP process with piped stdio.");
  }

  const output = Writable.toWeb(proc.stdin) as WritableStream<Uint8Array>;
  const input = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
  const stream = acp.ndJsonStream(output, input);

  const client: acp.Client = {
    async requestPermission() {
      // for hello we don't need permissions
      return { outcome: { outcome: "cancelled" } };
    },
    async sessionUpdate(params) {
      const update = params.update as any;
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
        process.stdout.write(update.content.text);
      }
    },
  };

  const connection = new acp.ClientSideConnection(() => client, stream);

  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  const session = await connection.newSession({
    cwd: targetRepoAbs,
    mcpServers: [],
  });

  await connection.prompt({
    sessionId: session.sessionId,
    prompt: [{ type: "text", text: "Hello ACP Server!" }],
  });

  proc.stdin.end();
  proc.kill("SIGTERM");
}

async function main() {
  const cmd = process.argv[2] ?? "hello";
  const targetRepoAbs = resolveTargetRepoAbs(process.argv);

  if (cmd === "hello") {
    await helloAcp(targetRepoAbs);
    return;
  }

  if (cmd === "plan") {
    logStatus(targetRepoAbs, "Running plan");
    const cov = loadCoverageScope(targetRepoAbs);
    const plan = await buildTestPlan(targetRepoAbs, cov);
    writeTestPlan(targetRepoAbs, plan);
    logStatus(targetRepoAbs, `Wrote ${path.join(targetRepoAbs, "tests", "_test_plan.json")} (${plan.length} entries)`);
    return;
  }

  if (cmd === "init-tests") {
    logStatus(targetRepoAbs, "Running init-tests");
    const cov = loadCoverageScope(targetRepoAbs);
    const plan = await buildTestPlan(targetRepoAbs, cov);
    writeTestPlan(targetRepoAbs, plan);
    phase3CreateTestFileScaffolds(plan);
    logStatus(targetRepoAbs, `Created empty test files under ${path.join(targetRepoAbs, "tests")}`);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
