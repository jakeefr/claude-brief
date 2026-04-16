// OpenClaw channel send utilities
// Maps delivery channels to OpenClaw runtime.channel function names

export const CHANNEL_SEND_MAP: Record<string, { namespace: string; functionName: string }> = {
  telegram:  { namespace: "telegram",  functionName: "sendMessageTelegram" },
  whatsapp:  { namespace: "whatsapp",  functionName: "sendMessageWhatsApp" },
  discord:   { namespace: "discord",   functionName: "sendMessageDiscord" },
  slack:     { namespace: "slack",     functionName: "sendMessageSlack" },
  signal:    { namespace: "signal",    functionName: "sendMessageSignal" },
  imessage:  { namespace: "imessage",  functionName: "sendMessageIMessage" },
  line:      { namespace: "line",      functionName: "sendMessageLine" },
};

/**
 * Send a message via an OpenClaw channel.
 * @param runtime - OpenClaw runtime object
 * @param channel - Channel name (telegram, whatsapp, etc.)
 * @param recipientId - Chat/channel/phone ID
 * @param message - Message content
 */
export async function sendViaChannel(
  runtime: any,
  channel: string,
  recipientId: string,
  message: string
): Promise<void> {
  const mapping = CHANNEL_SEND_MAP[channel];
  if (!mapping) {
    throw new Error(`Unknown channel: ${channel}. Supported: ${Object.keys(CHANNEL_SEND_MAP).join(", ")}`);
  }

  const channelFn = runtime.channel[mapping.namespace]?.[mapping.functionName];
  if (!channelFn) {
    throw new Error(`Channel function ${mapping.namespace}.${mapping.functionName} not found on runtime`);
  }

  // WhatsApp requires third arg: { verbose: false }
  if (channel === "whatsapp") {
    await channelFn(recipientId, message, { verbose: false });
  } else {
    await channelFn(recipientId, message);
  }
}

/**
 * Chunk a message for Telegram's 4096 char limit.
 */
export function chunkForTelegram(message: string, maxLen = 4096): string[] {
  if (message.length <= maxLen) return [message];
  const chunks: string[] = [];
  let remaining = message;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}
