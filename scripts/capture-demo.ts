/**
 * Capture scripts/record-demo.html as a GIF using Playwright + ffmpeg.
 * Run with: npx tsx scripts/capture-demo.ts
 */
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRAMES_DIR = path.join(__dirname, "frames");
const HTML_PATH = path.join(__dirname, "record-demo.html");
const GIF_PATH = path.join(__dirname, "..", "assets", "demo.gif");

const FRAME_INTERVAL = 100; // ms between captures
const DURATION = 10_000;    // total capture time in ms
const FRAME_COUNT = Math.ceil(DURATION / FRAME_INTERVAL);

async function main() {
  // Clean and create frames directory
  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true });
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log(`Capturing ${FRAME_COUNT} frames from ${HTML_PATH}...`);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 600 },
    deviceScaleFactor: 1,
  });

  await page.goto(`file:///${HTML_PATH.replace(/\\/g, "/")}`);
  // Let fonts load and animation start
  await page.waitForTimeout(300);

  for (let i = 0; i < FRAME_COUNT; i++) {
    const name = `frame${String(i).padStart(3, "0")}.png`;
    await page.screenshot({ path: path.join(FRAMES_DIR, name) });
    if (i < FRAME_COUNT - 1) {
      await page.waitForTimeout(FRAME_INTERVAL);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`  ${i + 1}/${FRAME_COUNT} frames captured`);
    }
  }

  await browser.close();
  console.log(`All ${FRAME_COUNT} frames captured.`);

  // Convert frames to GIF with ffmpeg
  console.log("Converting to GIF...");
  const ffmpegInput = path.join(FRAMES_DIR, "frame%03d.png").replace(/\\/g, "/");
  const ffmpegOutput = GIF_PATH.replace(/\\/g, "/");

  execSync(
    `ffmpeg -y -framerate 10 -i "${ffmpegInput}" ` +
    `-vf "scale=1200:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" ` +
    `-loop 0 "${ffmpegOutput}"`,
    { stdio: "inherit" }
  );

  const stat = fs.statSync(GIF_PATH);
  console.log(`\nCreated ${GIF_PATH} (${(stat.size / 1024).toFixed(0)} KB)`);

  // Clean up frames
  fs.rmSync(FRAMES_DIR, { recursive: true });
  console.log("Cleaned up frames directory.");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
