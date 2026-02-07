import { resolveTargetRepoAbs } from "./util/targetRepo.js";
import { FsPolicy } from "./policy/fsPolicy.js";
import { CopilotAcpClient } from "./acp/copilotAcpClient.js";
import { loadCoverageScope } from "./config/coverageConfig.js";
import { phase2RepoContext } from "./phases/phase2RepoContext.js";
import { logStatus } from "./util/status.js";

async function main() {
  const repo = resolveTargetRepoAbs(process.argv);

  // derive coverage roots
  const cov = loadCoverageScope(repo);

  const policy = new FsPolicy({ repoRootAbs: repo, testDirRel: "test", readRootsRel: cov.readRootsRel });

  const acp = new CopilotAcpClient(repo, policy, (e) => {
    // mirror to stdout for live feedback
    if (e.type === "agent_text") process.stdout.write(e.text);
    else process.stdout.write(`\n[EVENT] ${JSON.stringify(e)}\n`);

    // event persistence removed — we no longer write _events.jsonl
  });

  await acp.start();
  logStatus(repo, "Started ACP client for Phase 2");
  try {
    logStatus(repo, "Running Phase 2: collecting repo context");
    await phase2RepoContext(repo, acp);
    logStatus(repo, "Wrote test/_repo_context.md");
  } finally {
    await acp.stop();
    logStatus(repo, "Stopped ACP client for Phase 2");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
