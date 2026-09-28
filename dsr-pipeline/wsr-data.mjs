import { buildCanonical, loadFromSource, computeHospitalKPIs, generateExceptions, CATEGORY } from "./engine.mjs";
import {
  REVENUE_TARGETS_NGN, ACHIEVEMENT_THRESHOLDS, achievementStatus, priorityForReportingGap,
  shiftISO, dayFmt, pctFmt, moneyFmt, DQ_PLAIN, MON,
} from "./dsr-data.mjs";

/* ============================================================================
   WEEKLY SITUATION REPORT — one Monday-to-Sunday week.
   ----------------------------------------------------------------------------
   Uses the same engine and the same targets/thresholds as the DSR. A week can
   cross a month boundary, so every month the week touches is loaded and records
   are filtered by date. It never assumes the week sits inside one month.
   ============================================================================ */

const LAGOS_OFFSET_HOURS = 1;   // WAT is UTC+1 all year (no daylight saving)
const isoDate = d => d.toISOString().slice(0, 10);
const weekdayOf = iso => new Date(iso + "T00:00:00Z").getUTCDay();   // 0 = Sunday, 1 = Monday
const daysInMonthOf = iso => { const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const weekDates = start => Array.from({ length: 7 }, (_, i) => shiftISO(start, i));

/** Monday of the most recent completed Mon-Sun week before `now`, by the Lagos calendar. */
export function defaultWeekStart(now = new Date()) {
  const lagosToday = isoDate(new Date(now.getTime() + LAGOS_OFFSET_HOURS * 3600e3));
  const thisMonday = shiftISO(lagosToday, -((weekdayOf(lagosToday) + 6) % 7));
  return shiftISO(thisMonday, -7);
}

/** Throws unless `s` is a real YYYY-MM-DD date that falls on a Monday. */
export function validateWeekStart(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`week_start must be YYYY-MM-DD, got "${s}".`);
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d) || isoDate(d) !== s) throw new Error(`week_start "${s}" is not a real date.`);
  if (d.getUTCDay() !== 1) throw new Error(`week_start "${s}" is a ${d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}, not a Monday.`);
  return s;
}

/** "21–27 Sep 2026", "28 Sep – 4 Oct 2026", "29 Dec 2025 – 4 Jan 2026". */
export function shortRange(start, end) {
  const [ys, ms, ds] = start.split("-").map(Number), [ye, me, de] = end.split("-").map(Number);
  if (ys !== ye) return `${ds} ${MON[ms - 1]} ${ys} – ${de} ${MON[me - 1]} ${ye}`;
  if (ms !== me) return `${ds} ${MON[ms - 1]} – ${de} ${MON[me - 1]} ${ye}`;
  return `${ds}–${de} ${MON[me - 1]} ${ye}`;
}

// Canonical hospitals holding ONLY the records dated inside `dates`. Each touched month is
// canonicalised on its own (as the dashboard does), then the week's records are merged.
function canonForDates(dates) {
  const want = new Set(dates);
  const months = [...new Set(dates.map(d => d.slice(0, 7)))];
  const byHospital = new Map();
  months.forEach(monthId => {
    buildCanonical(loadFromSource(monthId)).forEach(h => {
      const cur = byHospital.get(h.id) || { ...h, records: [] };
      cur.records = cur.records.concat(h.records.filter(r => want.has(r.date)));
      byHospital.set(h.id, cur);
    });
  });
  const canon = [...byHospital.values()];
  canon.forEach(h => h.records.sort((a, b) => a.date.localeCompare(b.date)));
  return { canon, months };
}

function networkTotals(canon, kpis) {
  let revenue = 0, attendance = 0, admissions = 0;
  canon.forEach(h => { const t = kpis[h.id].totals; revenue += t.revenue ?? 0; attendance += t.attendance ?? 0; admissions += t.admissions ?? 0; });
  return { revenue, attendance, admissions, arpe: attendance ? revenue / attendance : null, conversion: attendance ? admissions / attendance : null };
}

// "vs. last week" — the previous Mon-Sun week, whole week against whole week.
function buildWeekTrend(weekStart, current) {
  const { canon } = canonForDates(weekDates(shiftISO(weekStart, -7)));
  if (!canon.some(h => h.records.some(r => r.submitted))) return null;   // no data that week -> no trend line
  const prev = networkTotals(canon, Object.fromEntries(canon.map(h => [h.id, computeHospitalKPIs(h)])));
  const rel = (cur, old) => (old && cur !== null ? (cur - old) / old : null);
  const mk = (cur, old) => { const r = rel(cur, old); return r === null ? null : { up: r >= 0, text: Math.abs(r * 100).toFixed(0) + "%" }; };
  const conv = current.conversion !== null && prev.conversion !== null ? current.conversion - prev.conversion : null;
  return {
    revenue: mk(current.revenue, prev.revenue),
    attendance: mk(current.attendance, prev.attendance),
    admissions: mk(current.admissions, prev.admissions),
    arpe: mk(current.arpe, prev.arpe),
    conversion: conv === null ? null : { up: conv >= 0, text: Math.abs(conv * 100).toFixed(1) + " pts" },
    achievement: null,   // same as the DSR: no comparable history of targets is stored
  };
}

/* ============================================================================
   DATA + BUSINESS LOGIC LAYER
   ============================================================================ */
