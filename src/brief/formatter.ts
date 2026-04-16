import {
  SessionSummary,
  shortModelName,
  formatDuration,
  formatTokens,
  formatCost,
  MODEL_PRICING,
  BillingDisplayMode,
  loadConfig,
} from "../types.js";
import { DigestResult } from "./generator.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const PURPLE = "\x1b[35m";

/**
 * Resolve effective billing display: "auto" reads from data, config/flag overrides.
 */
function resolveShowCost(result: DigestResult): boolean {
  // --api-rates flag takes precedence
  if (result.apiRates) return true;
  const config = loadConfig();
  if (config.billingMode === "api") return true;
  if (config.billingMode === "subscription") return false;
  // auto: show dollar cost only if sessions are API-billed
  return result.stats.billingMode === "api";
}

/**
 * Format a full digest for terminal output.
 */
export function formatDigest(result: DigestResult): string {
  const { sessions, stats, sinceLabel } = result;
  const showCost = resolveShowCost(result);
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(`${BOLD}${PURPLE}claude-brief${RESET}  ${DIM}\u00b7${RESET}  since ${sinceLabel} ago`);
  lines.push(`${DIM}\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550${RESET}`);

  if (sessions.length === 0) {
    lines.push("");
    lines.push("  No agent activity since then.");
    if (result.lastRunTime) {
      lines.push(`  Last session was ${formatAgoFromDate(result.lastRunTime)}.`);
    }
    lines.push("");
    return lines.join("\n");
  }

  // Summary stats line — subscription vs API display
  const totalTokens = formatTokens(stats.totalTokens);
  const sessionCount = `${BOLD}${stats.totalSessions} session${stats.totalSessions !== 1 ? "s" : ""}${RESET}`;
  const projectCount = `${stats.activeProjects} project${stats.activeProjects !== 1 ? "s" : ""}`;
  lines.push("");
  if (showCost) {
    lines.push(
      `  ${sessionCount}  \u00b7  ${projectCount}  \u00b7  ~$${stats.totalCost.toFixed(2)}  ${DIM}(${totalTokens} tokens)${RESET}`
    );
  } else {
    lines.push(
      `  ${sessionCount}  \u00b7  ${projectCount}  \u00b7  ${totalTokens} tokens  ${DIM}(API equiv: ~$${stats.totalCost.toFixed(2)})${RESET}`
    );
  }

  lines.push("");
  lines.push(`${DIM}\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${RESET}`);
  lines.push("");

  // Session lines
  const failedSessions: SessionSummary[] = [];
  for (const s of sessions) {
    const isFailed = s.errorCount > 0 || s.stopReason === "max_tokens";
    const statusIcon = isFailed ? `${RED}\u2717${RESET}` : `${GREEN}\u2713${RESET}`;
    const model = shortModelName(s.model);
    const dur = formatDuration(s.durationMs);
    const fileCount = s.filesEdited.length;
    const projectName = truncate(s.projectSlug, 16);
    const sessionTokens = formatTokens(s.inputTokens + s.outputTokens + s.cacheReadTokens);

    const costStr = formatCost(s.estimatedCostUsd, !MODEL_PRICING[s.model]);
    let usageStr: string;
    if (showCost) {
      usageStr = `${costStr}  ${DIM}(${sessionTokens})${RESET}`;
    } else {
      usageStr = `${sessionTokens}  ${DIM}(${costStr})${RESET}`;
    }
    const line = `  ${statusIcon}  ${padRight(projectName, 16)} ${padRight(dur, 7)} \u00b7  ${fileCount} file${fileCount !== 1 ? "s" : ""}  \u00b7  ${model}  \u00b7  ${usageStr}`;
    lines.push(line);

    // Summary or error info
    if (isFailed) {
      const reason = s.endReason || s.stopReason || "unknown error";
      lines.push(`     ${RED}FAILED: ${reason} after ${dur}${RESET}`);
      const lastAction = s.bashCommands.length > 0 ? s.bashCommands[s.bashCommands.length - 1] : null;
      if (lastAction) {
        lines.push(`     Last action: ${truncate(lastAction, 50)}`);
      }
      failedSessions.push(s);
    } else {
      const summary = getSummaryLine(s);
      if (summary) {
        lines.push(`     ${summary}`);
      }
    }

    // Git info
    const commitCount = s.gitCommits.length;
    if (commitCount > 0 || (s.gitBranch && s.gitBranch !== "HEAD")) {
      const parts: string[] = [];
      if (commitCount > 0) parts.push(`${commitCount} commit${commitCount !== 1 ? "s" : ""}`);
      if (s.gitBranch && s.gitBranch !== "HEAD") parts.push(s.gitBranch);
      lines.push(`     ${DIM}${parts.join("  \u00b7  ")}${RESET}`);
    }

    lines.push("");
  }

  lines.push(`${DIM}\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${RESET}`);

  // Pending attention section
  if (failedSessions.length > 0) {
    lines.push("");
    lines.push(`  ${YELLOW}\u26a0  Pending attention:${RESET}`);
    for (const s of failedSessions) {
      const reason = s.endReason || s.stopReason || "session failed";
      lines.push(`     \u2022 ${s.projectSlug}: ${reason}`);
    }
    lines.push("");
    lines.push(`${DIM}\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${RESET}`);
  }

  // Footer
  lines.push("");
  lines.push(`  ${DIM}Run 'claude-brief tui' to explore history  \u00b7  'claude-brief dashboard' for web view${RESET}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Format digest as JSON.
 */
export function formatJSON(result: DigestResult): string {
  return JSON.stringify(
    {
      since: result.sinceTime.toISOString(),
      sinceLabel: result.sinceLabel,
      stats: result.stats,
      sessions: result.sessions.map((s) => ({
        ...s,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
      })),
    },
    null,
    2
  );
}

/**
 * Format digest as CSV.
 */
export function formatCSV(result: DigestResult): string {
  const headers = [
    "session_id", "project", "model", "start_time", "end_time", "duration_min",
    "files_edited", "files_created", "commits", "input_tokens", "output_tokens",
    "cache_read_tokens", "estimated_cost_usd", "error_count", "stop_reason",
  ];
  const rows = result.sessions.map((s) =>
    [
      s.sessionId,
      s.projectSlug,
      s.model,
      s.startTime.toISOString(),
      s.endTime.toISOString(),
      Math.round(s.durationMs / 60000),
      s.filesEdited.length,
      s.filesCreated.length,
      s.gitCommits.length,
      s.inputTokens,
      s.outputTokens,
      s.cacheReadTokens,
      s.estimatedCostUsd.toFixed(4),
      s.errorCount,
      s.stopReason,
    ].join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

/**
 * Format digest for Slack/Discord markdown.
 */
export function formatMarkdown(result: DigestResult): string {
  const { sessions, stats, sinceLabel } = result;
  const lines: string[] = [];

  lines.push(`**claude-brief** -- since ${sinceLabel} ago`);
  lines.push("");

  if (sessions.length === 0) {
    lines.push("No agent activity.");
    return lines.join("\n");
  }

  lines.push(`${stats.totalSessions} sessions | ${stats.activeProjects} projects | ~$${stats.totalCost.toFixed(2)} | ${formatTokens(stats.totalTokens)} tokens`);
  lines.push("");

  for (const s of sessions) {
    const isFailed = s.errorCount > 0 || s.stopReason === "max_tokens";
    const icon = isFailed ? "\u274c" : "\u2705";
    const model = shortModelName(s.model);
    const dur = formatDuration(s.durationMs);
    const summary = getSummaryLine(s) || (isFailed ? "Failed" : "Completed");
    lines.push(`${icon} **${s.projectSlug}** ${dur} | ${s.filesEdited.length} files | ${model} | $${s.estimatedCostUsd.toFixed(2)}`);
    lines.push(`> ${summary}`);
    lines.push("");
  }

  return lines.join("\n");
}

function getSummaryLine(s: SessionSummary): string {
  if (!s.lastAssistantMessage) return "";
  // Take first line of last assistant message
  const firstLine = s.lastAssistantMessage.split("\n")[0].trim();
  return truncate(firstLine, 70);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function formatAgoFromDate(date: Date): string {
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
