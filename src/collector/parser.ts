import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  SessionSummary,
  AssistantLine,
  UserLine,
  ContentBlock,
  calculateCost,
  determineBillingMode,
} from "../types.js";

/**
 * Parse a JSONL session file and produce a SessionSummary.
 */
export function parseSessionFile(filePath: string, projectSlug: string): SessionSummary | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  let sessionId = "";
  let projectPath = "";
  let gitBranch = "";
  let slug = "";
  let claudeVersion = "";
  const timestamps: number[] = [];
  const modelCounts = new Map<string, number>();
  const speedCounts = new Map<string, number>();

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let webSearchRequests = 0;
  let webFetchRequests = 0;
  let hasThinking = false;

  const filesEditedSet = new Set<string>();
  const filesCreatedSet = new Set<string>();
  const toolCallCounts = new Map<string, number>();
  const bashCommands: string[] = [];
  const gitCommits: string[] = [];
  let mcpToolCalls = 0;
  let subagentSpawns = 0;

  let lastStopReason = "";
  let errorCount = 0;
  let compactionCount = 0;
  let lastAssistantMessage = "";
  let entrypoint = "";
  let userType = "";

  // Deduplicate assistant messages — compaction re-writes messages into the
  // JSONL, so the same message.id can appear multiple times. Counting every
  // occurrence inflates token totals (and therefore cost estimates).
  const seenMessageIds = new Set<string>();

  for (const line of lines) {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // Compaction detection
    if (parsed.type === "attachment") {
      const contentStr = JSON.stringify(parsed.content || parsed);
      if (contentStr.includes("compact_boundary")) {
        compactionCount++;
      }
      continue;
    }

    if (parsed.timestamp) {
      const ts = new Date(parsed.timestamp).getTime();
      if (!isNaN(ts)) timestamps.push(ts);
    }

    if (parsed.sessionId && !sessionId) sessionId = parsed.sessionId;
    if (parsed.cwd && !projectPath) projectPath = parsed.cwd;
    if (parsed.gitBranch) gitBranch = parsed.gitBranch;
    if (parsed.slug && !slug) slug = parsed.slug;
    if (parsed.version && !claudeVersion) claudeVersion = parsed.version;
    if (parsed.entrypoint && !entrypoint) entrypoint = parsed.entrypoint;
    if (parsed.userType && !userType) userType = parsed.userType;

    if (parsed.type === "assistant" && parsed.message) {
      const msg = parsed.message as AssistantLine["message"];

      // Skip duplicate messages (same message.id seen before due to compaction replay)
      const msgId = msg.id;
      if (msgId && seenMessageIds.has(msgId)) continue;
      if (msgId) seenMessageIds.add(msgId);

      const model = msg.model || "";

      if (model) {
        modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
      }

      // Usage
      if (msg.usage) {
        inputTokens += msg.usage.input_tokens || 0;
        outputTokens += msg.usage.output_tokens || 0;
        cacheReadTokens += msg.usage.cache_read_input_tokens || 0;
        cacheCreationTokens += msg.usage.cache_creation_input_tokens || 0;

        if (msg.usage.server_tool_use) {
          webSearchRequests += msg.usage.server_tool_use.web_search_requests || 0;
          webFetchRequests += msg.usage.server_tool_use.web_fetch_requests || 0;
        }

        const speed = msg.usage.speed || "standard";
        speedCounts.set(speed, (speedCounts.get(speed) || 0) + 1);
      }

      // Content blocks
      if (Array.isArray(msg.content)) {
        let lastText = "";
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === "thinking") {
            hasThinking = true;
          }

          if (block.type === "text" && "text" in block) {
            lastText = block.text;
          }

          if (block.type === "tool_use" && "name" in block) {
            const toolName = block.name;
            toolCallCounts.set(toolName, (toolCallCounts.get(toolName) || 0) + 1);

            if (toolName.startsWith("mcp__")) {
              mcpToolCalls++;
            }

            if (toolName === "Agent") {
              subagentSpawns++;
            }

            const input = (block as any).input || {};

            // Track file edits
            if (toolName === "Edit" || toolName === "Write") {
              const fp = input.file_path || input.path || "";
              if (fp) {
                filesEditedSet.add(fp);
                if (toolName === "Write") {
                  filesCreatedSet.add(fp);
                }
              }
            }

            // Track bash commands
            if (toolName === "Bash" && input.command) {
              const cmd = String(input.command).slice(0, 100);
              bashCommands.push(cmd);

              // Detect git commits
              if (cmd.includes("git commit")) {
                const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
                if (msgMatch) {
                  gitCommits.push(msgMatch[1]);
                } else {
                  gitCommits.push("(commit message not parsed)");
                }
              }
            }
          }

          // Error detection from tool results
          if (block.type === "tool_result" && "is_error" in block && block.is_error) {
            errorCount++;
          }
        }

        if (lastText) {
          lastAssistantMessage = lastText;
        }
      }

      if (msg.stop_reason) {
        lastStopReason = msg.stop_reason;
      }
    }
  }

  if (timestamps.length === 0 || !sessionId) return null;

  const startTime = new Date(Math.min(...timestamps));
  const endTime = new Date(Math.max(...timestamps));
  const durationMs = endTime.getTime() - startTime.getTime();

  // Most common model
  let model = "unknown";
  let maxModelCount = 0;
  for (const [m, c] of modelCounts) {
    if (c > maxModelCount) {
      model = m;
      maxModelCount = c;
    }
  }

  // Most common speed mode
  let speedMode: "standard" | "fast" = "standard";
  let maxSpeedCount = 0;
  for (const [s, c] of speedCounts) {
    if (c > maxSpeedCount) {
      speedMode = s as "standard" | "fast";
      maxSpeedCount = c;
    }
  }

  // Build tool calls array sorted by count
  const toolCalls = Array.from(toolCallCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Calculate cost
  const { cost } = calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

  // Truncate and sanitize last assistant message
  let sanitizedMessage = lastAssistantMessage
    .replace(/<private>[\s\S]*?<\/private>/g, "")
    .slice(0, 500);

  return {
    sessionId,
    projectSlug,
    projectPath,
    gitBranch: gitBranch || "HEAD",
    startTime,
    endTime,
    durationMs,
    model,
    slug,
    claudeVersion,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    webSearchRequests,
    webFetchRequests,
    hasThinking,
    speedMode,
    filesEdited: Array.from(filesEditedSet),
    filesCreated: Array.from(filesCreatedSet),
    toolCalls,
    bashCommands,
    gitCommits,
    mcpToolCalls,
    subagentSpawns,
    stopReason: lastStopReason,
    endReason: "",
    errorCount,
    compactionCount,
    estimatedCostUsd: cost,
    lastAssistantMessage: sanitizedMessage,
    billingMode: determineBillingMode(userType),
    entrypoint: entrypoint || "cli",
    userType: userType || "external",
  };
}

