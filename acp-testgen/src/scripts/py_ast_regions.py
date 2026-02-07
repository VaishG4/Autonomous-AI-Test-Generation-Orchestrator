import { execFileSync } from "node:child_process";
import path from "node:path";
import { getOrchestratorRootAbs } from "../util/orchRoot.js";

export type LineRange = { start: number; end: number };
export type Region = { name: string; kind: string; start: number; end: number };
export type Chunk = { region: Region; ranges: LineRange[] };

function toRanges(lines: number[]): LineRange[] {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const out: LineRange[] = [];
  let i = 0;
  while (i < sorted.length) {
    let s = sorted[i];
    let e = s;
    i++;
    while (i < sorted.length && sorted[i] === e + 1) {
      e = sorted[i];
      i++;
    }
    out.push({ start: s, end: e });
  }
  return out;
}

export function getRegionsPython(prodFileAbs: string): Region[] {
  const orchRoot = getOrchestratorRootAbs();
  const scriptAbs = path.join(orchRoot, "scripts", "py_ast_regions.py");

  const raw = execFileSync("python3", [scriptAbs, prodFileAbs], { encoding: "utf8" });
  const obj = JSON.parse(raw);
  return obj.regions as Region[];
}

export function planChunks(prodFileAbs: string, missingLines: number[]): Chunk[] {
  const allRegions = getRegionsPython(prodFileAbs);
  const moduleRegion = allRegions.find((r) => r.name === "<module>")!;
  const regions = allRegions
    .filter((r) => r.name !== "<module>")
    .sort((a, b) => a.start - b.start);

  const ranges = toRanges(missingLines);

  const byRegion = new Map<string, { region: Region; ranges: LineRange[] }>();
  for (const rg of ranges) {
    const region =
      regions.find((r) => rg.start >= r.start && rg.end <= r.end) ?? moduleRegion;

    const key = region.name;
    if (!byRegion.has(key)) byRegion.set(key, { region, ranges: [] });
    byRegion.get(key)!.ranges.push(rg);
  }

  return [...byRegion.values()].sort((a, b) => a.region.start - b.region.start);
}
