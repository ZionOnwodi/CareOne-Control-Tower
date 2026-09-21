// Self-contained daily DSR pipeline.
// Usage: node run-daily-dsr.mjs
// Requires: git, node >= 18, and this folder's dsr-data.mjs / render-email.mjs.
//
// Steps: clone/pull the live repo (read-only) -> extract the current engine
// straight out of ControlTower.jsx (never a stale copy) -> compute today's DSR
// -> render the email -> write dsr-email-output.html for the send step to use.

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// The engine builds and compares calendar dates with new Date("YYYY-MM-DDT00:00:00") + toISOString().
// Under any non-UTC timezone (e.g. Africa/Lagos, UTC+1) that shifts every date back one day, which
// produced a phantom missing report on 31 Aug, an as-of date one day early, "Day 16" instead of
// "Day 17", and every hospital showing as not reporting. Pin the process to UTC so results are
// identical wherever this runs.
process.env.TZ = "UTC";

// Paths below are relative to this folder, so the script works whether it is launched from the
// repo root (node dsr-pipeline/run-daily-dsr.mjs) or from inside dsr-pipeline.
process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const REPO_URL = "https://github.com/ZionOnwodi/CareOne-Control-Tower.git";
const WORKDIR = "./_repo";
const LOGO_WATERMARK_URL = "https://raw.githubusercontent.com/ZionOnwodi/CareOne-Control-Tower/main/public/logo-watermark.png";

// 1. Get the current source, read-only.
if (fs.existsSync(WORKDIR)) execSync(`cd ${WORKDIR} && git pull`, { stdio: "inherit" });
else execSync(`git clone ${REPO_URL} ${WORKDIR}`, { stdio: "inherit" });

// 2. Extract the engine fresh from whatever ControlTower.jsx currently contains —
//    this is what keeps the DSR from silently drifting out of sync with the dashboard.
const src = fs.readFileSync(path.join(WORKDIR, "src/ControlTower.jsx"), "utf8");
const start = src.indexOf("SECTION 1 — CONFIGURATION");
const blockStart = src.lastIndexOf("/* ====", start);
const end = src.indexOf("SECTION 7 — RAG");
const sectionEnd = src.lastIndexOf("/* ====", end);
const engineBody = src.slice(blockStart, sectionEnd);
fs.writeFileSync(
  "./engine.mjs",
  engineBody + "\nexport { CONFIG, getAvailableMonths, derivePeriod, loadFromSource, buildCanonical, computeHospitalKPIs, computeReporting, generateExceptions, CATEGORY };\n"
);

// 3. Compute + render.
const { computeDSR } = await import("./dsr-data.mjs?update=" + Date.now());
const { renderDSREmail, EMAIL_ASSETS } = await import("./render-email.mjs?update=" + Date.now());

const dsr = computeDSR();
const html = renderDSREmail(dsr, { logoWatermarkUrl: LOGO_WATERMARK_URL });

fs.writeFileSync("./dsr-email-output.html", html);

// Browser-viewable preview: same HTML with each cid: image swapped for its local file.
let preview = html;
for (const [cid, file] of Object.entries(EMAIL_ASSETS)) preview = preview.split(`cid:${cid}"`).join(`file://${file}"`);
fs.writeFileSync("./dsr-email-preview.html", preview);

// Details the send step needs (subject, date). send-email.mjs reads this.
fs.writeFileSync("./dsr-meta.json", JSON.stringify({
  subject: `CareOne Control Tower — Daily Situation Report — ${dsr.dataThrough}`,
  dataThrough: dsr.dataThrough,
}, null, 2));
console.log("DSR generated for", dsr.asOfDate, "—", dsr.exceptions.length, "exceptions,",
  dsr.reportingStatus.reportingCount + "/" + dsr.reportingStatus.totalCount, "hospitals reporting.");
console.log("Wrote ./dsr-email-output.html (+ dsr-email-preview.html for viewing in a browser). Send with: node send-email.mjs");

// If any run should NOT send a bad/partial report, a caller can check this before sending:
if (dsr.snapshot.attendance === 0 && dsr.snapshot.revenue === 0) {
  console.error("WARNING: zero network activity computed — check before sending; this usually means a data pull failed.");
  process.exitCode = 1;
}