/**
 * Discover all JSONL session files under ~/.claude/projects/
 */
export function discoverSessionFiles(): Array<{ filePath: string; projectSlug: string }> {
  const claudeDir = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(claudeDir)) return [];

  const results: Array<{ filePath: string; projectSlug: string }> = [];

  try {
    const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true });
    for (const entry of projectDirs) {
      if (!entry.isDirectory()) continue;
      const projectSlug = entry.name;
      const projectDir = path.join(claudeDir, projectSlug);

      try {
        const files = fs.readdirSync(projectDir);
        for (const file of files) {
          if (file.endsWith(".jsonl")) {
            results.push({
              filePath: path.join(projectDir, file),
              projectSlug,
            });
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // No projects directory
  }

  return results;
}

/**
 * Parse all discoverable sessions, deduplicating by session ID.
 */
export function parseAllSessions(): SessionSummary[] {
  const files = discoverSessionFiles();
  const sessionsById = new Map<string, SessionSummary>();

  for (const { filePath, projectSlug } of files) {
    const summary = parseSessionFile(filePath, projectSlug);
    if (!summary) continue;

    const existing = sessionsById.get(summary.sessionId);
    if (existing) {
      // Keep the one with more data (later end time = more complete)
      if (summary.endTime > existing.endTime) {
        sessionsById.set(summary.sessionId, summary);
      }
    } else {
      sessionsById.set(summary.sessionId, summary);
    }
  }

  return Array.from(sessionsById.values()).sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime()
  );
}

/**
 * Parse a single session file by transcript path (used by hook handler).
 */
export function parseTranscript(transcriptPath: string): SessionSummary | null {
  // Extract project slug from path
  // Path format: ~/.claude/projects/{PROJECT_SLUG}/{SESSION_UUID}.jsonl
  const parts = transcriptPath.replace(/\\/g, "/").split("/");
  const jsonlIdx = parts.findIndex((p) => p.endsWith(".jsonl"));
  const projectSlug = jsonlIdx > 0 ? parts[jsonlIdx - 1] : "unknown";

  return parseSessionFile(transcriptPath, projectSlug);
}
