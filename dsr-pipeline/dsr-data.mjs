import { CONFIG, getAvailableMonths, derivePeriod, loadFromSource, buildCanonical, computeHospitalKPIs, computeReporting, generateExceptions, CATEGORY } from "./engine.mjs";

/* ============================================================================
   CONFIG LAYER — Revenue targets
   ----------------------------------------------------------------------------
   No monthly revenue targets have been supplied yet. Every value is explicitly
   null rather than guessed — per instruction, achievement/status must show as
   "not configured" until real targets are provided, never a fabricated number.
   This is the ONLY place target values need to be entered; nothing else in
   this file, or the email template, needs to change when they arrive.
   ============================================================================ */
export const REVENUE_TARGETS_NGN = {
  ULT: 200000000, FHM: 10000000, MFM: null, NLB: 150000000, ROD: 20000000, TAL: 40000000, HOS: 45000000, GRV: 300000000, MTP: 40000000,
  OLK: null, OFE: null, OOK: null,
};

/* ============================================================================
   CONFIG LAYER — Achievement status thresholds
   ----------------------------------------------------------------------------
   CEO-approved, 4-tier, as of 21 Sep 2026. Percent-of-target boundaries:
   Green >= 90% · Amber 75-89% · Red 50-74% · Critical < 50%.
   ============================================================================ */
export const ACHIEVEMENT_THRESHOLDS = {
  green: 0.90, amber: 0.75, red: 0.50,   // boundaries; below `red` (50%) is Critical
  thresholdsApproved: true,
};

/* ============================================================================
   CONFIG LAYER — Exception priority mapping
   ----------------------------------------------------------------------------
   PROVISIONAL DEFAULTS — not yet approved. Maps the dashboard's existing,
   already-verified exception categories/severity onto HIGH/MEDIUM/LOW for the
   DSR's simpler executive view. Revenue-shortfall rules activate automatically
   once REVENUE_TARGETS_NGN is populated; they produce nothing until then.
   ============================================================================ */