export function computeWSR(weekStart = defaultWeekStart()) {
  validateWeekStart(weekStart);
  const dates = weekDates(weekStart);
  const weekEnd = dates[6];
  const { canon, months } = canonForDates(dates);
  const kpis = Object.fromEntries(canon.map(h => [h.id, computeHospitalKPIs(h)]));

  // ---- Reporting: a hospital counts only if all 7 days are present ----
  const missingByHospital = Object.fromEntries(canon.map(h => {
    const have = new Set(h.records.filter(r => r.submitted).map(r => r.date));
    return [h.id, dates.filter(d => !have.has(d))];
  }));
  const reportingNow = canon.filter(h => missingByHospital[h.id].length === 0);
  const notReporting = canon.filter(h => missingByHospital[h.id].length > 0);

  // ---- Network Snapshot (the 7 days only) ----
  const totals = networkTotals(canon, kpis);

  // ---- Weekly target: each day contributes (that month's target / days in that month) ----
  const weeklyTargetFor = id => {
    const t = REVENUE_TARGETS_NGN[id];
    return t ? dates.reduce((sum, d) => sum + t / daysInMonthOf(d), 0) : null;
  };
  const hospitalAchievement = canon.map(h => {
    const weekRevenue = kpis[h.id].totals.revenue ?? 0;
    const target = REVENUE_TARGETS_NGN[h.id];
    const weeklyTarget = weeklyTargetFor(h.id);
    const pct = weeklyTarget ? weekRevenue / weeklyTarget : null;
    return { id: h.id, name: h.name, weekRevenue, target, weeklyTarget, pct, status: achievementStatus(target, pct),
      hasData: missingByHospital[h.id].length < dates.length };
  });
  let networkWeeklyTarget = 0, targetsKnown = 0, revenueOfTargeted = 0;
  hospitalAchievement.forEach(h => { if (h.weeklyTarget) { networkWeeklyTarget += h.weeklyTarget; targetsKnown++; revenueOfTargeted += h.weekRevenue; } });
  const networkAchievement = targetsKnown > 0 ? revenueOfTargeted / networkWeeklyTarget : null;

  // ---- Exceptions Requiring Attention: same three types as the DSR, scoped to the week ----
  const wsrExceptions = [];

  // 1. Missing reports — names the missing dates.
  canon.forEach(h => {
    const miss = missingByHospital[h.id];
    if (miss.length === 0) return;
    wsrExceptions.push({
      hospital: h.name,
      issue: miss.length === dates.length
        ? "No reports received this week."
        : miss.length === 1
          ? `No report received for ${dayFmt(miss[0])}.`
          : `${miss.length} daily reports missing: ${miss.map(dayFmt).join(", ")}.`,
      priority: priorityForReportingGap(miss.length),
    });
  });

  // 2. Revenue behind the weekly target
  hospitalAchievement.forEach(h => {
    if (!(h.weeklyTarget && h.pct !== null && h.hasData)) return;
    let word = null, priority = null;
    if (h.pct < ACHIEVEMENT_THRESHOLDS.red) { word = "far behind"; priority = "HIGH"; }
    else if (h.pct < ACHIEVEMENT_THRESHOLDS.amber) { word = "behind"; priority = "HIGH"; }
    else if (h.pct < ACHIEVEMENT_THRESHOLDS.green) { word = "slightly behind"; priority = "MEDIUM"; }
    if (!word) return;
    wsrExceptions.push({
      hospital: h.name,
      issue: `Revenue ${word} weekly target: ${moneyFmt(h.weekRevenue)} earned vs ${moneyFmt(h.weeklyTarget)} weekly target (${pctFmt(h.pct)}).`,
      priority,
    });
  });

  // 3. Data entries to double-check — engine's data-quality rules run over the week's records only.
  const noGaps = Object.fromEntries(canon.map(h => [h.id, { missing: [], incomplete: [], calendarConfirmed: true }]));
  const dq = generateExceptions(canon, kpis, noGaps, { asOfDate: shiftISO(weekEnd, 1) })
    .filter(e => e.status !== "CLOSED" && e.category === CATEGORY.DQ && e.dates.some(d => dates.includes(d)));
  const dqByHospital = new Map();
  dq.forEach(e => {
    const rec = dqByHospital.get(e.hospital) || { total: 0, byRule: {} };
    rec.total++; rec.byRule[e.rule] = (rec.byRule[e.rule] || 0) + 1;
    dqByHospital.set(e.hospital, rec);
  });
  dqByHospital.forEach((rec, id) => {
    const name = canon.find(h => h.id === id)?.name || id;
    const top = Object.entries(rec.byRule).sort((a, b) => b[1] - a[1])[0][0];
    wsrExceptions.push({
      hospital: name,
      issue: `${rec.total} data ${rec.total === 1 ? "entry needs" : "entries need"} checking, mainly ${DQ_PLAIN[top] || "unusual figures"}.`,
      priority: "LOW",
    });
  });

  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  wsrExceptions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  return {
    weekStart, weekEnd, dates, monthsLoaded: months,
    rangeLabel: shortRange(weekStart, weekEnd),
    snapshot: { ...totals, networkAchievement, targetsKnown, totalHospitals: canon.length,
      trend: buildWeekTrend(weekStart, totals) },
    reportingStatus: { reportingCount: reportingNow.length, totalCount: canon.length, notReporting: notReporting.map(h => h.name) },
    missingByHospital: Object.fromEntries(canon.map(h => [h.name, missingByHospital[h.id]])),
    missingSunday: canon.filter(h => missingByHospital[h.id].includes(weekEnd)).map(h => ({
      name: h.name, reportedOtherDays: missingByHospital[h.id].length < dates.length })),
    hospitalAchievement,
    exceptions: wsrExceptions,
    thresholdsApproved: ACHIEVEMENT_THRESHOLDS.thresholdsApproved,
  };
}
