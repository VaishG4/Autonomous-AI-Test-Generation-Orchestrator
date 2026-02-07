import { execCmd } from "./exec.js";

export async function listChangedFiles(repoRoot: string): Promise<string[]> {
  const r = await execCmd("git", ["diff", "--name-only"], { cwd: repoRoot });
  if (r.code !== 0) return [];
  return r.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
