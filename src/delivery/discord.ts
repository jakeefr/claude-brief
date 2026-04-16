import * as https from "https";
import * as http from "http";

export async function sendDiscord(webhookUrl: string, message: string): Promise<void> {
  // Discord has a 2000 char limit per message
  const chunks = chunkMessage(message, 1900);

  for (const chunk of chunks) {
    await sendDiscordChunk(webhookUrl, chunk);
  }
}

async function sendDiscordChunk(webhookUrl: string, content: string): Promise<void> {
  const payload = JSON.stringify({ content });

  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + (url.search || ""),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = (url.protocol === "https:" ? https : http as any).request(opts, (res: any) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Discord webhook returned status ${res.statusCode}`));
      }
      res.resume();
    });

    req.on("error", reject);
    req.write(payload);
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
