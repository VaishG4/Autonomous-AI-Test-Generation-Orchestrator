import path from "node:path";

export function toPosix(p: string): string {
  return p.replaceAll(path.sep, "/");
}
