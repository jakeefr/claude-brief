import * as https from "https";
import * as http from "http";

export async function sendNtfy(topic: string, title: string, message: string, server = "https://ntfy.sh"): Promise<void> {
  const url = new URL(`${server}/${topic}`);
  const payload = message;

  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Title": title,
        "Content-Type": "text/plain",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = (url.protocol === "https:" ? https : http as any).request(opts, (res: any) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`ntfy returned status ${res.statusCode}`));
      }
      res.resume();
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
