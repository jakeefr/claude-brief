/**
 * Seed ~/.claude-brief/db.sqlite with demo sessions matching the splash SVG.
 * Run with: npx tsx scripts/seed-demo.ts
 */
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DB_DIR = path.join(os.homedir(), ".claude-brief");
const DB_PATH = path.join(DB_DIR, "db.sqlite");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure schema exists
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    project_slug TEXT NOT NULL,
    project_path TEXT NOT NULL,
    git_branch TEXT,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    model TEXT NOT NULL,
    slug TEXT,
    claude_version TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    web_search_requests INTEGER DEFAULT 0,
    web_fetch_requests INTEGER DEFAULT 0,
    has_thinking INTEGER DEFAULT 0,
    speed_mode TEXT DEFAULT 'standard',
    files_edited TEXT,
    files_created TEXT,
    tool_calls TEXT,
    bash_commands TEXT,
    git_commits TEXT,
    mcp_tool_calls INTEGER DEFAULT 0,
    subagent_spawns INTEGER DEFAULT 0,
    stop_reason TEXT,
    end_reason TEXT,
    error_count INTEGER DEFAULT 0,
    compaction_count INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    last_assistant_message TEXT,
    billing_mode TEXT DEFAULT 'subscription',
    entrypoint TEXT DEFAULT 'cli',
    user_type TEXT DEFAULT 'external',
    created_at INTEGER DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_slug);
  CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time DESC);
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Clear ALL sessions so only demo data appears
db.prepare("DELETE FROM sessions").run();

const DEMO_IDS = [
  "demo-api-server-001",
  "demo-frontend-001",
  "demo-frontend-002",
  "demo-data-pipeline-001",
];
for (const id of DEMO_IDS) {
  db.prepare("DELETE FROM sessions WHERE session_id = ?").run(id);
}

// Timestamps: sessions end "recently" so --since 24h picks them up
const now = Date.now();
const h = 60 * 60 * 1000;
const m = 60 * 1000;

const insert = db.prepare(`
  INSERT INTO sessions (
    session_id, project_slug, project_path, git_branch,
    start_time, end_time, duration_ms, model, slug, claude_version,
    input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
    web_search_requests, web_fetch_requests, has_thinking, speed_mode,
    files_edited, files_created, tool_calls, bash_commands, git_commits,
    mcp_tool_calls, subagent_spawns, stop_reason, end_reason,
    error_count, compaction_count, estimated_cost_usd, last_assistant_message,
    billing_mode, entrypoint, user_type
  ) VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?
  )
`);

