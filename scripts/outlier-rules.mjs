// Shared plausibility rules over RAW (src/ControlTower.jsx). Used by scripts/outlier-scan.mjs on every data
// refresh and by the DSR/WSR emails' exception tables. Reconciliation proves payer components add up; these
// rules catch figures that add up but look wrong against the hospital's own history. Findings are leads to
// confirm with the hospital, never corrections. Thresholds are deliberately loose.

// Rows the owner has confirmed accurate with the hospital: kept in the CLI scan (tagged), left out of emails.
export const CONFIRMED_ACCURATE = {
  OFE: { "2026-10-14": "16 discharges; confirmed accurate by the business manager (15 Oct 2026)" },
};

const med = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
const n = x => Math.round(x).toLocaleString("en-NG");
const PAYER = { privRev: "Private", hmoRev: "HMO", compRev: "Company" };

/** Flags for rows dated within [from, to] (inclusive ISO dates). Each flag: {code, d, sev, msg, plain, note, confirmed}. */
export function scanOutliers(RAW, { from = "0000-00-00", to = "9999-99-99" } = {}) {
  const out = [];
  for (const [code, rows0] of Object.entries(RAW)) {
    const rows = rows0.filter(r => r.d >= "2026-09-01").sort((a, b) => a.d.localeCompare(b.d));
    rows.forEach((r, i) => {
      if (r.d < from || r.d > to) return;
      const others = rows.filter(x => x !== r && x.rTotRev != null && x.att > 0);
      // Discharge days legitimately carry high revenue (inpatients settle bills on discharge — confirmed for
      // Outreach Festac 14 Oct 2026: 16 discharges, ₦8.73M). Revenue spikes on such days are MED, with context.
      const mDisch = med(rows.filter(x => x !== r && x.disch != null).map(x => x.disch));
      const dischSpike = r.disch != null && mDisch != null && r.disch >= Math.max(8, 2.5 * mDisch);
      const confirmed = CONFIRMED_ACCURATE[code]?.[r.d] || null;
      const flag = (sev, msg, plain) => {
        const rev = /revenue|day total/i.test(msg);
        out.push({ code, d: r.d, sev: dischSpike && sev === "HIGH" && rev ? "MED" : sev,
          msg: dischSpike && rev ? `${msg} [${r.disch} discharges vs median ${mDisch} — likely discharge billing]` : msg,
          plain, note: dischSpike && rev ? `${r.disch} discharges that day (usually about ${mDisch}) may explain it.` : null, confirmed });
      };
      if (r.rTotRev != null && r.att > 0 && others.length >= 8) {
        const ppp = r.rTotRev / r.att, mPpp = med(others.map(x => x.rTotRev / x.att));
        if (mPpp && ppp > 2.5 * mPpp) flag(ppp >= 4 * mPpp ? "HIGH" : "MED", `revenue per patient ₦${n(ppp)} is ${(ppp / mPpp).toFixed(1)}x this hospital's median (₦${n(mPpp)})`,
          `₦${n(ppp)} revenue per patient, about ${(ppp / mPpp).toFixed(1)}× its usual ₦${n(mPpp)}`);
        if (mPpp && r.att >= 5 && ppp < 0.25 * mPpp) flag("MED", `revenue per patient ₦${n(ppp)} is only ${(ppp / mPpp * 100).toFixed(0)}% of median (₦${n(mPpp)})`,
          `₦${n(ppp)} revenue per patient, only ${(ppp / mPpp * 100).toFixed(0)}% of its usual ₦${n(mPpp)}`);
        const mRev = med(others.map(x => x.rTotRev));
        if (mRev && r.rTotRev > 3 * mRev) flag(r.rTotRev >= 4 * mRev ? "HIGH" : "MED", `day revenue ₦${n(r.rTotRev)} is ${(r.rTotRev / mRev).toFixed(1)}x median day (₦${n(mRev)})`,
          `day revenue ₦${n(r.rTotRev)}, about ${(r.rTotRev / mRev).toFixed(1)}× its usual day (₦${n(mRev)})`);
        const mAtt = med(others.map(x => x.att));
        if (mAtt && (r.att > 2.5 * mAtt || (mAtt >= 10 && r.att < 0.3 * mAtt))) flag("MED", `attendance ${r.att} vs median ${mAtt}`,
          `attendance of ${r.att} against a usual ${mAtt}`);
      }
      if (r.att > 0 && r.rTotRev == null) flag("MED", `attendance ${r.att} but revenue not reported`, `${r.att} patients recorded but no revenue entered`);
      if (r.att === 0 && r.rTotRev > 0) flag("MED", `revenue ₦${n(r.rTotRev)} with zero attendance`, `revenue of ₦${n(r.rTotRev)} recorded with zero attendance`);
      // Payer mix: one payer's revenue far out of line with that payer's patient count (e.g. a day total typed into
      // the private column — Grovers 15 Oct 2026: ₦2.94M "private" from 2 private patients).
      for (const [cnt, rv, label] of [["priv", "privRev", "Private"], ["hmo", "hmoRev", "HMO"], ["nhia", "nhiaRev", "NHIA"], ["comp", "compRev", "Company"]]) {
        if (!(r[rv] > 1e6)) continue;
        if (!(r[cnt] > 0)) { flag("MED", `${label} revenue ₦${n(r[rv])} with no ${label} patients`, `${label} revenue of ₦${n(r[rv])} with no ${label} patients recorded`); continue; }
        const per = r[rv] / r[cnt], mPer = med(rows.filter(x => x !== r && x[cnt] > 0 && x[rv] > 0).map(x => x[rv] / x[cnt]));
        if (mPer && per > 4 * mPer) flag(per >= 8 * mPer ? "HIGH" : "MED", `${label} revenue ₦${n(r[rv])} from ${r[cnt]} ${label} patient(s) = ₦${n(per)} each, ${(per / mPer).toFixed(1)}x median (₦${n(mPer)})`,
          `${label} revenue of ₦${n(r[rv])} from ${r[cnt]} ${label} patient${r[cnt] > 1 ? "s" : ""} (₦${n(per)} each, about ${(per / mPer).toFixed(1)}× its usual ₦${n(mPer)})`);
      }
      const prev = rows[i - 1];
      if (prev) {
        for (const f of Object.keys(PAYER)) if (r[f] > 0 && r[f] === prev[f]) flag("MED", `${f} ₦${n(r[f])} identical to previous day (possible copy-paste)`,
          `${PAYER[f]} revenue (₦${n(r[f])}) identical to the previous day`);
        if (r.rTotRev > 0 && r.rTotRev === prev.rTotRev) flag("MED", "total revenue identical to previous day", "total revenue identical to the previous day");
        if (prev.rTotRev > 0 && r.rTotRev > 4 * prev.rTotRev && r.rTotRev > 2e6) flag("MED", `revenue ${(r.rTotRev / prev.rTotRev).toFixed(1)}x previous day`,
          `revenue ${(r.rTotRev / prev.rTotRev).toFixed(1)}× the previous day`);
      }
      // Cumulative-total signature: day total equals the sum of the preceding k days (k>=2) in the same month.
      for (let k = 2; k <= 6 && i - k >= 0; k++) {
        const prior = rows.slice(i - k, i); if (prior.some(x => x.d.slice(0, 7) !== r.d.slice(0, 7))) break;
        const sum = prior.reduce((a, x) => a + (x.rTotRev || 0), 0);
        if (r.rTotRev > 1e6 && Math.abs(r.rTotRev - sum) / sum < 0.01) flag("HIGH", `day total equals the sum of the previous ${k} days — looks like a cumulative figure`,
          `day total matches the sum of the previous ${k} days — possibly a cumulative entry`);
      }
      // Month-to-date column must equal the running sum of daily revenue for that month.
      if (r.rMTD != null) {
        const sum = rows.filter(x => x.d.slice(0, 7) === r.d.slice(0, 7) && x.d <= r.d).reduce((a, x) => a + (x.rTotRev || 0), 0);
        if (Math.abs(sum - r.rMTD) > 1) flag("MED", `MTD column ₦${n(r.rMTD)} ≠ running sum of daily revenue ₦${n(sum)}`,
          `month-to-date column (₦${n(r.rMTD)}) does not match the daily figures (₦${n(sum)})`);
      }
    });
  }
  return out.sort((a, b) => (a.sev === b.sev ? a.code.localeCompare(b.code) || a.d.localeCompare(b.d) : a.sev === "HIGH" ? -1 : 1));
}

/** One exception-table row per hospital and date, for the DSR/WSR emails. Confirmed rows are left out. */
export function outlierExceptions(RAW, nameOf, dayFmt, range) {
  const groups = new Map();
  scanOutliers(RAW, range).filter(f => !f.confirmed).forEach(f => {
    const k = f.code + "|" + f.d;
    const g = groups.get(k) || { code: f.code, d: f.d, high: false, parts: [], notes: new Set() };
    g.high = g.high || f.sev === "HIGH";
    if (!g.parts.includes(f.plain)) g.parts.push(f.plain);
    if (f.note) g.notes.add(f.note);
    groups.set(k, g);
  });
  return [...groups.values()].sort((a, b) => a.d.localeCompare(b.d)).map(g => {
    const body = g.parts.slice(0, 2).join("; ");
    return {
      hospital: nameOf(g.code),
      issue: `Unusual figure on ${dayFmt(g.d)}: ${body.charAt(0).toUpperCase() + body.slice(1)}.${g.notes.size ? " " + [...g.notes].join(" ") : ""} Please confirm with the hospital.`,
      priority: g.high ? "MEDIUM" : "LOW",
    };
  });
}
