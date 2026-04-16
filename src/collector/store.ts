import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionSummary, SessionRow, AggregateStats } from "../types.js";

const DB_DIR = path.join(os.homedir(), ".claude-brief");
const DB_PATH = path.join(DB_DIR, "db.sqlite");

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  ensureDir();
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
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

  // Migrate existing databases: add new columns if missing
  const cols = db.pragma("table_info(sessions)") as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("billing_mode")) {
    db.exec("ALTER TABLE sessions ADD COLUMN billing_mode TEXT DEFAULT 'subscription'");
  }
  if (!colNames.has("entrypoint")) {
    db.exec("ALTER TABLE sessions ADD COLUMN entrypoint TEXT DEFAULT 'cli'");
  }
  if (!colNames.has("user_type")) {
    db.exec("ALTER TABLE sessions ADD COLUMN user_type TEXT DEFAULT 'external'");
  }
}

export function upsertSession(summary: SessionSummary): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (
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

  stmt.run(
    summary.sessionId,
    summary.projectSlug,
    summary.projectPath,
    summary.gitBranch,
    summary.startTime.getTime(),
    summary.endTime.getTime(),
    summary.durationMs,
    summary.model,
    summary.slug,
    summary.claudeVersion,
    summary.inputTokens,
    summary.outputTokens,
    summary.cacheReadTokens,
    summary.cacheCreationTokens,
    summary.webSearchRequests,
    summary.webFetchRequests,
    summary.hasThinking ? 1 : 0,
    summary.speedMode,
    JSON.stringify(summary.filesEdited),
    JSON.stringify(summary.filesCreated),
    JSON.stringify(summary.toolCalls),
    JSON.stringify(summary.bashCommands),
    JSON.stringify(summary.gitCommits),
    summary.mcpToolCalls,
    summary.subagentSpawns,
    summary.stopReason,
    summary.endReason,
    summary.errorCount,
    summary.compactionCount,
    summary.estimatedCostUsd,
    summary.lastAssistantMessage,
    summary.billingMode,
    summary.entrypoint,
    summary.userType
  );
}

export function bulkUpsertSessions(summaries: SessionSummary[]): void {
  const db = getDb();
  const txn = db.transaction(() => {
    for (const s of summaries) {
      upsertSession(s);
    }
  });
  txn();
}

function rowToSummary(row: SessionRow): SessionSummary {
  return {
    sessionId: row.session_id,
    projectSlug: row.project_slug,
    projectPath: row.project_path,
    gitBranch: row.git_branch || "HEAD",
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    durationMs: row.duration_ms,
    model: row.model,
    slug: row.slug || "",
    claudeVersion: row.claude_version || "",
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheCreationTokens: row.cache_creation_tokens,
    webSearchRequests: row.web_search_requests,
    webFetchRequests: row.web_fetch_requests,
    hasThinking: row.has_thinking === 1,
    speedMode: (row.speed_mode || "standard") as "standard" | "fast",
    filesEdited: safeParseArray(row.files_edited),
    filesCreated: safeParseArray(row.files_created),
    toolCalls: safeParseArray(row.tool_calls),
    bashCommands: safeParseArray(row.bash_commands),
    gitCommits: safeParseArray(row.git_commits),
    mcpToolCalls: row.mcp_tool_calls,
    subagentSpawns: row.subagent_spawns,
    stopReason: row.stop_reason || "",
    endReason: row.end_reason || "",
    errorCount: row.error_count,
    compactionCount: row.compaction_count,
    estimatedCostUsd: row.estimated_cost_usd,
    lastAssistantMessage: row.last_assistant_message || "",
    billingMode: (row.billing_mode || "subscription") as "api" | "subscription",
    entrypoint: row.entrypoint || "cli",
    userType: row.user_type || "external",
  };
}

function safeParseArray(json: string | null): any[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export function getSessions(opts: {
  sinceMs?: number;
  project?: string;
  limit?: number;
}): SessionSummary[] {
  const db = getDb();
  let sql = "SELECT * FROM sessions WHERE 1=1";
  const params: any[] = [];

  if (opts.sinceMs) {
    sql += " AND start_time >= ?";
    params.push(opts.sinceMs);
  }

  if (opts.project) {
    sql += " AND project_slug LIKE ?";
    params.push(`%${opts.project}%`);
  }

  sql += " ORDER BY start_time DESC";

  if (opts.limit) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }

  const rows = db.prepare(sql).all(...params) as SessionRow[];
  return rows.map(rowToSummary);
}

export function getSession(sessionId: string): SessionSummary | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(sessionId) as SessionRow | undefined;
  return row ? rowToSummary(row) : null;
}

export function getAggregateStats(sinceMs?: number): AggregateStats {
  const sessions = getSessions({ sinceMs });

  const projectMap = new Map<string, { sessions: number; cost: number }>();
  const modelMap = new Map<string, number>();
  const fileEditCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let successCount = 0;
  let totalDuration = 0;
  let apiCount = 0;
  let subCount = 0;

  for (const s of sessions) {
    if (s.billingMode === "api") apiCount++;
    else subCount++;
    totalCost += s.estimatedCostUsd;
    totalInput += s.inputTokens;
    totalOutput += s.outputTokens;
    totalCacheRead += s.cacheReadTokens;
    totalCacheCreation += s.cacheCreationTokens;
    totalDuration += s.durationMs;

    if (s.errorCount === 0 && s.stopReason !== "max_tokens") {
      successCount++;
    }

    const proj = projectMap.get(s.projectSlug) || { sessions: 0, cost: 0 };
    proj.sessions++;
    proj.cost += s.estimatedCostUsd;
    projectMap.set(s.projectSlug, proj);

    modelMap.set(s.model, (modelMap.get(s.model) || 0) + 1);

    for (const f of s.filesEdited) {
      fileEditCounts.set(f, (fileEditCounts.get(f) || 0) + 1);
    }

    for (const tc of s.toolCalls) {
      toolCounts.set(tc.name, (toolCounts.get(tc.name) || 0) + tc.count);
    }
  }

  return {
    totalSessions: sessions.length,
    totalCost,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheReadTokens: totalCacheRead,
    totalCacheCreationTokens: totalCacheCreation,
    totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheCreation,
    activeProjects: projectMap.size,
    projectBreakdown: Array.from(projectMap.entries())
      .map(([project, data]) => ({ project, ...data }))
      .sort((a, b) => b.cost - a.cost),
    modelMix: Array.from(modelMap.entries())
      .map(([model, count]) => ({
        model,
        count,
        percentage: sessions.length > 0 ? (count / sessions.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count),
    mostEditedFiles: Array.from(fileEditCounts.entries())
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    mostCommonTools: Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    successRate: sessions.length > 0 ? (successCount / sessions.length) * 100 : 100,
    avgDurationMs: sessions.length > 0 ? totalDuration / sessions.length : 0,
    billingMode: apiCount > 0 && subCount > 0 ? "mixed"
      : apiCount > 0 ? "api"
      : "subscription",
  };
}

export function getLastRunTime(): number | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = 'last_run'").get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : null;
}

export function setLastRunTime(timeMs: number): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_run', ?)").run(String(timeMs));
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
