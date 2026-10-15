// Plausibility scan of the RAW data in src/ControlTower.jsx. Run on every data refresh:
//   node scripts/outlier-scan.mjs [path/to/ControlTower.jsx] [--since YYYY-MM-DD]
// Reconciliation catches components that do not sum; this catches figures that add up but look wrong
// (e.g. a cumulative total typed as the day's revenue). Findings are leads to escalate to the user,
// never to be "corrected" by us. Default window: last 7 reporting dates (--since to widen). Thresholds are deliberately loose; judge each flag in context.
import fs from "fs";
const file = process.argv.find((a, i) => i > 1 && a.endsWith(".jsx")) || "src/ControlTower.jsx";
const sinceIdx = process.argv.indexOf("--since");
let since = sinceIdx > 0 ? process.argv[sinceIdx + 1] : null;
const src = fs.readFileSync(file, "utf8");
const s = src.indexOf("const RAW = {"), e = src.indexOf("\n};", s);
const RAW = Function(`return (${src.slice(s + 12, e + 2)});`)();

const med = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
const n = x => Math.round(x).toLocaleString("en-NG");
if (!since) { // default: the last 7 reporting dates in the data
  const all = [...new Set(Object.values(RAW).flat().map(r => r.d))].sort();
  since = all[Math.max(0, all.length - 7)];
}
const out = [];
for (const [code, rows0] of Object.entries(RAW)) {
  const rows = rows0.filter(r => r.d >= "2026-09-01").sort((a, b) => a.d.localeCompare(b.d));
  rows.forEach((r, i) => {
    if (r.d < since) return;
    const others = rows.filter(x => x !== r && x.rTotRev != null && x.att > 0);
    // Discharge days legitimately carry high revenue (inpatients settle bills on discharge — confirmed
    // for Outreach Festac 14 Oct 2026: 16 discharges, ₦8.73M). Revenue spikes on such days are MED, with context.
    const mDisch = med(rows.filter(x => x !== r && x.disch != null).map(x => x.disch));
    const dischSpike = r.disch != null && mDisch != null && r.disch >= Math.max(8, 2.5 * mDisch);
    const flag = (sev, msg) => out.push({ code, d: r.d, sev: dischSpike && sev === "HIGH" && /revenue|day total/.test(msg) ? "MED" : sev,
      msg: dischSpike && /revenue|day total/.test(msg) ? `${msg} [${r.disch} discharges vs median ${mDisch} — likely discharge billing]` : msg });
    if (r.rTotRev != null && r.att > 0 && others.length >= 8) {
      const ppp = r.rTotRev / r.att, mPpp = med(others.map(x => x.rTotRev / x.att));
      if (mPpp && ppp > 2.5 * mPpp) flag(ppp >= 4 * mPpp ? "HIGH" : "MED", `revenue per patient ₦${n(ppp)} is ${(ppp / mPpp).toFixed(1)}x this hospital's median (₦${n(mPpp)})`);
      if (mPpp && r.att >= 5 && ppp < 0.25 * mPpp) flag("MED", `revenue per patient ₦${n(ppp)} is only ${(ppp / mPpp * 100).toFixed(0)}% of median (₦${n(mPpp)})`);
      const mRev = med(others.map(x => x.rTotRev));
      if (mRev && r.rTotRev > 3 * mRev) flag(r.rTotRev >= 4 * mRev ? "HIGH" : "MED", `day revenue ₦${n(r.rTotRev)} is ${(r.rTotRev / mRev).toFixed(1)}x median day (₦${n(mRev)})`);
      const mAtt = med(others.map(x => x.att));
      if (mAtt && (r.att > 2.5 * mAtt || (mAtt >= 10 && r.att < 0.3 * mAtt))) flag("MED", `attendance ${r.att} vs median ${mAtt}`);
    }
    if (r.att > 0 && r.rTotRev == null) flag("MED", `attendance ${r.att} but revenue not reported`);
    if (r.att === 0 && r.rTotRev > 0) flag("MED", `revenue ₦${n(r.rTotRev)} with zero attendance`);
    const prev = rows[i - 1];
    if (prev) {
      for (const f of ["privRev", "hmoRev", "compRev"]) if (r[f] > 0 && r[f] === prev[f]) flag("MED", `${f} ₦${n(r[f])} identical to previous day (possible copy-paste)`);
      if (r.rTotRev > 0 && r.rTotRev === prev.rTotRev) flag("MED", "total revenue identical to previous day");
      if (prev.rTotRev > 0 && r.rTotRev > 4 * prev.rTotRev && r.rTotRev > 2e6) flag("MED", `revenue ${(r.rTotRev / prev.rTotRev).toFixed(1)}x previous day`);
    }
    // Cumulative-total signature: day total equals the sum of the preceding k days (k>=2) in the same month.
    for (let k = 2; k <= 6 && i - k >= 0; k++) {
      const prior = rows.slice(i - k, i); if (prior.some(x => x.d.slice(0, 7) !== r.d.slice(0, 7))) break;
      const sum = prior.reduce((a, x) => a + (x.rTotRev || 0), 0);
      if (r.rTotRev > 1e6 && Math.abs(r.rTotRev - sum) / sum < 0.01) flag("HIGH", `day total equals the sum of the previous ${k} days — looks like a cumulative figure`);
    }
    // Month-to-date column must equal the running sum of daily revenue for that month.
    if (r.rMTD != null) {
      const sum = rows.filter(x => x.d.slice(0, 7) === r.d.slice(0, 7) && x.d <= r.d).reduce((a, x) => a + (x.rTotRev || 0), 0);
      if (Math.abs(sum - r.rMTD) > 1) flag("MED", `MTD column ₦${n(r.rMTD)} ≠ running sum of daily revenue ₦${n(sum)}`);
    }
  });
}
out.sort((a, b) => (a.sev === b.sev ? a.code.localeCompare(b.code) || a.d.localeCompare(b.d) : a.sev === "HIGH" ? -1 : 1));
if (!out.length) console.log("No outliers flagged.");
for (const o of out) console.log(`${o.sev.padEnd(4)} ${o.code} ${o.d}  ${o.msg}`);
console.log(`\n${out.length} flag(s). Escalate every HIGH to the user before committing; summarise MED.`);
