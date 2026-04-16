import React from "react";
import { Box, Text } from "ink";
import { AggregateStats, formatTokens } from "../types.js";

interface StatsBarProps {
  stats: AggregateStats;
  timeRangeLabel: string;
}

export function StatsBar({ stats, timeRangeLabel }: StatsBarProps) {
  return (
    <Box borderStyle="single" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">claude-brief</Text>
      <Text dimColor>  {"\u00b7"}  </Text>
      <Text>{timeRangeLabel}</Text>
      <Text dimColor>  {"\u00b7"}  </Text>
      <Text color="green">${stats.totalCost.toFixed(2)} total</Text>
      <Text dimColor>  {"\u00b7"}  </Text>
      <Text>{formatTokens(stats.totalTokens)} tokens</Text>
      <Text dimColor>  {"\u00b7"}  </Text>
      <Text dimColor>q:quit  /:search</Text>
    </Box>
  );
}
