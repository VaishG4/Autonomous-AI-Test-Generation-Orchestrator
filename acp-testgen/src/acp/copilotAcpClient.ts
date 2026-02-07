import * as acp from "@agentclientprotocol/sdk";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { FsPolicy } from "../policy/fsPolicy";

type SessionId = string;

export type AcpEvent =
  | { type: "agent_text"; text: string }
  | { type: "tool_call"; update: any }
  | { type: "tool_call_update"; update: any };

export class CopilotAcpClient {
  private proc!: ChildProcessWithoutNullStreams;
  private connection!: acp.ClientSideConnection;
  private sessionId!: SessionId;
  private agentBuffer: string = "";
  private drainPollMs: number;
  private drainStabilityChecks: number;
  private drainDefaultTimeoutMs: number;

  constructor(
    private readonly repoRootAbs: string,
    private readonly policy: FsPolicy,
    private readonly onEvent?: (e: AcpEvent) => void,
    opts?: { drainPollMs?: number; drainStabilityChecks?: number; drainDefaultTimeoutMs?: number },
  ) {
    this.drainPollMs = opts?.drainPollMs ?? 250;
    this.drainStabilityChecks = opts?.drainStabilityChecks ?? 3;
    this.drainDefaultTimeoutMs = opts?.drainDefaultTimeoutMs ?? 10000;
  }

  async start(): Promise<void> {
    const executable = process.env.COPILOT_CLI_PATH ?? "copilot";

    // Copilot CLI as ACP server (stdio)
    // docs: `copilot --acp --stdio` :contentReference[oaicite:3]{index=3}
    this.proc = spawn(executable, ["--acp", "--stdio",  "--model", "gpt-5-mini"], {
      stdio: ["pipe", "pipe", "inherit"],
      cwd: this.repoRootAbs,
    });

    const output = Writable.toWeb(this.proc.stdin) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(this.proc.stdout) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(output, input);

    const self = this;
    const clientImpl: acp.Client = {
      // Permission gate (ACP tool calls can request permission) :contentReference[oaicite:4]{index=4}
      async requestPermission(params) {
        const toolCall = params.toolCall as any;
        const options = params.options as any[];

        const decision = this.policy.decideToolPermission(toolCall);

        const allow = options.find((o) => o.kind === "allow_once") ?? options[0];
        const reject = options.find((o) => o.kind === "reject_once") ?? options[0];

        return {
          outcome: decision.allow
            ? { outcome: "selected", optionId: allow.optionId }
            : { outcome: "selected", optionId: reject.optionId },
        };
      },

      // Stream agent output + tool-call updates (great for UI) :contentReference[oaicite:5]{index=5}
      async sessionUpdate(params) {
        const update = (params as any).update;

        if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
          // append to internal buffer for orchestrator consumption
          self.agentBuffer += update.content.text;
          self.onEvent?.({ type: "agent_text", text: update.content.text });
        } else if (update?.sessionUpdate === "tool_call") {
          self.onEvent?.({ type: "tool_call", update });
        } else if (update?.sessionUpdate === "tool_call_update") {
          self.onEvent?.({ type: "tool_call_update", update });
        }
      },

      // Filesystem methods the agent will call (read/write) :contentReference[oaicite:6]{index=6}
      async readTextFile(params) {
        const p = (params as any).path as string;
        this.policy.assertCanRead(p);
        const content = readFileSync(p, "utf8");
        return { content };
      },

      async writeTextFile(params) {
        const p = (params as any).path as string;
        const content = (params as any).content as string;

        this.policy.assertCanWrite(p);

        const dir = path.dirname(p);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

        writeFileSync(p, content, "utf8");
        return null;
      },

      // Optional: we can add terminals later if you want Copilot to run commands via ACP terminals :contentReference[oaicite:7]{index=7}
      // For now we keep terminal capability off in initialize().
    };

    // Bind `this` for methods above
    (clientImpl.requestPermission as any) = clientImpl.requestPermission.bind(this);
    (clientImpl.sessionUpdate as any) = clientImpl.sessionUpdate.bind(this);
    (clientImpl.readTextFile as any) = clientImpl.readTextFile.bind(this);
    (clientImpl.writeTextFile as any) = clientImpl.writeTextFile.bind(this);

    this.connection = new acp.ClientSideConnection(() => clientImpl, stream);

    // Advertise client FS capabilities so agent is allowed to call fs methods :contentReference[oaicite:8]{index=8}
    await this.connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: false,
      },
    });

    const session = await this.connection.newSession({
      cwd: this.repoRootAbs,
      mcpServers: [],
    });

    this.sessionId = session.sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async prompt(text: string): Promise<void> {
    await this.connection.prompt({
      sessionId: this.sessionId,
      prompt: [{ type: "text", text }],
    });
  }

  // Drain buffered agent text. Waits until buffer is stable or timeout.
  async drainAgentOutput(timeoutMs?: number): Promise<string> {
    const timeout = timeoutMs ?? this.drainDefaultTimeoutMs;
    const poll = this.drainPollMs;
    const stabilityChecks = this.drainStabilityChecks;

    const start = Date.now();
    let lastLen = this.agentBuffer.length;
    let stableCount = 0;

    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, poll));
      if (this.agentBuffer.length === lastLen) {
        stableCount += 1;
        if (stableCount >= stabilityChecks) break;
      } else {
        lastLen = this.agentBuffer.length;
        stableCount = 0;
      }
    }

    const out = this.agentBuffer;
    this.agentBuffer = "";
    return out;
  }

  async stop(): Promise<void> {
    try {
      this.proc.stdin.end();
    } finally {
      this.proc.kill("SIGTERM");
    }
  }
}
