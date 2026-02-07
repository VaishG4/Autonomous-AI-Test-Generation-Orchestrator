import fs from "node:fs";

export type RunState = {
  runId: string;
  phase: string;
  startedAt: string | null;
  updatedAt: string | null;
  lastCommand: string | null;
  currentTarget: Record<string, any> | null;
};

export function readState(statePath: string): RunState {
  const raw = fs.readFileSync(statePath, "utf8");
  return JSON.parse(raw) as RunState;
}

export function writeState(statePath: string, state: RunState) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}
