// Shared TypeScript types for claude-brief

export interface AssistantLine {
  type: "assistant";
  uuid: string;
  parentUuid: string | null;
  isSidechain: boolean;
  requestId: string;
  message: {
    model: string;
    id: string;
    role: "assistant";
    content: Array<ContentBlock>;
    stop_reason: "tool_use" | "end_turn" | "max_tokens";
    usage: UsageData;
  };
  timestamp: string;
  slug: string;
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch: string;
}

export interface UserLine {
  type: "user";
  uuid: string;
  parentUuid: string | null;
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  };
  timestamp: string;
  sessionId: string;
  cwd?: string;
  slug?: string;
  version?: string;
  gitBranch?: string;
}

export type ContentBlock =
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, any> }
  | { type: "tool_result"; tool_use_id: string; content: any; is_error?: boolean };

export interface UsageData {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  server_tool_use?: {
    web_search_requests: number;
    web_fetch_requests: number;
  };
  service_tier?: string;
  cache_creation?: {
    ephemeral_1h_input_tokens: number;
    ephemeral_5m_input_tokens: number;
  };
  speed?: "standard" | "fast";
  iterations?: Array<{
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  }>;
}

export interface SessionSummary {
  sessionId: string;
  projectSlug: string;
  projectPath: string;
  gitBranch: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  model: string;
  slug: string;
  claudeVersion: string;

  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  webSearchRequests: number;
  webFetchRequests: number;
  hasThinking: boolean;
  speedMode: "standard" | "fast";

  filesEdited: string[];
  filesCreated: string[];
  toolCalls: Array<{ name: string; count: number }>;
  bashCommands: string[];
  gitCommits: string[];
  mcpToolCalls: number;
  subagentSpawns: number;

  stopReason: string;
  endReason: string;
  errorCount: number;
  compactionCount: number;

  estimatedCostUsd: number;
  lastAssistantMessage: string;

  // Billing context — detected from JSONL fields + credentials.json
  billingMode: "subscription" | "api";
  entrypoint: string;                   // "cli", "claude-desktop", "claude-vscode", etc.
  userType: string;                     // "external" (subscription), "api", "internal"
}

export interface SessionRow {
  session_id: string;
  project_slug: string;
  project_path: string;
  git_branch: string | null;
  start_time: number;
  end_time: number;
  duration_ms: number;
  model: string;
  slug: string | null;
  claude_version: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  web_search_requests: number;
  web_fetch_requests: number;
  has_thinking: number;
  speed_mode: string;
  files_edited: string | null;
  files_created: string | null;
  tool_calls: string | null;
  bash_commands: string | null;
  git_commits: string | null;
  mcp_tool_calls: number;
  subagent_spawns: number;
  stop_reason: string | null;
  end_reason: string | null;
  error_count: number;
  compaction_count: number;
  estimated_cost_usd: number;
  last_assistant_message: string | null;
  billing_mode: string | null;
  entrypoint: string | null;
  user_type: string | null;
  created_at: number;
}

export type BillingDisplayMode = "auto" | "api" | "subscription";

export interface AggregateStats {
  totalSessions: number;
  totalCost: number;
  billingMode: "api" | "subscription" | "mixed";
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalTokens: number;
  activeProjects: number;
  projectBreakdown: Array<{ project: string; sessions: number; cost: number }>;
  modelMix: Array<{ model: string; count: number; percentage: number }>;
  mostEditedFiles: Array<{ file: string; count: number }>;
  mostCommonTools: Array<{ name: string; count: number }>;
  successRate: number;
  avgDurationMs: number;
}

export interface TriggerFile {
  transcriptPath: string;
  sessionId: string;
  timestamp: string;
}

export const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-4-6":   { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  "claude-sonnet-4-6": { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75  },
  "claude-haiku-4-5":  { input: 0.80,  output: 4.00,  cacheRead: 0.08,  cacheWrite: 1.00  },
};

export const DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-6"];

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): { cost: number; isEstimate: boolean } {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  const isEstimate = !MODEL_PRICING[model];
  const cost =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheReadTokens / 1_000_000) * pricing.cacheRead +
    (cacheCreationTokens / 1_000_000) * pricing.cacheWrite;
  return { cost, isEstimate };
}

