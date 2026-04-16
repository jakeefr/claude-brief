// OpenClaw plugin entry point for claude-brief
// All types declared inline -- do NOT import from @openclaw/* packages

import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// ---- Inline OpenClaw types (reverse-engineered from claude-mem) ----

interface OpenClawRuntime {
  channel: Record<string, Record<string, (...args: any[]) => Promise<any>>>;
  log: (message: string) => void;
  config: Record<string, any>;
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
}

interface OpenClawPlugin {
  name: string;
  version: string;
  init: (runtime: OpenClawRuntime) => Promise<void>;
  onAgentEnd?: (event: AgentEndEvent, runtime: OpenClawRuntime) => Promise<void>;
  onCommand?: (command: string, args: string, runtime: OpenClawRuntime) => Promise<string>;
  cron?: {
    schedule: string;
    handler: (runtime: OpenClawRuntime) => Promise<void>;
  };
}

interface AgentEndEvent {
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  duration: number;
  model: string;
}

// ---- Channel send map ----

const CHANNEL_SEND_MAP: Record<string, { namespace: string; functionName: string }> = {
  telegram:  { namespace: "telegram",  functionName: "sendMessageTelegram" },
  whatsapp:  { namespace: "whatsapp",  functionName: "sendMessageWhatsApp" },
  discord:   { namespace: "discord",   functionName: "sendMessageDiscord" },
  slack:     { namespace: "slack",     functionName: "sendMessageSlack" },
  signal:    { namespace: "signal",    functionName: "sendMessageSignal" },
  imessage:  { namespace: "imessage",  functionName: "sendMessageIMessage" },
  line:      { namespace: "line",      functionName: "sendMessageLine" },
};

// ---- SQLite access (reads from claude-brief's database) ----

function getDbPath(): string {
  return path.join(os.homedir(), ".claude-brief", "db.sqlite");
}

function readSessions(sinceMs: number): any[] {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return [];

  try {
    // Dynamic require to avoid bundling issues
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(
      "SELECT * FROM sessions WHERE start_time >= ? ORDER BY start_time DESC"
    ).all(sinceMs);
    db.close();
    return rows;
  } catch {
    return [];
  }
}

function getLastBriefTime(): number | null {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return null;

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM meta WHERE key = 'last_run'").get() as any;
    db.close();
    return row ? parseInt(row.value, 10) : null;
  } catch {
    return null;
  }
}

// ---- Brief generation ----

function generateBriefText(sessions: any[]): string {
  if (sessions.length === 0) {
    return "No agent activity since last brief.";
  }

  const totalCost = sessions.reduce((sum: number, s: any) => sum + (s.estimated_cost_usd || 0), 0);
  const totalTokens = sessions.reduce((sum: number, s: any) =>
    sum + (s.input_tokens || 0) + (s.output_tokens || 0) + (s.cache_read_tokens || 0), 0);
  const projects = new Set(sessions.map((s: any) => s.project_slug));

  const lines: string[] = [];
  const now = new Date();
  lines.push(`**claude-brief** -- ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
  lines.push("");
  lines.push(`${sessions.length} sessions | ${projects.size} projects | ~$${totalCost.toFixed(2)} | ${formatTokens(totalTokens)} tokens`);
  lines.push("");

  for (const s of sessions) {
    const isFailed = (s.error_count || 0) > 0;
    const icon = isFailed ? "\u274c" : "\u2705";
    const model = shortModel(s.model);
    const dur = formatDuration(s.duration_ms);
    const filesEdited = safeJsonParse(s.files_edited).length;
    const summary = s.last_assistant_message
      ? s.last_assistant_message.split("\n")[0].slice(0, 80)
      : (isFailed ? "Failed" : "Completed");

    lines.push(`${icon} **${s.project_slug}** ${dur} | ${filesEdited} files | ${model} | $${(s.estimated_cost_usd || 0).toFixed(2)}`);
    lines.push(`> ${summary}`);
    lines.push("");
  }

  return lines.join("\n");
}

function shortModel(m: string): string {
  if (!m) return "?";
  if (m.includes("opus")) return "opus";
  if (m.includes("haiku")) return "haiku";
  if (m.includes("sonnet")) return "sonnet";
  return m;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

function formatDuration(ms: number): string {
  if (!ms) return "0m";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function safeJsonParse(s: string | null): any[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

// ---- Send via channel ----

async function sendViaChannel(runtime: OpenClawRuntime, channel: string, recipientId: string, message: string): Promise<void> {
  const mapping = CHANNEL_SEND_MAP[channel];
  if (!mapping) throw new Error(`Unknown channel: ${channel}`);

  const channelFn = runtime.channel[mapping.namespace]?.[mapping.functionName];
  if (!channelFn) throw new Error(`Channel ${mapping.namespace}.${mapping.functionName} not available`);

  // Telegram: chunk messages > 4096 chars
  if (channel === "telegram" && message.length > 4096) {
    const chunks = chunkMessage(message, 4000);
    for (const chunk of chunks) {
      try {
        await channelFn(recipientId, chunk);
      } catch {
        // Fallback: strip markdown and retry
        await channelFn(recipientId, chunk.replace(/[*_`]/g, ""));
      }
    }
    return;
  }

  // WhatsApp requires third arg: { verbose: false }
  if (channel === "whatsapp") {
    await channelFn(recipientId, message, { verbose: false });
  } else {
    await channelFn(recipientId, message);
  }
}

function chunkMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

// ---- Plugin export ----

const plugin: OpenClawPlugin = {
  name: "claude-brief",
  version: "1.0.0",

  async init(runtime) {
    runtime.log("claude-brief plugin initialized");
  },

  async onAgentEnd(event, runtime) {
    // Record session ending -- the SessionEnd hook handles JSONL parsing,
    // but we can capture the last assistant message here for immediate use
    runtime.log(`Session ended: ${event.sessionId} (${event.model}, ${event.duration}ms)`);
  },

  async onCommand(command, args, runtime) {
    if (command !== "brief") return "";

    const config = runtime.config as any as {
      deliveryChannel: string;
      deliveryTo: string;
      lookbackHours?: number;
    };

    const lookbackMs = config.lookbackHours && config.lookbackHours > 0
      ? config.lookbackHours * 60 * 60 * 1000
      : null;

    const sinceMs = lookbackMs
      ? Date.now() - lookbackMs
      : (getLastBriefTime() || Date.now() - 24 * 60 * 60 * 1000);

    const sessions = readSessions(sinceMs);
    const briefText = generateBriefText(sessions);

    // Send via configured channel
    try {
      await sendViaChannel(runtime, config.deliveryChannel, config.deliveryTo, briefText);
      return `Brief sent via ${config.deliveryChannel} (${sessions.length} sessions)`;
    } catch (err: any) {
      return `Failed to send brief: ${err.message}`;
    }
  },

  cron: {
    schedule: "0 8 * * 1-5", // Default: 8am weekdays (overridden by config.schedule)
    async handler(runtime) {
      const config = runtime.config as any as {
        deliveryChannel: string;
        deliveryTo: string;
        lookbackHours?: number;
        schedule?: string;
      };

      if (config.schedule === "") return; // Disabled

      const lookbackMs = config.lookbackHours && config.lookbackHours > 0
        ? config.lookbackHours * 60 * 60 * 1000
        : null;

      const sinceMs = lookbackMs
        ? Date.now() - lookbackMs
        : (getLastBriefTime() || Date.now() - 24 * 60 * 60 * 1000);

      const sessions = readSessions(sinceMs);
      if (sessions.length === 0) {
        runtime.log("Scheduled brief: no activity, skipping send");
        return;
      }

      const briefText = generateBriefText(sessions);

      try {
        await sendViaChannel(runtime, config.deliveryChannel, config.deliveryTo, briefText);
        runtime.log(`Scheduled brief sent (${sessions.length} sessions)`);
      } catch (err: any) {
        runtime.log(`Scheduled brief failed: ${err.message}`);
      }
    },
  },
};

module.exports = plugin;
export default plugin;
