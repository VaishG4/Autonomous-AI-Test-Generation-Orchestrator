import { spawn } from "node:child_process";

export type ExecResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export async function execCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<ExecResult> {
  return await new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
