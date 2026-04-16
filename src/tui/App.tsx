import React, { useState, useEffect } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { getSessions, getAggregateStats } from "../collector/store.js";
import { refreshFromJSONL } from "../brief/generator.js";
import { SessionSummary, AggregateStats, parseSince } from "../types.js";
import { StatsBar } from "./StatsBar.js";
import { SessionList } from "./SessionList.js";
import { SessionDetail } from "./SessionDetail.js";

const TIME_RANGES = [
  { key: "1", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "2", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "3", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

function App() {
  const { exit } = useApp();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusPanel, setFocusPanel] = useState<"list" | "detail">("list");
  const [timeRangeIdx, setTimeRangeIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const currentRange = TIME_RANGES[timeRangeIdx];

  useEffect(() => {
    loadData();
  }, [timeRangeIdx, searchQuery]);

  function loadData() {
    const sinceMs = Date.now() - currentRange.ms;
    let loaded = getSessions({ sinceMs });

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      loaded = loaded.filter(
        (s) =>
          s.projectSlug.toLowerCase().includes(q) ||
          s.lastAssistantMessage.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q)
      );
    }

    setSessions(loaded);
    setStats(getAggregateStats(sinceMs));
    setSelectedIndex(0);
  }

  useInput((input, key) => {
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery("");
      } else if (key.return) {
        setIsSearching(false);
      } else if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + input);
      }
      return;
    }

    if (showHelp) {
      setShowHelp(false);
      return;
    }

    if (input === "q") {
      exit();
    } else if (input === "/") {
      setIsSearching(true);
    } else if (input === "?") {
      setShowHelp(true);
    } else if (key.tab) {
      setFocusPanel((p) => (p === "list" ? "detail" : "list"));
    } else if (input === "1" || input === "2" || input === "3") {
      setTimeRangeIdx(parseInt(input, 10) - 1);
    } else if (input === "e" && sessions[selectedIndex]) {
      // Export selected session as JSON
      const s = sessions[selectedIndex];
      const json = JSON.stringify(s, null, 2);
      process.stdout.write("\n" + json + "\n");
    }
  });

  if (showHelp) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="magenta">claude-brief TUI - Help</Text>
        <Text />
        <Text>{"\u2191"}/{"\u2193"}         Navigate session list</Text>
        <Text>Enter        Expand/collapse session detail</Text>
        <Text>Tab          Switch focus between panels</Text>
        <Text>1            Last 24 hours</Text>
        <Text>2            Last 7 days</Text>
        <Text>3            Last 30 days</Text>
        <Text>/            Search sessions</Text>
        <Text>Esc          Clear search</Text>
        <Text>e            Export selected session as JSON</Text>
        <Text>q            Quit</Text>
        <Text>?            Show this help</Text>
        <Text />
        <Text dimColor>Press any key to close</Text>
      </Box>
    );
  }

  const selectedSession = sessions.length > 0 ? sessions[selectedIndex] : null;

  return (
    <Box flexDirection="column">
      {/* Stats bar */}
      {stats && <StatsBar stats={stats} timeRangeLabel={currentRange.label} />}

      {/* Search bar */}
      {isSearching && (
        <Box paddingX={1}>
          <Text color="magenta">Search: </Text>
          <Text>{searchQuery}</Text>
          <Text dimColor>{"\u2588"}</Text>
        </Box>
      )}

      {/* Main panels */}
      <Box flexGrow={1}>
        <SessionList
          sessions={sessions}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          focused={focusPanel === "list"}
          height={20}
        />
        <SessionDetail session={selectedSession} focused={focusPanel === "detail"} />
      </Box>
    </Box>
  );
}

export function renderTui() {
  render(<App />);
}
