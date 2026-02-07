import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type OrchestratorConfig = {
  repoRoot: string;
  testDir: string;
  pyprojectPath: string;
  readOnlyDirs?: string[];
};

export function loadConfig(configPath: string): OrchestratorConfig {
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Config not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const cfg = yaml.load(raw) as Partial<OrchestratorConfig>;

  const repoRoot = cfg.repoRoot ?? "..";
  const testDir = cfg.testDir ?? "test";
  const pyprojectPath = cfg.pyprojectPath ?? "pyproject.toml";

  return {
    repoRoot,
    testDir,
    pyprojectPath,
    readOnlyDirs: cfg.readOnlyDirs ?? [],
  };
}

export function resolveInRepo(cfg: OrchestratorConfig, ...parts: string[]): string {
  return path.resolve(path.resolve(cfg.repoRoot), ...parts);
}
