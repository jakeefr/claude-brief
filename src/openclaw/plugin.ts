// OpenClaw plugin logic for claude-brief
// This is imported by openclaw/src/index.ts

import { generateDigest, refreshFromJSONL } from "../brief/generator.js";
import { formatMarkdown } from "../brief/formatter.js";

export interface BriefPluginConfig {
  deliveryChannel: string;
  deliveryTo: string;
  botToken?: string;
  schedule?: string;
  lookbackHours?: number;
  workspacePaths?: string[];
}

/**
 * Generate a brief and return it as formatted markdown.
 */
export function generateBrief(config: BriefPluginConfig): string {
  refreshFromJSONL();

  const since = config.lookbackHours && config.lookbackHours > 0
    ? `${config.lookbackHours}h`
    : undefined;

  const result = generateDigest({ since, format: "markdown" });
  return formatMarkdown(result);
}
