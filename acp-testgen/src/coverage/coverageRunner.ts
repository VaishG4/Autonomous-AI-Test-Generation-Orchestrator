import { spawn } from "node:child_process";
import path from "node:path";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";

export async function runCoverage(repoRootAbs: string): Promise<{
  ok: boolean;
  pytestStdout: string;
  pytestStderr: string;
  coverageJsonPath: string;
  coverageSummaryPath?: string;
  coverageSummary?: any;
}> {
  const coverageJsonPath = path.join(repoRootAbs, "tests", "coverage.json");
  const coverageFile = path.join(repoRootAbs, "tests", ".coverage");

  const env = {
    ...process.env,
    COVERAGE_FILE: coverageFile,
    PYTHONPYCACHEPREFIX: path.join(repoRootAbs, "tests", ".pycache"),
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
  let coverageSummaryPath: string | undefined = undefined;
  let coverageSummary: any = undefined;

  // If coverage.json was produced, generate a reduced summary containing only
  // missing lines and missing branches per file, and append a run entry to history.
  if (existsSync(coverageJsonPath)) {
    try {
      const cov = JSON.parse(readFileSync(coverageJsonPath, "utf8"));
      const files: Record<string, any> = {};
      if (cov.files && typeof cov.files === "object") {
        for (const [fname, entry] of Object.entries<any>(cov.files)) {
          files[fname] = {
            missing_lines: entry?.missing_lines ?? [],
            missing_branches: entry?.missing_branches ?? entry?.missing_branches ?? [],
            summary: entry?.summary ?? null,
          };
        }
      }
      coverageSummary = { generated_at: new Date().toISOString(), files };
      coverageSummaryPath = path.join(repoRootAbs, "tests", "coverage_summary.json");
      writeFileSync(coverageSummaryPath, JSON.stringify(coverageSummary, null, 2), "utf8");

      // Append a compact history line for iterative tracking
      const historyPath = path.join(repoRootAbs, "tests", "coverage_history.jsonl");
      const runEntry = {
        ts: new Date().toISOString(),
        ok: ok && r2.code === 0,
        pytest_stdout_len: r1.stdout?.length ?? 0,
        pytest_stderr_len: r1.stderr?.length ?? 0,
        summary_path: coverageSummaryPath,
      };
      appendFileSync(historyPath, JSON.stringify(runEntry) + "\n", "utf8");
    } catch (e) {
      // ignore summary generation errors, we'll still return coverageJsonPath
    }
  }

  return {
    ok: ok && r2.code === 0,
    pytestStdout: r1.stdout,
    pytestStderr: r1.stderr + (r2.code !== 0 ? `\ncoverage json failed:\n${r2.stderr}` : ""),
    coverageJsonPath,
    coverageSummaryPath,
    coverageSummary,
  };
}
