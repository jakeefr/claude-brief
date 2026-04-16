import React from "react";
import { Box, Text, useInput } from "ink";
import { SessionSummary, shortModelName, formatDuration } from "../types.js";

interface SessionListProps {
  sessions: SessionSummary[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  focused: boolean;
  height: number;
}

export function SessionList({ sessions, selectedIndex, onSelect, focused, height }: SessionListProps) {
  const visibleCount = Math.max(height - 4, 5);
  const scrollOffset = Math.max(0, Math.min(selectedIndex - Math.floor(visibleCount / 2), sessions.length - visibleCount));
  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + visibleCount);

  useInput(
    (input, key) => {
      if (!focused) return;

      if (key.upArrow) {
        onSelect(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        onSelect(Math.min(sessions.length - 1, selectedIndex + 1));
      }
    },
    { isActive: focused }
  );

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={focused ? "magenta" : "gray"} width={30}>
      <Box paddingX={1}>
        <Text bold>Sessions ({sessions.length})</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {visibleSessions.map((s, i) => {
          const realIndex = scrollOffset + i;
          const isSelected = realIndex === selectedIndex;
          const isFailed = s.errorCount > 0 || s.stopReason === "max_tokens";
          const dur = formatDuration(s.durationMs);
          const projectName = s.projectSlug.length > 12 ? s.projectSlug.slice(0, 12) + ".." : s.projectSlug;

          return (
            <Box key={s.sessionId}>
              <Text color={isSelected ? "magenta" : undefined} bold={isSelected}>
                {isSelected ? "\u25b6 " : "  "}
              </Text>
              <Text color={isSelected ? "white" : "gray"} bold={isSelected}>
                {projectName.padEnd(14)}
              </Text>
              <Text dimColor>{dur.padEnd(5)} </Text>
              {isFailed ? (
                <Text color="red">{"\u2717"}</Text>
              ) : (
                <Text color="green">{"\u2713"}</Text>
              )}
            </Box>
          );
        })}
      </Box>
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>Cost today: ${sessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0).toFixed(2)}</Text>
      </Box>
    </Box>
  );
}
