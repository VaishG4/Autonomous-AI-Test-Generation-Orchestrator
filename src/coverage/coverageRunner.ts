import path from "node:path";
import fs from "node:fs";
import { execCmd } from "../utils/exec.js";
import { ensureDir } from "../utils/files.js";

export type CoverageRunResult = {
  ok: boolean;
  pytestStdout: string;
  pytestStderr: string;
  coverageJsonPath: string;
};

export async function runCoverage(opts: {
  repoRootAbs: string;
  testDirAbs: string;
  pythonBin?: string; // default "python"
}): Promise<CoverageRunResult> {
  const python = opts.pythonBin ?? "python";
  ensureDir(opts.testDirAbs);

  const coverageFile = path.join(opts.testDirAbs, ".coverage");
  const coverageJsonPath = path.join(opts.testDirAbs, "coverage.json");

  // Make pytest/pycache writes land inside /test
  const env = {
    COVERAGE_FILE: coverageFile,
    PYTEST_ADDOPTS: `--cache-dir ${path.join(opts.testDirAbs, ".pytest_cache")}`,
    PYTHONPYCACHEPREFIX: path.join(opts.testDirAbs, ".pycache"),
    PYTHONDONTWRITEBYTECODE: "1",
  };

  // Run: coverage run -m pytest
  const r1 = await execCmd(python, ["-m", "coverage", "run", "-m", "pytest"], {
    cwd: opts.repoRootAbs,
    env,
  });

  // Always attempt to write coverage json (even if pytest fails, so you can debug)
  const r2 = await execCmd(python, ["-m", "coverage", "json", "-o", coverageJsonPath], {
    cwd: opts.repoRootAbs,
    env,
  });

  // Ensure file exists (best effort)
  if (!fs.existsSync(coverageJsonPath)) {
    fs.writeFileSync(coverageJsonPath, JSON.stringify({ error: "coverage json not produced" }, null, 2));
  }

  return {
    ok: r1.code === 0 && r2.code === 0,
    pytestStdout: r1.stdout,
    pytestStderr: r1.stderr + (r2.code !== 0 ? `\n[coverage json stderr]\n${r2.stderr}` : ""),
    coverageJsonPath,
  };
}
