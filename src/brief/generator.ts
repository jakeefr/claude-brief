import { parseAllSessions } from "../collector/parser.js";
import {
  getSessions,
  getLastRunTime,
  setLastRunTime,
  bulkUpsertSessions,
  getAggregateStats,
} from "../collector/store.js";
import { SessionSummary, AggregateStats, parseSince, formatTokens, loadConfig, getSubscriptionLabel } from "../types.js";

export interface DigestOptions {
  since?: string;       // e.g. "2h", "24h", "7d"
  project?: string;     // filter to project slug
  format?: "text" | "json" | "csv" | "markdown";
  refresh?: boolean;    // re-parse all JSONL files before generating
  apiRates?: boolean;   // force showing API rate costs
}

export interface DigestResult {
  sessions: SessionSummary[];
  stats: AggregateStats;
  sinceTime: Date;
  sinceLabel: string;
  lastRunTime: Date | null;
  apiRates?: boolean;   // pass through for formatter
}

/**
 * Generate a digest of agent activity.
 */
export function generateDigest(opts: DigestOptions = {}): DigestResult {
  // Determine lookback window
  const lastRun = getLastRunTime();
  let sinceMs: number;
  let sinceLabel: string;

  if (opts.since) {
    const delta = parseSince(opts.since);
    sinceMs = Date.now() - delta;
    sinceLabel = opts.since;
  } else if (lastRun) {
    sinceMs = lastRun;
    const agoMs = Date.now() - lastRun;
    sinceLabel = formatAgo(agoMs);
  } else {
    // First run — show last 24h
    sinceMs = Date.now() - 24 * 60 * 60 * 1000;
    sinceLabel = "24h (first run)";
  }

  // Refresh from JSONL files if requested or if DB is empty
  if (opts.refresh !== false) {
    refreshFromJSONL();
  }

  const sessions = getSessions({
    sinceMs,
    project: opts.project,
  });

  const stats = getAggregateStats(sinceMs);

  // Update last run time
  setLastRunTime(Date.now());

  return {
    sessions,
    stats,
    sinceTime: new Date(sinceMs),
    sinceLabel,
    lastRunTime: lastRun ? new Date(lastRun) : null,
    apiRates: opts.apiRates,
  };
}

/**
 * Re-parse all JSONL files and update the database.
 */
export function refreshFromJSONL(): number {
  const summaries = parseAllSessions();
  if (summaries.length > 0) {
    bulkUpsertSessions(summaries);
  }
  return summaries.length;
}

/**
 * Get a status one-liner.
 */
export function getStatusLine(): string {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todaySessions = getSessions({ sinceMs: todayStart.getTime() });
  const totalCost = todaySessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
  const totalTokens = todaySessions.reduce(
    (sum, s) => sum + s.inputTokens + s.outputTokens + s.cacheReadTokens, 0
  );
  const lastRun = getLastRunTime();

  const config = loadConfig();
  const allSubscription = todaySessions.every((s) => s.billingMode === "subscription");
  const showCost = config.billingMode === "api" || (!allSubscription && config.billingMode !== "subscription");

  const parts = [
    `${todaySessions.length} session${todaySessions.length !== 1 ? "s" : ""} today`,
  ];
  if (showCost) {
    parts.push(`~$${totalCost.toFixed(2)} cost (${formatTokens(totalTokens)} tokens)`);
  } else {
    parts.push(`${formatTokens(totalTokens)} tokens`);
  }

  if (lastRun) {
    parts.push(`last brief ${formatAgo(now - lastRun)} ago`);
  } else {
    parts.push("never briefed");
  }

  let statusLine = parts.join(" \u00b7 ");

  // Append billing context for subscription users
  const subLabel = getSubscriptionLabel();
  if (subLabel && !showCost) {
    statusLine += `\nBilling: ${subLabel} subscription`;
    statusLine += `\nOverage (if applicable) billed at API rates \u2014 use --api-rates to estimate`;
  }

  return statusLine;
}

function formatAgo(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMins = minutes % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
