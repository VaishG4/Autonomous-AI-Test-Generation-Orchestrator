import fs from "node:fs";
import path from "node:path";

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function writeFileIfMissing(filePath: string, content: string) {
  if (!fs.existsSync(filePath)) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, "utf8");
  }
}
