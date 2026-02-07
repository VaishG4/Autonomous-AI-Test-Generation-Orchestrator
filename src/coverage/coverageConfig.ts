import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

export type CoverageConfig = {
  sourceRoots: string[];     // e.g. ["src"]
  omit: string[];            // glob-ish patterns
  include: string[];         // (optional) include patterns
};

export function readCoverageConfig(pyprojectAbsPath: string): CoverageConfig {
  const raw = fs.readFileSync(pyprojectAbsPath, "utf8");
  const doc = TOML.parse(raw) as any;

  const run = doc?.tool?.coverage?.run ?? {};
  const report = doc?.tool?.coverage?.report ?? {};

  const source = (run.source ?? run.source_pkgs ?? []) as string[] | string;
  const sourceRoots = Array.isArray(source) ? source : source ? [source] : ["src"];

  const omit = (run.omit ?? report.omit ?? []) as string[] | string;
  const omitArr = Array.isArray(omit) ? omit : omit ? [omit] : [];

  const include = (run.include ?? report.include ?? []) as string[] | string;
  const includeArr = Array.isArray(include) ? include : include ? [include] : [];

  return {
    sourceRoots: sourceRoots.map((s) => s.toString()),
    omit: omitArr.map((s) => s.toString()),
    include: includeArr.map((s) => s.toString()),
  };
}

export function resolveSourceDirs(repoRoot: string, sourceRoots: string[]): string[] {
  return sourceRoots.map((sr) => path.resolve(repoRoot, sr));
}
