// Plausibility scan of the RAW data in src/ControlTower.jsx. Run on every data refresh:
//   node scripts/outlier-scan.mjs [path/to/ControlTower.jsx] [--since YYYY-MM-DD]
// Reconciliation catches components that do not sum; this catches figures that add up but look wrong
// (e.g. a cumulative total typed as the day's revenue). Findings are leads to escalate to the user,
// never to be "corrected" by us. Default window: last 7 reporting dates (--since to widen). Thresholds are deliberately loose; judge each flag in context.
import fs from "fs";
import { scanOutliers } from "./outlier-rules.mjs";
const file = process.argv.find((a, i) => i > 1 && a.endsWith(".jsx")) || "src/ControlTower.jsx";
const sinceIdx = process.argv.indexOf("--since");
let since = sinceIdx > 0 ? process.argv[sinceIdx + 1] : null;
const src = fs.readFileSync(file, "utf8");
const s = src.indexOf("const RAW = {"), e = src.indexOf("\n};", s);
const RAW = Function(`return (${src.slice(s + 12, e + 2)});`)();

if (!since) { // default: the last 7 reporting dates in the data
  const all = [...new Set(Object.values(RAW).flat().map(r => r.d))].sort();
  since = all[Math.max(0, all.length - 7)];
}
const out = scanOutliers(RAW, { from: since });
if (!out.length) console.log("No outliers flagged.");
for (const o of out) console.log(`${o.sev.padEnd(4)} ${o.code} ${o.d}  ${o.msg}${o.confirmed ? `  (CONFIRMED: ${o.confirmed})` : ""}`);
console.log(`\n${out.length} flag(s). Escalate every HIGH to the user before committing; summarise MED.`);
