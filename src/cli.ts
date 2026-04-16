import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import { generateDigest, refreshFromJSONL, getStatusLine } from "./brief/generator.js";
import { formatDigest, formatJSON, formatCSV, formatMarkdown } from "./brief/formatter.js";
import { watchTriggers, processAllTriggers } from "./collector/hook.js";
import { getSessions, closeDb, resetDb } from "./collector/store.js";
import { setConfigValue, loadConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name("claude-brief")
  .description("Pick up exactly where your agents left off. Session digest for Claude Code.")
  .version("1.0.0")
  .enablePositionalOptions()
  .passThroughOptions();

// Default command: show digest
program
  .option("--since <duration>", "Lookback window (e.g. 2h, 24h, 7d)")
  .option("--project <name>", "Filter to specific project")
  .option("--format <fmt>", "Output format: text, json, csv, markdown", "text")
  .option("--refresh", "Force re-parse all JSONL files", true)
  .option("--no-refresh", "Skip re-parsing JSONL files")
  .option("--api-rates", "Show costs at API rates even for subscription sessions")
  .action((opts) => {
    const result = generateDigest({
      since: opts.since,
      project: opts.project,
      format: opts.format,
      refresh: opts.refresh,
      apiRates: opts.apiRates,
    });

    switch (opts.format) {
      case "json":
        process.stdout.write(formatJSON(result) + "\n");
        break;
      case "csv":
        process.stdout.write(formatCSV(result) + "\n");
        break;
      case "markdown":
        process.stdout.write(formatMarkdown(result) + "\n");
        break;
      default:
        process.stdout.write(formatDigest(result) + "\n");
        break;
    }

    closeDb();
  });

// TUI command
program
  .command("tui")
  .description("Open interactive TUI history browser")
  .action(async () => {
    // Force a refresh before opening TUI
    refreshFromJSONL();

    // Dynamic import for Ink (ESM)
    const { renderTui } = await import("./tui/App.js");
    renderTui();
  });

// Dashboard / web viewer
program
  .command("dashboard")
  .description("Open web viewer in browser (localhost:7878)")
  .option("-p, --port <port>", "Port to serve on", "7878")
  .option("--no-open", "Don't auto-open browser")
  .action(async (opts) => {
    refreshFromJSONL();
    const { startServer } = await import("./web/server.js");
    const port = parseInt(opts.port, 10);
    startServer(port, opts.open !== false);
  });

// Watch command
program
  .command("watch")
  .description("Start background watcher (processes hook triggers)")
  .action(() => {
    console.log("claude-brief watcher started. Watching for session triggers...");
    console.log("Press Ctrl+C to stop.\n");

    const watcher = watchTriggers((processed) => {
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}] Processed ${processed} session(s)`);
    });

    process.on("SIGINT", () => {
      watcher.close();
      closeDb();
      console.log("\nWatcher stopped.");
      process.exit(0);
    });
  });

// Install command
program
  .command("install")
  .description("Install hooks into .claude/settings.json")
  .action(() => {
    installHooks();
  });

// Uninstall command
program
  .command("uninstall")
  .description("Remove hooks from .claude/settings.json")
  .action(() => {
    uninstallHooks();
  });

// Status command
program
  .command("status")
  .description("One-line status: sessions today, cost today, last run")
  .action(() => {
    refreshFromJSONL();
    console.log(getStatusLine());
    closeDb();
  });

// Config command
const configCmd = program
  .command("config")
  .description("Get or set configuration values");

configCmd
  .command("set <key> <value>")
  .description("Set a config value (e.g. billing-mode api|subscription|auto)")
  .action((key: string, value: string) => {
    try {
      if (key === "billing-mode" && !["api", "subscription", "auto"].includes(value)) {
        console.error(`Invalid billing-mode: ${value}. Must be: api, subscription, or auto`);
        process.exit(1);
      }
      setConfigValue(key, value);
      console.log(`Set ${key} = ${value}`);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });

configCmd
  .command("get [key]")
  .description("Get a config value or show all config")
  .action((key?: string) => {
    const config = loadConfig();
    if (key) {
      const val = (config as any)[key] ?? (config as any)[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())];
      console.log(val !== undefined ? val : `(not set)`);
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
  });

// Export command
program
  .command("export")
  .description("Export session history")
  .option("--format <fmt>", "Export format: json, csv", "json")
  .option("--since <duration>", "Lookback window")
  .option("--project <name>", "Filter to project")
  .action((opts) => {
    const result = generateDigest({
      since: opts.since || "30d",
      project: opts.project,
      format: opts.format,
    });

    switch (opts.format) {
      case "csv":
        process.stdout.write(formatCSV(result) + "\n");
        break;
      default:
        process.stdout.write(formatJSON(result) + "\n");
        break;
    }

    closeDb();
  });

// Database management commands
const dbCmd = program
  .command("db")
  .description("Database management commands");

dbCmd
  .command("reset")
  .description("Clear all stored sessions and metadata")
  .action(() => {
    const count = resetDb();
    console.log(`Cleared ${count} session${count !== 1 ? "s" : ""} from database.`);
    closeDb();
  });

function installHooks() {
  const claudeDir = path.join(os.homedir(), ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");
  const briefDir = path.join(os.homedir(), ".claude-brief");
  const hooksDir = path.join(briefDir, "hooks");
  const triggersDir = path.join(briefDir, "triggers");

  // Create directories
  for (const dir of [briefDir, hooksDir, triggersDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Copy hook scripts
  const srcHooksDir = path.join(__dirname, "..", "hooks");
  // If running from dist, hooks are at project root
  const hookSrcCandidates = [
    path.join(__dirname, "..", "hooks"),
    path.join(__dirname, "..", "..", "hooks"),
  ];

  let hooksSrcDir = "";
  for (const candidate of hookSrcCandidates) {
    if (fs.existsSync(path.join(candidate, "session-end.sh"))) {
      hooksSrcDir = candidate;
      break;
    }
  }

  if (hooksSrcDir) {
    for (const file of ["session-end.sh", "stop-failure.sh"]) {
      const src = path.join(hooksSrcDir, file);
      const dest = path.join(hooksDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        try {
          fs.chmodSync(dest, 0o755);
        } catch {
          // chmod may fail on Windows
        }
      }
    }
  } else {
    // Write inline hook scripts as fallback
    writeInlineHooks(hooksDir);
  }

  // Read or create settings.json
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};

  const sessionEndHook = {
    hooks: [
      {
        type: "command",
        command: path.join(hooksDir, "session-end.sh").replace(/\\/g, "/"),
      },
    ],
  };

  const stopFailureHook = {
    hooks: [
      {
        type: "command",
        command: path.join(hooksDir, "stop-failure.sh").replace(/\\/g, "/"),
      },
    ],
  };

  // Add hooks (don't duplicate)
  if (!settings.hooks.SessionEnd) settings.hooks.SessionEnd = [];
  const hasSessionEnd = settings.hooks.SessionEnd.some(
    (h: any) => JSON.stringify(h).includes("claude-brief")
  );
  if (!hasSessionEnd) {
    settings.hooks.SessionEnd.push(sessionEndHook);
  }

  if (!settings.hooks.StopFailure) settings.hooks.StopFailure = [];
  const hasStopFailure = settings.hooks.StopFailure.some(
    (h: any) => JSON.stringify(h).includes("claude-brief")
  );
  if (!hasStopFailure) {
    settings.hooks.StopFailure.push(stopFailureHook);
  }

  // Write settings
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  console.log("claude-brief hooks installed successfully!");
  console.log(`  Hooks directory: ${hooksDir}`);
  console.log(`  Settings file:   ${settingsPath}`);
  console.log(`  Database:        ${path.join(briefDir, "db.sqlite")}`);
  console.log("");
  console.log("Run 'claude-brief' to see your first digest.");
}

function writeInlineHooks(hooksDir: string) {
  const sessionEndScript = `#!/usr/bin/env bash
# claude-brief SessionEnd hook
INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.transcript_path||'')")
SESSION_ID=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.session_id||'')")
if [ -n "$TRANSCRIPT_PATH" ] && [ -n "$SESSION_ID" ]; then
  TRIGGER_DIR="\${HOME}/.claude-brief/triggers"
  mkdir -p "$TRIGGER_DIR"
  echo "{\\"transcriptPath\\":\\"$TRANSCRIPT_PATH\\",\\"sessionId\\":\\"$SESSION_ID\\",\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}" \\
    > "$TRIGGER_DIR/\${SESSION_ID}.json"
fi
`;

  const stopFailureScript = `#!/usr/bin/env bash
# claude-brief StopFailure hook
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.session_id||'')")
ERROR_TYPE=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(d.error_type||'unknown')")
if [ -n "$SESSION_ID" ]; then
  TRIGGER_DIR="\${HOME}/.claude-brief/triggers"
  mkdir -p "$TRIGGER_DIR"
  echo "{\\"sessionId\\":\\"$SESSION_ID\\",\\"errorType\\":\\"$ERROR_TYPE\\",\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\",\\"isFailure\\":true}" \\
    > "$TRIGGER_DIR/fail-\${SESSION_ID}.json"
