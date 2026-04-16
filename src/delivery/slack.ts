import * as https from "https";
import * as http from "http";

export async function sendSlack(webhookUrl: string, message: string): Promise<void> {
  const payload = JSON.stringify({
    text: message,
    unfurl_links: false,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
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
        reject(new Error(`Slack webhook returned status ${res.statusCode}`));
      }
      res.resume();
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
