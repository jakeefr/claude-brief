import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { fileURLToPath } from "url";
import { getSessions, getSession, getAggregateStats } from "../collector/store.js";
import { refreshFromJSONL } from "../brief/generator.js";
import { parseSince } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIEWER_CANDIDATES = [
  // Installed via npm: dist/../src/web/viewer.html
  path.join(__dirname, "..", "src", "web", "viewer.html"),
  // Dev fallback: running from source tree
  path.join(__dirname, "..", "web", "viewer.html"),
  path.join(__dirname, "viewer.html"),
];

function findViewer(): string {
  for (const candidate of VIEWER_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fallback: construct minimal HTML
  return "";
}

export function startServer(port: number = 7878, openBrowser: boolean = true) {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || "/", true);
    const pathname = parsedUrl.pathname || "/";

    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    if (pathname === "/api/sessions") {
      const since = (parsedUrl.query.since as string) || "24h";
      const project = parsedUrl.query.project as string;
      const sinceMs = Date.now() - parseSince(since);

      // Refresh data on each request
      refreshFromJSONL();

      const sessions = getSessions({
        sinceMs,
        project: project === "all" ? undefined : project,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(sessions.map(serializeSession)));
      return;
    }

    if (pathname === "/api/stats") {
      const since = (parsedUrl.query.since as string) || "24h";
      const sinceMs = Date.now() - parseSince(since);
      const stats = getAggregateStats(sinceMs);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }

    if (pathname.startsWith("/api/session/")) {
      const sessionId = pathname.replace("/api/session/", "");
      const session = getSession(sessionId);

      if (session) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(serializeSession(session)));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
      }
      return;
    }

    // Serve viewer.html for root
    const viewerPath = findViewer();
    if (viewerPath && fs.existsSync(viewerPath)) {
      const html = fs.readFileSync(viewerPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getFallbackHtml());
    }
  });

  server.listen(port, () => {
    console.log(`claude-brief dashboard running at http://localhost:${port}`);

    if (openBrowser) {
      import("open").then((open) => {
        open.default(`http://localhost:${port}`).catch(() => {
          // Browser open failed silently
        });
      }).catch(() => {
        console.log("Open browser manually: http://localhost:" + port);
      });
    }
  });

  process.on("SIGINT", () => {
    server.close();
    process.exit(0);
  });
}

function serializeSession(s: any) {
  return {
    ...s,
    startTime: s.startTime instanceof Date ? s.startTime.toISOString() : s.startTime,
    endTime: s.endTime instanceof Date ? s.endTime.toISOString() : s.endTime,
  };
}

function getFallbackHtml(): string {
  return `<!DOCTYPE html>
<html><head><title>claude-brief</title></head>
<body style="background:#0a0a0f;color:#f1f0f5;font-family:monospace;padding:2rem">
<h1>claude-brief dashboard</h1>
<p>Viewer file not found. The dashboard should be at src/web/viewer.html.</p>
</body></html>`;
}
