import React from "react";
import { Box, Text } from "ink";
import { SessionSummary, shortModelName, formatDuration, formatTokens, formatCost, MODEL_PRICING } from "../types.js";
import { HorizontalBar } from "./Charts.js";

interface SessionDetailProps {
  session: SessionSummary | null;
  focused: boolean;
}

export function SessionDetail({ session, focused }: SessionDetailProps) {
  if (!session) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" flexGrow={1} paddingX={1}>
        <Text dimColor>No session selected</Text>
      </Box>
    );
  }

  const s = session;
  const isEstimate = !MODEL_PRICING[s.model];
  const costStr = formatCost(s.estimatedCostUsd, isEstimate);
  const cacheHitRate = s.inputTokens + s.cacheReadTokens > 0
    ? ((s.cacheReadTokens / (s.inputTokens + s.cacheReadTokens)) * 100).toFixed(0)
    : "0";

  const maxToolCount = Math.max(...s.toolCalls.map((t) => t.count), 1);
  const topTools = s.toolCalls.slice(0, 6);

  const filesToShow = s.filesEdited.slice(0, 10);
  const moreFiles = s.filesEdited.length - 10;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={focused ? "magenta" : "gray"} flexGrow={1} paddingX={1}>
      {/* Header */}
      <Box>
        <Text bold color="white">{s.projectSlug}</Text>
        <Text dimColor> {"\u00b7"} {formatDuration(s.durationMs)} {"\u00b7"} {costStr}</Text>
      </Box>
      <Text dimColor>{"\u2500".repeat(40)}</Text>

      {/* Metadata */}
      <Text>Model: <Text color="cyan">{s.model}</Text></Text>
      <Text>Branch: <Text color="yellow">{s.gitBranch}</Text>
        {s.gitCommits.length > 0 && <Text dimColor> {"\u00b7"} {s.gitCommits.length} commits</Text>}
      </Text>
      <Text>Files: <Text color="green">{s.filesEdited.length} edited</Text>, <Text color="blue">{s.filesCreated.length} created</Text></Text>
      <Text>Tokens: {formatTokens(s.inputTokens)} in {"\u00b7"} {formatTokens(s.outputTokens)} out {"\u00b7"} {costStr}</Text>
      <Text>Cache: <Text color="magenta">{cacheHitRate}% hit rate</Text></Text>
      <Text>Thinking: {s.hasThinking ? <Text color="yellow">yes (extended reasoning)</Text> : <Text dimColor>no</Text>}</Text>
      {s.mcpToolCalls > 0 && <Text>MCP calls: {s.mcpToolCalls}</Text>}
      {s.subagentSpawns > 0 && <Text>Subagents: {s.subagentSpawns}</Text>}
      {s.webSearchRequests > 0 && <Text>Web searches: {s.webSearchRequests}</Text>}
      {s.compactionCount > 0 && <Text>Compactions: {s.compactionCount}</Text>}

      {/* Tool usage bars */}
      {topTools.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Tools used:</Text>
          {topTools.map((t, i) => (
            <HorizontalBar
              key={i}
              label={t.name}
              value={t.count}
              max={maxToolCount}
              color="magenta"
              width={16}
            />
          ))}
        </Box>
      )}

      {/* Files changed */}
      {filesToShow.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Files changed:</Text>
          {filesToShow.map((f, i) => (
            <Text key={i} dimColor>  {f.split(/[/\\]/).pop()}</Text>
          ))}
          {moreFiles > 0 && <Text dimColor>  (+{moreFiles} more)</Text>}
        </Box>
      )}

      {/* Summary */}
      {s.lastAssistantMessage && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Summary:</Text>
          <Text wrap="wrap">{s.lastAssistantMessage.slice(0, 200)}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>[{"\u2191\u2193"}] navigate  [enter] expand  [/] search</Text>
      </Box>
    </Box>
  );
}
