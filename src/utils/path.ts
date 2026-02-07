import path from "node:path";

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function isUnderDir(filePath: string, dirPath: string): boolean {
  const rel = path.relative(dirPath, filePath);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
