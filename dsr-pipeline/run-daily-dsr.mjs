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

const REPO_URL = "https://github.com/ZionOnwodi/CareOne-Control-Tower.git";
const WORKDIR = "./_repo";
const LOGO_HEADER_URL = "https://raw.githubusercontent.com/ZionOnwodi/CareOne-Control-Tower/main/public/logo-header.png";
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
const { renderDSREmail } = await import("./render-email.mjs?update=" + Date.now());

const dsr = computeDSR();
const html = renderDSREmail(dsr, { logoHeaderUrl: LOGO_HEADER_URL, logoWatermarkUrl: LOGO_WATERMARK_URL });

fs.writeFileSync("./dsr-email-output.html", html);
console.log("DSR generated for", dsr.asOfDate, "—", dsr.exceptions.length, "exceptions,",
  dsr.reportingStatus.reportingCount + "/" + dsr.reportingStatus.totalCount, "hospitals reporting.");
console.log("Wrote ./dsr-email-output.html — send this as the email body (Content-Type: text/html).");

// If any run should NOT send a bad/partial report, a caller can check this before sending:
if (dsr.snapshot.attendance === 0 && dsr.snapshot.revenue === 0) {
  console.error("WARNING: zero network activity computed — check before sending; this usually means a data pull failed.");
  process.exitCode = 1;
}
