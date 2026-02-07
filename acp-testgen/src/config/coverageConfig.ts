import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseToml } from "toml";

export type CoverageScope = {
  readRootsRel: string[]; // folders agent can read
};

export function loadCoverageScope(repoRootAbs: string): CoverageScope {
  const pyprojectPath = path.join(repoRootAbs, "pyproject.toml");
  let pyproject = "";
  try {
    pyproject = readFileSync(pyprojectPath, "utf8");
  } catch (e) {
    return { readRootsRel: ["src"] };
  }

  let obj: any = null;
  try {
    obj = parseToml(pyproject);
  } catch (e) {
    // fall back to a heuristic extractor if TOML is unexpected
    console.warn(`Warning: failed to parse pyproject.toml (${String(e)}). Attempting heuristic extraction of coverage.source.`);

    function extractSourceFromRaw(text: string): string[] {
      if (!text) return [];
      // Capture the [tool.coverage.run] section
      const sectionRe = /^\s*\[tool\.coverage\.run\]\s*([\s\S]*?)(?=^\s*\[|\z)/m;
      const sec = text.match(sectionRe)?.[1];
      if (!sec) return [];
      // Find the source = [ ... ] array inside that section
      const srcRe = /source\s*=\s*(\[[\s\S]*?\])/m;
      const arrText = sec.match(srcRe)?.[1];
      if (!arrText) return [];
      // Extract string literals inside the brackets
      const itemRe = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
      const out: string[] = [];
      let m: RegExpExecArray | null = null;
      while ((m = itemRe.exec(arrText)) !== null) {
        out.push((m[1] ?? m[2]) as string);
      }
      return out;
    }

    const heur = extractSourceFromRaw(pyproject).map((s) => s.trim()).filter(Boolean);
    if (heur.length) {
      console.info(`Parsed pyproject.toml (heuristic): using coverage.source = [${heur.join(", ")}]`);
      return { readRootsRel: heur };
    }

    console.info("Parsed pyproject.toml (heuristic): no coverage.source found, falling back to ['src']");
    return { readRootsRel: ["src"] };
  }

  const run = obj?.tool?.coverage?.run ?? {};

  // Helper: extract string paths from various shapes including arrays of tables
  function extractStringsFromEntry(entry: any): string[] {
    if (entry == null) return [];
    if (typeof entry === "string") return [entry];
    if (Array.isArray(entry)) {
      return entry.flatMap((e) => extractStringsFromEntry(e));
    }
    if (typeof entry === "object") {
      // Common keys that may contain the path/name
      const common = ["path", "name", "package", "module", "src", "source"];
      for (const k of common) {
        const v = (entry as any)[k];
        if (typeof v === "string") return [v];
        if (Array.isArray(v)) return v.filter((s) => typeof s === "string");
      }

      // Otherwise collect any string-valued properties
      const vals: string[] = [];
      for (const v of Object.values(entry)) {
        if (typeof v === "string") vals.push(v);
        else if (Array.isArray(v)) vals.push(...v.filter((s) => typeof s === "string"));
      }
      return vals;
    }
    return [];
  }

  const rawSrc = run.source ?? run.source_pkgs ?? ["src"];
  const src = extractStringsFromEntry(rawSrc).map((s) => String(s).trim()).filter(Boolean);

  if (src.length) {
    console.info(`Parsed pyproject.toml: using coverage.source = [${src.join(", ")}]`);
  } else {
    console.info("Parsed pyproject.toml: no coverage.source found, falling back to ['src']");
  }

  return { readRootsRel: src.length ? src : ["src"] };
}
