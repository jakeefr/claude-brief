import * as https from "https";

export async function sendTelegram(botToken: string, chatId: string, message: string): Promise<void> {
  // Telegram has a 4096 char limit per message
  const chunks = chunkMessage(message, 4000);

  for (const chunk of chunks) {
    try {
      await sendTelegramChunk(botToken, chatId, chunk, "Markdown");
    } catch {
      // Fallback to plain text if Markdown fails
      await sendTelegramChunk(botToken, chatId, chunk, undefined);
    }
  }
}

async function sendTelegramChunk(
  botToken: string,
  chatId: string,
  text: string,
  parseMode?: string
): Promise<void> {
  const payload: any = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Telegram API returned ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function chunkMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
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
