import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Returns the orchestrator repo root (directory containing package.json),
 * assuming this file is at: <orchRoot>/src/util/orchRoot.ts
 */
export function getOrchestratorRootAbs(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../.."); // from src/util -> orchRoot
}
