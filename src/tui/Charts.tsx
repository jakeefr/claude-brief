import React from "react";
import { Box, Text } from "ink";

interface BarData {
  label: string;
  value: number;
  max: number;
  color?: string;
}

interface ChartsProps {
  data: BarData[];
  width?: number;
}

const BLOCK_CHARS = [" ", "\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];

export function HorizontalBar({ label, value, max, color = "magenta", width = 20 }: BarData & { width?: number }) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const filled = Math.round(ratio * width);
  const bar = "\u2588".repeat(filled);
  const padLabel = label.length < 8 ? label + " ".repeat(8 - label.length) : label.slice(0, 8);

  return (
    <Box>
      <Text dimColor>{padLabel} </Text>
      <Text color={color as any}>{bar}</Text>
      <Text dimColor> {value}</Text>
    </Box>
  );
}

export function BarChart({ data, width = 20 }: ChartsProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <Box flexDirection="column">
      {data.map((d, i) => (
        <HorizontalBar
          key={i}
          label={d.label}
          value={d.value}
          max={d.max || maxVal}
          color={d.color || "magenta"}
          width={width}
        />
      ))}
    </Box>
  );
}