const sessions = [
  {
    id: "demo-api-server-001",
    project: "api-server",
    path: "/home/user/projects/api-server",
    branch: "main",
    durationMin: 47,
    endAgo: 1 * h,        // ended 1h ago
    model: "claude-sonnet-4-6",
    inputTokens: 42000,
    outputTokens: 18000,
    cacheReadTokens: 29000,
    cacheCreationTokens: 0,
    filesEdited: [
      "src/middleware/auth.ts", "src/middleware/rate-limit.ts",
      "src/routes/api.ts", "src/routes/users.ts",
      "src/config/limits.ts", "src/utils/token.ts",
      "src/types/auth.ts", "src/tests/auth.test.ts",
      "src/tests/rate-limit.test.ts", "package.json",
      "src/index.ts", "README.md",
    ],
    filesCreated: ["src/middleware/rate-limit.ts", "src/config/limits.ts"],
    toolCalls: [
      { name: "Read", count: 28 }, { name: "Edit", count: 19 },
      { name: "Bash", count: 14 }, { name: "Write", count: 3 },
      { name: "Grep", count: 8 }, { name: "Glob", count: 5 },
    ],
    bashCommands: ["npm test", "npm run build", "git add -A", "git commit"],
    gitCommits: [
      "extract auth to middleware", "add rate limiter skeleton",
      "implement sliding window", "add per-route config",
      "wire up rate-limit middleware", "add auth tests",
      "add rate-limit tests", "update README",
    ],
    stopReason: "end_turn",
    endReason: "",
    errorCount: 0,
    cost: 0.21,
    summary: "Refactored auth middleware, added rate limiting",
  },
  {
    id: "demo-frontend-001",
    project: "frontend",
    path: "/home/user/projects/frontend",
    branch: "main",
    durationMin: 8,
    endAgo: 2 * h,        // ended 2h ago
    model: "claude-haiku-4-5",
    inputTokens: 6000,
    outputTokens: 3500,
    cacheReadTokens: 2500,
    cacheCreationTokens: 0,
    filesEdited: [
      "src/components/ExportButton.tsx",
      "src/utils/csv.ts",
      "src/tests/csv.test.ts",
    ],
    filesCreated: [],
    toolCalls: [
      { name: "Read", count: 5 }, { name: "Edit", count: 4 },
      { name: "Bash", count: 3 }, { name: "Grep", count: 2 },
    ],
    bashCommands: ["npm test", "npm run build"],
    gitCommits: [],
    stopReason: "end_turn",
    endReason: "",
    errorCount: 0,
    cost: 0.03,
    summary: "Fixed CSV export alignment bug",
  },
  {
    id: "demo-frontend-002",
    project: "frontend",
    path: "/home/user/projects/frontend",
    branch: "feat/pagination",
    durationMin: 23,
    endAgo: 1.5 * h,      // ended 1.5h ago
    model: "claude-sonnet-4-6",
    inputTokens: 16000,
    outputTokens: 8000,
    cacheReadTokens: 10000,
    cacheCreationTokens: 0,
    filesEdited: [
      "src/routes/users.ts", "src/components/UserList.tsx",
      "src/hooks/usePagination.ts", "src/types/api.ts",
      "src/tests/users.test.ts",
    ],
    filesCreated: ["src/hooks/usePagination.ts"],
    toolCalls: [
      { name: "Read", count: 12 }, { name: "Edit", count: 9 },
      { name: "Bash", count: 7 }, { name: "Write", count: 2 },
      { name: "Grep", count: 4 },
    ],
    bashCommands: ["npm test", "npm run build", "git add -A"],
    gitCommits: [
      "add usePagination hook",
      "paginate /api/users endpoint",
      "add pagination tests",
    ],
    stopReason: "end_turn",
    endReason: "",
    errorCount: 0,
    cost: 0.18,
    summary: "Added pagination to /api/users endpoint",
  },
  {
    id: "demo-data-pipeline-001",
    project: "data-pipeline",
    path: "/home/user/projects/data-pipeline",
    branch: "main",
    durationMin: 15,
    endAgo: 0.5 * h,      // ended 30min ago
    model: "claude-sonnet-4-6",
    inputTokens: 3500,
    outputTokens: 2000,
    cacheReadTokens: 1500,
    cacheCreationTokens: 0,
    filesEdited: [
      "src/pipeline/ingest.ts",
      "tests/ingest.test.ts",
    ],
    filesCreated: [],
    toolCalls: [
      { name: "Read", count: 6 }, { name: "Edit", count: 3 },
      { name: "Bash", count: 8 }, { name: "Grep", count: 2 },
    ],
    bashCommands: ["pytest", "python -m pytest tests/", "pytest -x"],
    gitCommits: [],
    stopReason: "end_turn",
    endReason: "rate_limit",
    errorCount: 3,
    cost: 0.05,
    summary: "FAILED: rate_limit error after 15min",
  },
];

const txn = db.transaction(() => {
  for (const s of sessions) {
    const endTime = now - s.endAgo;
    const startTime = endTime - s.durationMin * m;
    insert.run(
      s.id, s.project, s.path, s.branch,
      startTime, endTime, s.durationMin * m, s.model, s.project, "1.0.0",
      s.inputTokens, s.outputTokens, s.cacheReadTokens, s.cacheCreationTokens,
      0, 0, 0, "standard",
      JSON.stringify(s.filesEdited), JSON.stringify(s.filesCreated),
      JSON.stringify(s.toolCalls), JSON.stringify(s.bashCommands),
      JSON.stringify(s.gitCommits),
      0, 0, s.stopReason, s.endReason,
      s.errorCount, 0, s.cost, s.summary,
      "subscription", "cli", "external",
    );
  }
});

txn();

// Reset last_run so the digest shows "first run" or full window
db.prepare("DELETE FROM meta WHERE key = 'last_run'").run();

db.close();

console.log(`Seeded ${sessions.length} demo sessions into ${DB_PATH}`);
console.log("Sessions:");
for (const s of sessions) {
  const status = s.errorCount > 0 ? "FAILED" : "OK";
  console.log(`  ${status.padEnd(6)} ${s.project.padEnd(16)} ${s.durationMin}min  ${s.model}`);
}
console.log("\nRun 'claude-brief --since 24h' to verify.");
