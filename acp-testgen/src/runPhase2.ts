import { resolveTargetRepoAbs } from "./util/targetRepo.js";
import { FsPolicy } from "./policy/fsPolicy.js";
import { CopilotAcpClient } from "./acp/copilotAcpClient.js";
import { loadCoverageScope } from "./config/coverageConfig.js";
import { phase2RepoContext } from "./phases/phase2RepoContext.js";
// event logging removed: _events.jsonl was deleted to reduce verbosity

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
  try {
    await phase2RepoContext(repo, acp);
    console.log("Wrote test/_repo_context.md");
  } finally {
    await acp.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
