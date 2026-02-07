import fs from "node:fs";
import path from "node:path";

export type EventRecord = {
  ts: string;              // ISO timestamp
  type: string;            // e.g. "phase_started"
  data?: Record<string, any>;
};

export class EventLogger {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "", "utf8");
  }

  log(type: string, data?: Record<string, any>) {
    const ev: EventRecord = { ts: new Date().toISOString(), type, data };
    fs.appendFileSync(this.filePath, JSON.stringify(ev) + "\n", "utf8");
  }
}
