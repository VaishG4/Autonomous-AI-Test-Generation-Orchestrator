import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

export function getRegionsPython(fileAbs: string): Region[] {
  const orchRoot = getOrchestratorRootAbs();
  const scriptAbs = path.join(orchRoot, "src", "scripts", "py_ast_regions_fixed.py");

  const raw = execFileSync("python3", [scriptAbs, fileAbs], { encoding: "utf8" });
  const obj = JSON.parse(raw);
  return obj.regions as Region[];
}

export function planChunks(prodFileAbs: string, missingLines: number[]): Chunk[] {
  const regions = getRegionsPython(prodFileAbs)
    .filter((r) => r.name !== "<module>") // we want function/class-first
    .sort((a, b) => a.start - b.start);

  const moduleRegion = getRegionsPython(prodFileAbs).find((r) => r.name === "<module>")!;
  const ranges = toRanges(missingLines);

  // assign each missing range to the smallest containing region; otherwise module
  const byRegion = new Map<string, { region: Region; ranges: LineRange[] }>();

  for (const rg of ranges) {
    const region =
      regions.find((r) => rg.start >= r.start && rg.end <= r.end) ??
      moduleRegion;

    const key = region.name;
    if (!byRegion.has(key)) byRegion.set(key, { region, ranges: [] });
    byRegion.get(key)!.ranges.push(rg);
  }

  return [...byRegion.values()].sort((a, b) => a.region.start - b.region.start);
}

export function readSnippet(fileAbs: string, start: number, end: number): string {
  const lines = readFileSync(fileAbs, "utf8").split(/\r?\n/);
  return lines.slice(start - 1, end).join("\n");
}
