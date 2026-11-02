// Self-contained monthly MSR pipeline.
// Usage: node run-monthly-msr.mjs [--month YYYY-MM]      (or set MONTH)
// With no month given, reports the most recent COMPLETED calendar month (Lagos calendar).
//
// Steps: clone/pull the live repo (read-only) -> extract the current engine
// straight out of ControlTower.jsx (never a stale copy) -> compute the MSR
// -> render the email -> write dsr-email-output.html + dsr-meta.json for send-email.mjs.
//
// Only STRUCTURAL problems stop the run (bad month, hospitals missing from the engine, no data for the
// month at all). Row-level reconciliation failures (rule R4) are listed in the report and never block it.

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
for (const f of ["./dsr-email-output.html", "./dsr-meta.json", "./msr-email-preview.html"]) fs.rmSync(f, { force: true });

const argIdx = process.argv.indexOf("--month");
const monthArg = (argIdx !== -1 ? process.argv[argIdx + 1] : process.env.MONTH || "").trim();

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
  engineBody + "\nexport { CONFIG, getAvailableMonths, derivePeriod, loadFromSource, buildCanonical, computeHospitalKPIs, computeReporting, generateExceptions, CATEGORY, RAW };\n"
);

// 3. Compute + render.
const { computeMSR, defaultMonth, validateMonth } = await import("./msr-data.mjs?update=" + Date.now());
const { renderDSREmail } = await import("./render-email.mjs?update=" + Date.now());

let monthId;
try { monthId = monthArg ? validateMonth(monthArg) : defaultMonth(); }
catch (e) { console.error("ERROR: " + e.message); process.exit(2); }

const msr = computeMSR(monthId);
console.log(`MSR ${msr.monthLabel} (compared with ${msr.prevLabel}); data through ${msr.dataThrough ?? "—"}.`);

// Structural checks: these stop the run so nothing is sent.
if (msr.hospitalCount !== msr.configuredHospitalCount) {
  console.error(`ERROR: ${msr.hospitalCount} hospitals computed but ${msr.configuredHospitalCount} configured — not writing the email.`);
  process.exit(1);
}
if (!msr.dataThrough || (msr.snapshot.revenue === 0 && msr.snapshot.attendance === 0)) {
  console.error(`ERROR: no revenue or attendance for ${msr.monthLabel} — not writing the email. Check the month and the data pull.`);
  process.exit(1);
}

// Warnings: printed, never blocking.
if (msr.missingTail.length) console.warn(`WARNING: data stops on ${msr.dataThrough}; ${msr.missingTail.join(", ")} not loaded yet, so ${msr.monthLabel} is understated.`);
const partialNow = msr.achievement.filter(r => r.partialMonth && r.partialMonth.days < r.partialMonth.of - msr.missingTail.length);
if (partialNow.length) console.warn(`WARNING: partial month for ${partialNow.map(r => `${r.name} (${r.partialMonth.days}/${r.partialMonth.of} days)`).join(", ")}.`);
if (msr.prevPartialHospitals.length) console.warn(`NOTE: ${msr.prevLabel} is a partial month for ${msr.prevPartialHospitals.map(p => `${p.name} (${p.days}/${p.of})`).join(", ")}; their MoM change is flagged in the report.`);
if (msr.r4.length) console.warn(`NOTE: ${msr.r4.length} R4 data-quality exception(s) listed in the report (not blocking).`);

const html = renderDSREmail(msr, { mode: "monthly" });
fs.writeFileSync("./dsr-email-output.html", html);
// Gmail clips an email over ~102 KB ("View entire message"), which would hide the bottom of the report. Sending adds
// about 10% (quoted-printable encoding), so warn once the HTML itself passes 92 KB.
const kb = Buffer.byteLength(html) / 1024;
if (kb > 92) console.warn(`WARNING: the email is ${kb.toFixed(0)} KB (about ${(kb * 1.1).toFixed(0)} KB once encoded); Gmail clips emails over ~102 KB. Trim the report before sending.`);
else console.log(`Email size ${kb.toFixed(0)} KB (about ${(kb * 1.1).toFixed(0)} KB once encoded; Gmail clips over ~102 KB).`);

// Browser-viewable preview: the images load from their hosted URLs, so it is the same HTML.
fs.writeFileSync("./msr-email-preview.html", html);

// Details the send step needs. send-email.mjs reads this.
fs.writeFileSync("./dsr-meta.json", JSON.stringify({
  reportName: "Monthly Situation Report",
  subject: `CareOne Control Tower — Monthly Situation Report — ${msr.monthLabel}`,
  dataThrough: msr.monthLabel,
  month: msr.monthId,
}, null, 2));

console.log(`MSR generated — network ${(msr.snapshot.networkAchievement * 100).toFixed(1)}% of target, ${msr.achievers.atOrAbove}/${msr.achievers.withTarget} hospitals at or above target.`);
console.log("Wrote ./dsr-email-output.html (+ msr-email-preview.html for viewing in a browser). Send with: node send-email.mjs");
