import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseTranscript } from "./parser.js";
import { upsertSession } from "./store.js";
import { TriggerFile } from "../types.js";

const TRIGGERS_DIR = path.join(os.homedir(), ".claude-brief", "triggers");

/**
 * Process a single trigger file written by the SessionEnd hook.
 */
export function processTrigger(triggerPath: string): boolean {
  let trigger: TriggerFile;
  try {
    const raw = fs.readFileSync(triggerPath, "utf-8");
    trigger = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!trigger.transcriptPath || !trigger.sessionId) return false;

  // 500ms delay — JSONL may still be buffered when SessionEnd fires
  const fileAge = Date.now() - fs.statSync(triggerPath).mtimeMs;
  if (fileAge < 500) {
    // Wait for buffer flush
    const waitMs = 500 - fileAge;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
  }

  const summary = parseTranscript(trigger.transcriptPath);
  if (!summary) return false;

  upsertSession(summary);

  // Remove trigger file after processing
  try {
    fs.unlinkSync(triggerPath);
  } catch {
    // Non-critical
  }

  return true;
}

/**
 * Scan triggers directory and process all pending triggers.
 */
export function processAllTriggers(): number {
  if (!fs.existsSync(TRIGGERS_DIR)) return 0;

  let processed = 0;
  const files = fs.readdirSync(TRIGGERS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const triggerPath = path.join(TRIGGERS_DIR, file);
    if (processTrigger(triggerPath)) {
      processed++;
    }
  }

  return processed;
}

/**
 * Watch triggers directory for new files (used by `claude-brief watch`).
 */
export function watchTriggers(callback?: (processed: number) => void): fs.FSWatcher {
  if (!fs.existsSync(TRIGGERS_DIR)) {
    fs.mkdirSync(TRIGGERS_DIR, { recursive: true });
  }

  // Process any existing triggers first
  const initial = processAllTriggers();
  if (initial > 0 && callback) callback(initial);

  const watcher = fs.watch(TRIGGERS_DIR, (eventType, filename) => {
    if (!filename || !filename.endsWith(".json")) return;

    // Small delay to let the file finish writing
    setTimeout(() => {
      const triggerPath = path.join(TRIGGERS_DIR, filename);
      if (fs.existsSync(triggerPath)) {
        if (processTrigger(triggerPath)) {
          if (callback) callback(1);
        }
      }
    }, 600);
  });

  return watcher;
}
