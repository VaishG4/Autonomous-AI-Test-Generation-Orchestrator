import path from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { CopilotAcpClient } from "../acp/copilotAcpClient";

export async function phase2RepoContext(repoRootAbs: string, acpClient: CopilotAcpClient) {
  const pyproject = readFileSync(path.join(repoRootAbs, "pyproject.toml"), "utf8");
  const readmePath = path.join(repoRootAbs, "README.md");
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

  const prompt = `
You are analyzing a Python repository to help generate tests later.

Write a concise but thorough repo summary with:
- module layout
- key entrypoints
- important domain logic
- how to run tests (from pyproject if present)
- any tricky dependencies / I/O / time / randomness
- note any patterns helpful for testing

Return ONLY markdown content (no code fences).

pyproject.toml:
${pyproject}

README:
${readme}
`.trim();

  // Ask copilot to produce the summary text; orchestrator writes it into /tests.
  // (Keeps our write-path deterministic and still obeys your policy.)
  let collected = "";
  await acpClient.prompt(prompt); // agent output comes via streaming events in UI
  // drain the agent buffered output (waits until stream is stable)
  try {
    collected = await acpClient.drainAgentOutput();
  } catch (e) {
    collected = "# Repo Context\n\n(Agent output unavailable)\n";
  }

  if (!collected || collected.trim().length === 0) {
    collected = "# Repo Context\n\n(Agent produced no content)\n";
  }

  writeFileSync(path.join(repoRootAbs, "tests", "_repo_context.md"), collected, "utf8");
}