fi
`;

  fs.writeFileSync(path.join(hooksDir, "session-end.sh"), sessionEndScript);
  fs.writeFileSync(path.join(hooksDir, "stop-failure.sh"), stopFailureScript);
  try {
    fs.chmodSync(path.join(hooksDir, "session-end.sh"), 0o755);
    fs.chmodSync(path.join(hooksDir, "stop-failure.sh"), 0o755);
  } catch {
    // chmod may fail on Windows
  }
}

function uninstallHooks() {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");

  if (!fs.existsSync(settingsPath)) {
    console.log("No settings.json found. Nothing to uninstall.");
    return;
  }

  let settings: any;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch {
    console.log("Could not parse settings.json.");
    return;
  }

  if (settings.hooks) {
    if (settings.hooks.SessionEnd) {
      settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
        (h: any) => !JSON.stringify(h).includes("claude-brief")
      );
      if (settings.hooks.SessionEnd.length === 0) delete settings.hooks.SessionEnd;
    }
    if (settings.hooks.StopFailure) {
      settings.hooks.StopFailure = settings.hooks.StopFailure.filter(
        (h: any) => !JSON.stringify(h).includes("claude-brief")
      );
      if (settings.hooks.StopFailure.length === 0) delete settings.hooks.StopFailure;
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log("claude-brief hooks removed from settings.json.");
}

program.parse();
