// Self-contained weekly WSR pipeline.
// Usage: node run-weekly-wsr.mjs [--week-start YYYY-MM-DD]      (or set WEEK_START)
// With no week given, reports the most recent completed Monday-Sunday week (Lagos calendar).
//
// Steps: clone/pull the live repo (read-only) -> extract the current engine
// straight out of ControlTower.jsx (never a stale copy) -> compute the WSR
// -> render the email -> write dsr-email-output.html + dsr-meta.json for send-email.mjs.

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Same reason as run-daily-dsr.mjs: the engine's date maths must run in UTC.
process.env.TZ = "UTC";
process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const REPO_URL = "https://github.com/ZionOnwodi/CareOne-Control-Tower.git";
const WORKDIR = "./_repo";

// Never leave a previous run's email lying around for send-email.mjs to pick up if this run fails.
for (const f of ["./dsr-email-output.html", "./dsr-meta.json", "./wsr-email-preview.html"]) fs.rmSync(f, { force: true });

const argIdx = process.argv.indexOf("--week-start");
const weekStartArg = (argIdx !== -1 ? process.argv[argIdx + 1] : process.env.WEEK_START || "").trim();

// 1. Get the current source, read-only.
if (fs.existsSync(WORKDIR)) execSync(`cd ${WORKDIR} && git pull`, { stdio: "inherit" });
else execSync(`git clone ${REPO_URL} ${WORKDIR}`, { stdio: "inherit" });

// 2. Extract the engine fresh from whatever ControlTower.jsx currently contains.
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
const { computeWSR, defaultWeekStart, validateWeekStart } = await import("./wsr-data.mjs?update=" + Date.now());
const { renderDSREmail, EMAIL_ASSETS } = await import("./render-email.mjs?update=" + Date.now());

let weekStart;
try { weekStart = weekStartArg ? validateWeekStart(weekStartArg) : defaultWeekStart(); }
catch (e) { console.error("ERROR: " + e.message); process.exit(2); }

const wsr = computeWSR(weekStart);
console.log(`WSR week ${wsr.weekStart} to ${wsr.weekEnd} (months loaded: ${wsr.monthsLoaded.join(", ")}).`);

if (wsr.missingSunday.length) {
  const partial = wsr.missingSunday.filter(h => h.reportedOtherDays).map(h => h.name);
  const none = wsr.missingSunday.filter(h => !h.reportedOtherDays).map(h => h.name);
  console.warn("");
  console.warn(`WARNING: ${wsr.missingSunday.length} hospital(s) have no report for Sunday ${wsr.weekEnd}.`);
  if (partial.length) console.warn(`  Reported earlier in the week but not Sunday (possibly not yet submitted): ${partial.join(", ")}`);
  if (none.length) console.warn(`  No reports at all this week: ${none.join(", ")}`);
  console.warn("");
}

// Nothing sends on an empty week: a zero-activity result almost always means a failed data pull.
if (wsr.snapshot.revenue === 0 && wsr.snapshot.attendance === 0) {
  console.error(`ERROR: zero network revenue and attendance for ${wsr.weekStart} to ${wsr.weekEnd} — not writing the email. Check the data pull.`);
  process.exit(1);
}

const html = renderDSREmail(wsr, { mode: "weekly" });
fs.writeFileSync("./dsr-email-output.html", html);

// Browser-viewable preview: same HTML with each cid: image swapped for its local file.
let preview = html;
for (const [cid, file] of Object.entries(EMAIL_ASSETS)) preview = preview.split(`cid:${cid}"`).join(`file://${file}"`);
fs.writeFileSync("./wsr-email-preview.html", preview);

// Details the send step needs. send-email.mjs reads this.
fs.writeFileSync("./dsr-meta.json", JSON.stringify({
  reportName: "Weekly Situation Report",
  subject: `CareOne Control Tower — Weekly Situation Report — ${wsr.rangeLabel}`,
  dataThrough: wsr.rangeLabel,
  weekStart: wsr.weekStart,
  weekEnd: wsr.weekEnd,
}, null, 2));

console.log("WSR generated —", wsr.exceptions.length, "exceptions,",
  wsr.reportingStatus.reportingCount + "/" + wsr.reportingStatus.totalCount, "hospitals reporting all 7 days.");
console.log("Wrote ./dsr-email-output.html (+ wsr-email-preview.html for viewing in a browser). Send with: node send-email.mjs");