export function shortModelName(model: string): string {
  if (model.includes("opus")) return "opus";
  if (model.includes("haiku")) return "haiku";
  if (model.includes("sonnet")) return "sonnet";
  return model.split("-").pop() || model;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "<1min";
  if (totalMinutes < 60) return `${totalMinutes}min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1000) return `${Math.round(count / 1000)}k`;
  return String(count);
}

export function formatCost(cost: number, isEstimate = false): string {
  const prefix = isEstimate ? "~" : "";
  return `${prefix}$${cost.toFixed(2)}`;
}

export function parseSince(since: string): number {
  const match = since.match(/^(\d+)\s*(m|min|h|hr|d|day|w|week)s?$/i);
  if (!match) return 2 * 60 * 60 * 1000; // default 2h
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "m": case "min": return value * 60 * 1000;
    case "h": case "hr": return value * 60 * 60 * 1000;
    case "d": case "day": return value * 24 * 60 * 60 * 1000;
    case "w": case "week": return value * 7 * 24 * 60 * 60 * 1000;
    default: return value * 60 * 60 * 1000;
  }
}

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---- Subscription detection from credentials.json ----

export interface CredentialsInfo {
  subscriptionType: string | null;  // "max", "pro", "team", etc. or null
  rateLimitTier: string | null;
}

let _credentialsCache: CredentialsInfo | undefined;

/**
 * Read ~/.claude/.credentials.json and extract subscription info.
 * Cached after first read since it won't change mid-session.
 */
export function readCredentials(): CredentialsInfo {
  if (_credentialsCache) return _credentialsCache;

  const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    if (fs.existsSync(credPath)) {
      const raw = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      const oauth = raw.claudeAiOauth || {};
      _credentialsCache = {
        subscriptionType: oauth.subscriptionType || null,
        rateLimitTier: oauth.rateLimitTier || null,
      };
      return _credentialsCache;
    }
  } catch { /* fall through */ }

  _credentialsCache = { subscriptionType: null, rateLimitTier: null };
  return _credentialsCache;
}

/**
 * Determine billing mode.
 *
 * Primary signal: ~/.claude/.credentials.json → subscriptionType field.
 *   - Present and non-empty → "subscription" (Pro/Max/Team)
 *   - Absent or empty → check JSONL userType
 *
 * Secondary signal: JSONL userType field.
 *   - "api" → "api"
 *   - "external" with no credentials → "api" (API key user)
 *   - "external" with credentials → "subscription"
 */
export function determineBillingMode(userType: string): "subscription" | "api" {
  const creds = readCredentials();
  if (creds.subscriptionType) return "subscription";
  if (userType === "api") return "api";
  // No credentials file + external userType → likely API key
  return "api";
}

const TIER_DISPLAY: Record<string, string> = {
  "default_claude_max_5x":  "Max 5x ($100/mo)",
  "default_claude_max_20x": "Max 20x ($200/mo)",
  "default":                "Pro ($20/mo)",
  "team":                   "Team",
  "enterprise":             "Enterprise",
};

/**
 * Human-readable subscription + tier label for status output.
 * Returns null if the user has no subscription credentials.
 */
export function getSubscriptionLabel(): string | null {
  const creds = readCredentials();
  if (!creds.subscriptionType) return null;

  const tier = creds.rateLimitTier;
  if (tier && TIER_DISPLAY[tier]) return TIER_DISPLAY[tier];
  if (tier) return tier; // fallback: show raw value
  // No tier info — fall back to subscription type
  const sub = creds.subscriptionType;
  return sub.charAt(0).toUpperCase() + sub.slice(1);
}

// ---- Config persistence ----

const CONFIG_PATH = path.join(os.homedir(), ".claude-brief", "config.json");

export interface BriefConfig {
  billingMode: BillingDisplayMode;
  slackWebhook?: string;
  telegramToken?: string;
  telegramChatId?: string;
  ntfyTopic?: string;
  discordWebhook?: string;
  schedule?: string;
}

const DEFAULT_CONFIG: BriefConfig = { billingMode: "auto" };

export function loadConfig(): BriefConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) };
    }
  } catch { /* fall through */ }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: BriefConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  const keyMap: Record<string, keyof BriefConfig> = {
    "billing-mode": "billingMode",
    "slack-webhook": "slackWebhook",
    "telegram-token": "telegramToken",
    "telegram-chat-id": "telegramChatId",
    "ntfy-topic": "ntfyTopic",
    "discord-webhook": "discordWebhook",
    "schedule": "schedule",
  };
  const mapped = keyMap[key];
  if (!mapped) {
    throw new Error(`Unknown config key: ${key}. Valid keys: ${Object.keys(keyMap).join(", ")}`);
  }
  (config as any)[mapped] = value;
  saveConfig(config);
}