const PRIORITY_RULES = { reportingGapDaysForHigh: 2 };
const pctFmt = v => (v * 100).toFixed(0) + "%";
const moneyFmt = v => Math.abs(v) >= 1e6 ? "₦" + (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : "₦" + Math.round(v).toLocaleString("en-US");
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dayFmt = iso => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
function shiftISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
// Plain-language descriptions of the data-quality rules, for the executive email.
const DQ_PLAIN = {
  R3: "spreadsheet cells showing errors",
  R4: "payer figures that do not add up to the total",
  R5: "KPIs that do not match the sheet's own figures",
  R6: "more patient survey responses than patients seen",
  R7: "revenue recorded on days with no patients",
  R8: "payer revenue recorded with no patients for that payer",
  R9: "the same figure repeated every day (possible copy-paste)",
  R10: "figures entered in mixed formats (% and plain numbers)",
};

function priorityForReportingGap(days) {
  return days >= PRIORITY_RULES.reportingGapDaysForHigh ? "HIGH" : "MEDIUM";
}


// ---- Month-on-month trend (the "up 12% vs. last month" line on each KPI card) ----
// Only produced when data for the immediately preceding calendar month exists. Compares the same
// number of days (Day 1..N of last month vs Day 1..N of this month) so it is like-for-like.
function totalsForDays(periodId, maxDay) {
  const canon = buildCanonical(loadFromSource(periodId));
  let revenue = 0, attendance = 0, admissions = 0;
  canon.forEach(h => {
    const limited = { ...h, records: h.records.filter(r => Number(r.date.slice(8, 10)) <= maxDay) };
    const t = computeHospitalKPIs(limited).totals;
    revenue += t.revenue ?? 0; attendance += t.attendance ?? 0; admissions += t.admissions ?? 0;
  });
  return { revenue, attendance, admissions, arpe: attendance ? revenue / attendance : null, conversion: attendance ? admissions / attendance : null };
}
function previousMonthId(periodId) {
  const [y, m] = periodId.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function buildTrend(months, periodId, daysElapsed, current) {
  const prevId = previousMonthId(periodId);
  if (!months.includes(prevId)) return null;            // no last-month data yet -> no trend line
  const prev = totalsForDays(prevId, daysElapsed);
  const rel = (cur, old) => (old && cur !== null ? (cur - old) / old : null);
  const mk = (cur, old) => { const r = rel(cur, old); return r === null ? null : { up: r >= 0, text: Math.abs(r * 100).toFixed(0) + "%" }; };
  const conv = current.conversion !== null && prev.conversion !== null ? current.conversion - prev.conversion : null;
  return {
    revenue: mk(current.revenue, prev.revenue),
    attendance: mk(current.attendance, prev.attendance),
    admissions: mk(current.admissions, prev.admissions),
    arpe: mk(current.arpe, prev.arpe),
    conversion: conv === null ? null : { up: conv >= 0, text: Math.abs(conv * 100).toFixed(1) + " pts" },
    achievement: null,   // last month's targets are not stored, so there is nothing comparable
  };
}

/* ============================================================================
   DATA + BUSINESS LOGIC LAYER
   ============================================================================ */
export function computeDSR() {
  const months = getAvailableMonths();
  const periodId = months[months.length - 1];
  const period = derivePeriod(periodId);
  const source = loadFromSource(periodId);
  const canon = buildCanonical(source);
  const kpis = Object.fromEntries(canon.map(h => [h.id, computeHospitalKPIs(h)]));
  const reporting = Object.fromEntries(canon.map(h => [h.id, computeReporting(h, CONFIG.reportingCalendar, period)]));
  const exceptions = generateExceptions(canon, kpis, reporting, period);
  const openEx = exceptions.filter(e => e.status !== "CLOSED");

  // ---- Pacing basis ----
  // period.asOfDate is (latest confirmed data date + 1 day), never the system clock. The last day
  // of real data is therefore asOfDate - 1, and that is the number of days of the month that have
  // been reported (data for 1-17 Sep => Day 17 of 30). Date maths is done in UTC on the ISO string
  // so the result cannot shift with the machine's timezone.
  const [py, pm] = period.id.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const dataThrough = shiftISO(period.asOfDate, -1);
  const daysElapsed = Math.max(1, Math.min(daysInMonth, Number(dataThrough.slice(8, 10))));
  const paceFraction = daysElapsed / daysInMonth;

  // ---- Network Snapshot ----
  let revenue = 0, attendance = 0, admissions = 0;
  canon.forEach(h => { const t = kpis[h.id].totals; revenue += t.revenue ?? 0; attendance += t.attendance ?? 0; admissions += t.admissions ?? 0; });
  const arpe = attendance ? revenue / attendance : null;
  const conversion = attendance ? admissions / attendance : null;

  let networkTarget = 0, targetsKnown = 0, revenueOfTargeted = 0;
  canon.forEach(h => {
    const t = REVENUE_TARGETS_NGN[h.id];
    if (t) { networkTarget += t; targetsKnown++; revenueOfTargeted += kpis[h.id].totals.revenue ?? 0; }
  });
  const networkTargetToDate = networkTarget * paceFraction;
  // Scoped to only the hospitals that have a target — mixing in revenue from untargeted
  // hospitals would inflate this figure against a denominator that never included them.
  const networkAchievement = targetsKnown > 0 ? revenueOfTargeted / networkTargetToDate : null;

  // ---- Reporting Status ----
  const reportingNow = canon.filter(h => reporting[h.id].missing.length === 0);
  const notReporting = canon.filter(h => reporting[h.id].missing.length > 0);

  // ---- Revenue Achievement by Hospital ----
  // "target" shown in the table stays the full monthly figure (the actual agreed target).
  // "pct" (Achievement %) is measured against that target's pace-adjusted, target-to-date value —
  // e.g. Day 18 of 30 = 60% of the monthly target is what "on pace" means today.
  const hospitalAchievement = canon.map(h => {
    const mtd = kpis[h.id].totals.revenue ?? 0;
    const target = REVENUE_TARGETS_NGN[h.id];
    const targetToDate = target ? target * paceFraction : null;
    const dailyTarget = target ? target / daysInMonth : null;
    const pct = targetToDate ? mtd / targetToDate : null;
    let status;
    if (target === null || target === undefined) status = { label: "Target not configured", tone: "neutral" };
    else if (pct >= ACHIEVEMENT_THRESHOLDS.green) status = { label: "On Track", tone: "good" };
    else if (pct >= ACHIEVEMENT_THRESHOLDS.amber) status = { label: "At Risk", tone: "warn" };
    else if (pct >= ACHIEVEMENT_THRESHOLDS.red) status = { label: "Below Target", tone: "bad" };
    else status = { label: "Critical", tone: "critical" };
    return { id: h.id, name: h.name, mtd, target, dailyTarget, targetToDate, pct, status, hasData: reporting[h.id].missing.length < reporting[h.id].due.length };
  });

  // ---- Exceptions Requiring Attention (DSR view — plain language, simplified from the full register) ----
  const dsrExceptions = [];

  // 1. Missing reports
  canon.forEach(h => {
    const rep = reporting[h.id];
    if (rep.missing.length === 0) return;
    const n = rep.missing.length;
    dsrExceptions.push({
      hospital: h.name,
      issue: n === rep.due.length
        ? "No reports received this month."
        : n === 1
          ? `No report received for ${dayFmt(rep.missing[0])}.`
          : `${n} daily reports missing (last report received ${rep.lastSubmitted ? dayFmt(rep.lastSubmitted) : "never"}).`,
      priority: priorityForReportingGap(n),
    });
  });

  // 2. Revenue behind pace
  hospitalAchievement.forEach(h => {
    if (!(h.target && h.pct !== null && h.hasData)) return;
    let word = null, priority = null;
    if (h.pct < ACHIEVEMENT_THRESHOLDS.red) { word = "far behind"; priority = "HIGH"; }
    else if (h.pct < ACHIEVEMENT_THRESHOLDS.amber) { word = "behind"; priority = "HIGH"; }
    else if (h.pct < ACHIEVEMENT_THRESHOLDS.green) { word = "slightly behind"; priority = "MEDIUM"; }
    if (!word) return;
    dsrExceptions.push({
      hospital: h.name,
      issue: `Revenue ${word} target: ${moneyFmt(h.mtd)} earned vs ${moneyFmt(h.targetToDate)} expected by day ${daysElapsed} (${pctFmt(h.pct)}).`,
      priority,
    });
  });

  // 3. Data entries to double-check — ONE line per hospital (the full list lives in the dashboard).
  const dqByHospital = new Map();
  openEx.filter(e => e.category === CATEGORY.DQ).forEach(e => {
    const rec = dqByHospital.get(e.hospital) || { total: 0, byRule: {} };
    rec.total++; rec.byRule[e.rule] = (rec.byRule[e.rule] || 0) + 1;
    dqByHospital.set(e.hospital, rec);
  });
  dqByHospital.forEach((rec, id) => {
    const name = canon.find(h => h.id === id)?.name || id;
    const top = Object.entries(rec.byRule).sort((a, b) => b[1] - a[1])[0][0];
    const what = DQ_PLAIN[top] || "unusual figures";
    dsrExceptions.push({
      hospital: name,
      issue: `${rec.total} data ${rec.total === 1 ? "entry needs" : "entries need"} checking, mainly ${what}.`,
      priority: "LOW",
    });
  });

  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  dsrExceptions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  return {
    asOfDate: period.asOfDate, dataThrough, period, daysElapsed, daysInMonth,
    snapshot: { revenue, attendance, admissions, arpe, conversion, networkAchievement, targetsKnown, totalHospitals: canon.length,
      trend: buildTrend(months, periodId, daysElapsed, { revenue, attendance, admissions, arpe, conversion }) },
    reportingStatus: { reportingCount: reportingNow.length, totalCount: canon.length, notReporting: notReporting.map(h => h.name) },
    hospitalAchievement,
    exceptions: dsrExceptions,
    thresholdsApproved: ACHIEVEMENT_THRESHOLDS.thresholdsApproved,
  };
}
