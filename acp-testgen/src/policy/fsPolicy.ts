import path from "node:path";

export type ToolPermissionDecision = { allow: boolean; reason: string };

export class FsPolicy {
  private testDirAbs: string;
  private readRootsAbs: string[];

  constructor(opts: { repoRootAbs: string; testDirRel: string; readRootsRel: string[] }) {
    this.testDirAbs = path.resolve(opts.repoRootAbs, opts.testDirRel);
    this.readRootsAbs = opts.readRootsRel.map((r) => path.resolve(opts.repoRootAbs, r));
  }

  private isUnder(child: string, parent: string): boolean {
    const rel = path.relative(parent, child);
    return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  }

  assertCanWrite(absPath: string) {
    const p = path.resolve(absPath);
    if (!this.isUnder(p, this.testDirAbs) && p !== this.testDirAbs) {
      throw new Error(`WRITE DENIED: ${p} (only ${this.testDirAbs} is writable)`);
    }
  }

  assertCanRead(absPath: string) {
    const p = path.resolve(absPath);

    // Allow reading tests too
    if (this.isUnder(p, this.testDirAbs) || p === this.testDirAbs) return;

    // Allow reading any configured coverage roots
    for (const root of this.readRootsAbs) {
      if (this.isUnder(p, root) || p === root) return;
    }

    // Allow common config reads
    const base = path.basename(p);
    if (base === "pyproject.toml" || base === "README.md" || base === "README.rst" || base === ".coveragerc") return;

    throw new Error(`READ DENIED: ${p} (not in coverage roots)`);
  }

  // ACP tool-call permission heuristic (best-effort; hard enforcement is in fs methods)
  decideToolPermission(toolCall: any): ToolPermissionDecision {
    const kind = toolCall?.kind ?? "other";

    if (kind === "edit" || kind === "delete" || kind === "move") {
      // If ACP provides locations, ensure all paths are under /test.
      const locs: Array<{ path: string }> = toolCall?.locations ?? [];
      const ok = locs.every((l) => {
        try {
          this.assertCanWrite(l.path);
          return true;
        } catch {
          return false;
        }
      });
      return ok
        ? { allow: true, reason: "Edit allowed in /test" }
        : { allow: false, reason: "Edits only allowed in /test" };
    }

    // We run tests ourselves for now → deny execute tool calls
    if (kind === "execute") return { allow: false, reason: "Orchestrator runs commands, not agent" };

    return { allow: true, reason: "Non-destructive tool call allowed" };
  }
}
