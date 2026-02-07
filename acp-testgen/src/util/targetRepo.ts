import path from "node:path";
import fs from "node:fs";

function getArgValue(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const val = argv[idx + 1];
  if (!val || val.startsWith("--")) return null;
  return val;
}

export function resolveTargetRepoAbs(argv: string[]): string {
  const fromFlag = getArgValue(argv, "--repo");
  const fromEnv = process.env.TARGET_REPO;

  const raw = fromFlag ?? fromEnv;
  if (!raw) {
    throw new Error(
      `Missing target repo.\n` +
      `Provide either:\n` +
      `  --repo /absolute/path/to/target-repo\n` +
      `or set env:\n` +
      `  TARGET_REPO=/absolute/path/to/target-repo`
    );
  }

  // Resolve the path; be a bit forgiving for common user mistakes:
  // - path provided without a leading '/' (e.g. "home/..")
  // - tilde expansion ("~/repo")
  let repoAbs = path.resolve(raw);

  if (!fs.existsSync(repoAbs)) {
    // Try prepending a leading slash: user may have omitted it.
    if (!raw.startsWith("/") && fs.existsSync(path.resolve("/" + raw))) {
      repoAbs = path.resolve("/" + raw);
    }
    // Try expanding ~ to $HOME
    else if (raw.startsWith("~")) {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        const expanded = path.resolve(path.join(home, raw.slice(1)));
        if (fs.existsSync(expanded)) repoAbs = expanded;
      }
    }
  }

  // Basic sanity checks
  if (!fs.existsSync(repoAbs)) {
    throw new Error(
      `Target repo path does not exist: ${repoAbs}\n` +
      `Hint: pass an absolute path starting with '/'. Example:\n` +
      `  --repo /home/aravind/Arav/test_cases_generator/click\n` +
      `Or set env: TARGET_REPO=/absolute/path/to/target-repo`
    );
  }
  const pyproject = path.join(repoAbs, "pyproject.toml");
  if (!fs.existsSync(pyproject)) {
    throw new Error(`No pyproject.toml found in target repo: ${pyproject}`);
  }

  return repoAbs;
}
