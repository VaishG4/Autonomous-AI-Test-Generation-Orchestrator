import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export function logStatus(repoRootAbs: string | null, message: string) {
  const prefix = "[STATUS]";
  const ts = new Date().toISOString();
  const line = `${ts} ${prefix} ${message}\n`;
  // Mirror to stdout for UI
  process.stdout.write(line);

  // Also persist to test/_status.log for inspection (best-effort)
  try {
    if (repoRootAbs) {
      const dir = path.join(repoRootAbs, "test");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const p = path.join(dir, "_status.log");
      appendFileSync(p, line, "utf8");
    }
  } catch (e) {
    // don't surface file errors to caller
  }
}

export default logStatus;
