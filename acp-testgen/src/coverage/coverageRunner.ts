import { spawn } from "node:child_process";
import path from "node:path";

export async function runCoverage(repoRootAbs: string): Promise<{
  ok: boolean;
  pytestStdout: string;
  pytestStderr: string;
  coverageJsonPath: string;
}> {
  const coverageJsonPath = path.join(repoRootAbs, "test", "coverage.json");
  const coverageFile = path.join(repoRootAbs, "test", ".coverage");

  const env = {
    ...process.env,
    COVERAGE_FILE: coverageFile,
    PYTEST_ADDOPTS: `--cache-dir ${path.join(repoRootAbs, "test", ".pytest_cache")}`,
    PYTHONPYCACHEPREFIX: path.join(repoRootAbs, "test", ".pycache"),
    PYTHONDONTWRITEBYTECODE: "1",
  };

  const run = (cmd: string, args: string[]) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const p = spawn(cmd, args, { cwd: repoRootAbs, env });
      let stdout = "";
      let stderr = "";
      p.stdout.on("data", (d) => (stdout += d.toString()));
      p.stderr.on("data", (d) => (stderr += d.toString()));
      p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });

  const r1 = await run("python", ["-m", "coverage", "run", "-m", "pytest"]);
  const ok = r1.code === 0;

  const r2 = await run("python", ["-m", "coverage", "json", "-o", coverageJsonPath]);

  return {
    ok: ok && r2.code === 0,
    pytestStdout: r1.stdout,
    pytestStderr: r1.stderr + (r2.code !== 0 ? `\ncoverage json failed:\n${r2.stderr}` : ""),
    coverageJsonPath,
  };
}
