import React from "react";
import { Box, Text } from "ink";
import { AggregateStats, formatTokens, loadConfig } from "../types.js";

interface StatsBarProps {
  stats: AggregateStats;
  timeRangeLabel: string;
}

export function StatsBar({ stats, timeRangeLabel }: StatsBarProps) {
  const config = loadConfig();
  const showCost =
    config.billingMode === "api" ||
    (config.billingMode !== "subscription" && stats.billingMode === "api");

  const costDisplay = showCost
    ? `~$${stats.totalCost.toFixed(2)}`
    : formatTokens(stats.totalTokens) + " tokens";
  const costSecondary = showCost
    ? `(${formatTokens(stats.totalTokens)} tokens)`
    : `(API equiv: ~$${stats.totalCost.toFixed(2)})`;

  return (
    <Box borderStyle="single" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">claude-brief</Text>
      <Text dimColor>  {"\u00b7"}  </Text>
      <Text>{timeRangeLabel}</Text>
      <Text dimColor>  {"\u00b7"}  </Text>
      <Text color="green">{costDisplay}</Text>
      <Text dimColor>  {costSecondary}  </Text>
      <Text dimColor>  {"\u00b7"}  </Text>
      <Text dimColor>q:quit  /:search</Text>
    </Box>
  );
}
