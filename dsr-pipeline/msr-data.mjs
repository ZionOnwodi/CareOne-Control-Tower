import { CONFIG, buildCanonical, loadFromSource, computeHospitalKPIs, computeReporting, generateExceptions, CATEGORY } from "./engine.mjs";
import { REVENUE_TARGETS_NGN, ACHIEVEMENT_THRESHOLDS, achievementStatus, shiftISO, MON } from "./dsr-data.mjs";

/* ============================================================================
   MONTHLY SITUATION REPORT — one full calendar month, compared with the month before.
   ----------------------------------------------------------------------------
   Same engine, hospitals, targets and status bands as the DSR / WSR (imported, never
   copied). Every figure is recomputed from the raw daily components: revenue is the sum
   of the payer revenues, attendance the sum of the payer attendances, NPS comes from the
   promoter / detractor / indifferent counts. Sheet-reported totals are never used.
   The target is the FULL monthly target (no pro-rating): no hospital has a stated start
   date in the config, so a hospital with only part of a month is flagged, not pro-rated.
   ============================================================================ */

const LAGOS_OFFSET_HOURS = 1;   // WAT is UTC+1 all year
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const num = v => (typeof v === "number" && isFinite(v) ? v : null);
const daysIn = id => { const [y, m] = id.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const monthDates = id => Array.from({ length: daysIn(id) }, (_, i) => `${id}-${String(i + 1).padStart(2, "0")}`);
const shiftMonth = (id, n) => { const [y, m] = id.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
export const monthLabel = id => `${MONTHS_LONG[Number(id.slice(5, 7)) - 1]} ${id.slice(0, 4)}`;
const shortDate = iso => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
export const lagosToday = (now = new Date()) => new Date(now.getTime() + LAGOS_OFFSET_HOURS * 3600e3).toISOString().slice(0, 10);

/** The most recent COMPLETED calendar month before `now`, by the Lagos calendar. */
export function defaultMonth(now = new Date()) { return shiftMonth(lagosToday(now).slice(0, 7), -1); }

/** Throws unless `s` is YYYY-MM for a real month. */
export function validateMonth(s) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new Error(`month must be YYYY-MM (e.g. 2026-10), got "${s}".`);
  return s;
}

// Status bands, in order of severity, with the traffic-light names the MSR uses.
const TIER = { critical: 0, bad: 1, warn: 2, good: 3 };
export const LIGHT = { good: "Green", warn: "Amber", bad: "Red", critical: "Critical", neutral: "Not set" };

// Scorecard weights given by the owner. Only domains with data in the sheets are scored.
export const SCORECARD_WEIGHTS = { financial: 30, clinical: 25, experience: 20, operational: 15, strategic: 10 };

// ---- One month, per hospital, recomputed from raw rows ----
function monthData(id) {
  const dates = monthDates(id);
  const period = { id, start: dates[0], end: dates[dates.length - 1], asOfDate: shiftISO(dates[dates.length - 1], 1) };
  const canon = buildCanonical(loadFromSource(id));
  const kpis = Object.fromEntries(canon.map(h => [h.id, computeHospitalKPIs(h)]));
  const reporting = Object.fromEntries(canon.map(h => [h.id, computeReporting(h, CONFIG.reportingCalendar, period)]));
  const hospitals = Object.fromEntries(canon.map(h => {
    const sub = h.records.filter(r => r.submitted);
    const sum = k => sub.reduce((a, r) => (num(r.f[k]?.value) === null ? a : (a ?? 0) + num(r.f[k].value)), null);
    const t = kpis[h.id].totals, rep = reporting[h.id];
    // TAT: mean of the days it was recorded. A 0 is not a real turnaround time, so it is not averaged.
    const tats = sub.map(r => num(r.f.tat?.value)).filter(v => v !== null && v > 0);
    const tatZeros = sub.filter(r => num(r.f.tat?.value) === 0).length;
    // NPS from raw counts, pooled over the days where BOTH promoters and detractors were recorded
    // (NPS needs detractors; a day with promoters only cannot produce one). Indifferent blank = 0 that day.
    const npsDays = sub.filter(r => num(r.f.prom?.value) !== null && num(r.f.det?.value) !== null);
    const P = npsDays.reduce((a, r) => a + num(r.f.prom.value), 0), D = npsDays.reduce((a, r) => a + num(r.f.det.value), 0);
    const I = npsDays.reduce((a, r) => a + (num(r.f.indiff?.value) ?? 0), 0);
    const submittedDates = sub.map(r => r.date).sort();
    const priv = sum("privRev") ?? 0, hmo = sum("hmoRev") ?? 0, other = (sum("nhiaRev") ?? 0) + (sum("compRev") ?? 0);
    return [h.id, {
      id: h.id, name: h.name,
      revenue: t.revenue ?? 0, privRev: priv, hmoRev: hmo, otherRev: other,
      attendance: t.attendance, newReg: t.newReg, admissions: t.admissions, discharges: t.discharges,
      privAtt: sum("priv"), hmoAtt: sum("hmo"),
      conversion: t.conversion, arpe: t.arpe,
      tat: tats.length ? tats.reduce((a, v) => a + v, 0) / tats.length : null, tatDays: tats.length, tatZeros, tatSum: tats.reduce((a, v) => a + v, 0),
      nps: P + D + I > 0 ? (P - D) / (P + D + I) : null, npsDays: npsDays.length,
      daysSubmitted: sub.length, daysComplete: rep.due.length - rep.missing.length - rep.incomplete.length,
      missing: rep.missing, partial: rep.incomplete, partialDetail: rep.incompleteDetail,
      firstDate: submittedDates[0] ?? null, lastDate: submittedDates[submittedDates.length - 1] ?? null,
    }];
  }));
  return { id, dates, period, canon, kpis, hospitals };
}

// Monday-Sunday weeks, clipped to the month (same week definition as the WSR).
function monthWeeks(dates) {
  const weeks = [];
  dates.forEach(d => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (!weeks.length || dow === 1) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  });
  return weeks.map(w => ({ start: w[0], end: w[w.length - 1], dates: w,
    label: w[0] === w[w.length - 1] ? shortDate(w[0]) : `${Number(w[0].slice(8, 10))}–${shortDate(w[w.length - 1])}` }));
}

/* ============================================================================
   DATA + BUSINESS LOGIC LAYER
   ============================================================================ */
export function computeMSR(monthId = defaultMonth(), { now = new Date() } = {}) {
  validateMonth(monthId);
  const prevId = shiftMonth(monthId, -1);
  const cur = monthData(monthId), prev = monthData(prevId);
  const ids = cur.canon.map(h => h.id);
  const dim = cur.dates.length, prevDim = prev.dates.length;
  const dataThrough = ids.map(id => cur.hospitals[id].lastDate).filter(Boolean).sort().pop() ?? null;

  // ---- Revenue achievement (full monthly target) ----
  const rows = ids.map(id => {
    const h = cur.hospitals[id], p = prev.hospitals[id];
    const target = REVENUE_TARGETS_NGN[id] ?? null;
    const pct = target ? h.revenue / target : null;
    const prevPct = target && p ? p.revenue / target : null;
    const status = achievementStatus(target, pct), prevStatus = achievementStatus(target, prevPct);
    const prevHasData = !!(p && p.daysSubmitted);
    const movement = !prevHasData || pct === null ? null
      : TIER[status.tone] > TIER[prevStatus.tone] ? "Improved" : TIER[status.tone] < TIER[prevStatus.tone] ? "Declined" : "Unchanged";
    return {
      id, name: h.name, revenue: h.revenue, target, pct, variance: target ? h.revenue - target : null,
      prevRevenue: p ? p.revenue : null, prevPct: prevHasData ? prevPct : null,
      momPts: prevHasData && pct !== null && prevPct !== null ? (pct - prevPct) * 100 : null,
      status, prevStatus: prevHasData ? prevStatus : null, movement,
      privShare: h.revenue ? h.privRev / h.revenue : null, hmoShare: h.revenue ? h.hmoRev / h.revenue : null, otherShare: h.revenue ? h.otherRev / h.revenue : null,
      privRev: h.privRev, hmoRev: h.hmoRev, otherRev: h.otherRev,
      daysSubmitted: h.daysSubmitted,
      partialMonth: h.daysSubmitted < dim ? { days: h.daysSubmitted, of: dim, first: h.firstDate, last: h.lastDate } : null,
      // A hospital with NO days last month has no comparison at all (shown as "—"), which is not a partial month.
      prevPartialMonth: p && p.daysSubmitted > 0 && p.daysSubmitted < prevDim ? { days: p.daysSubmitted, of: prevDim, first: p.firstDate, last: p.lastDate } : null,
    };
  });
  const ranked = [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.revenue - a.revenue);
  ranked.forEach((r, i) => { r.rank = i + 1; });

  // ---- Network ----
  const sumOf = (src, k) => ids.reduce((a, id) => a + (src.hospitals[id]?.[k] ?? 0), 0);
  const revenue = sumOf(cur, "revenue"), prevRevenue = sumOf(prev, "revenue");
  const targeted = rows.filter(r => r.target);
  const networkTarget = targeted.reduce((a, r) => a + r.target, 0);
  const networkAchievement = networkTarget ? targeted.reduce((a, r) => a + r.revenue, 0) / networkTarget : null;
  const prevNetworkAchievement = networkTarget && prevRevenue ? targeted.reduce((a, r) => a + (r.prevRevenue ?? 0), 0) / networkTarget : null;
  const networkOf = src => {
    const attendance = sumOf(src, "attendance"), admissions = sumOf(src, "admissions"), rev = sumOf(src, "revenue");
    const npsList = ids.map(id => src.hospitals[id]?.nps).filter(v => v !== null && v !== undefined);
    const tatSum = sumOf(src, "tatSum"), tatDays = sumOf(src, "tatDays");
    const complete = sumOf(src, "daysComplete"), possible = ids.length * src.dates.length;
    const priv = sumOf(src, "privRev"), hmo = sumOf(src, "hmoRev"), other = sumOf(src, "otherRev");
    return {
      revenue: rev, attendance, admissions, newReg: sumOf(src, "newReg"), discharges: sumOf(src, "discharges"),
      privAtt: sumOf(src, "privAtt"), hmoAtt: sumOf(src, "hmoAtt"),
      arpe: attendance ? rev / attendance : null, conversion: attendance ? admissions / attendance : null,
      nps: npsList.length ? npsList.reduce((a, v) => a + v, 0) / npsList.length : null, npsHospitals: npsList.length,
      tat: tatDays ? tatSum / tatDays : null, tatHospitals: ids.filter(id => src.hospitals[id]?.tatDays).length,
      compliance: possible ? complete / possible : null, daysComplete: complete, daysPossible: possible,
      privShare: rev ? priv / rev : null, hmoShare: rev ? hmo / rev : null, otherShare: rev ? other / rev : null,
    };
  };
  const net = networkOf(cur), prevNet = networkOf(prev);
  const prevHasData = ids.some(id => prev.hospitals[id]?.daysSubmitted);
  // Like-for-like: only hospitals that reported the whole of last month (a part-month last month inflates growth).
  const fullPrev = rows.filter(r => r.prevPct !== null && !r.prevPartialMonth);
  const lflNow = fullPrev.reduce((a, r) => a + r.revenue, 0), lflPrev = fullPrev.reduce((a, r) => a + r.prevRevenue, 0);
  const likeForLike = prevHasData && lflPrev ? { change: (lflNow - lflPrev) / lflPrev, hospitals: fullPrev.length, now: lflNow, prev: lflPrev } : null;
  const prevPartialHospitals = rows.filter(r => r.prevPartialMonth).map(r => ({ name: r.name, days: r.prevPartialMonth.days, of: r.prevPartialMonth.of, first: r.prevPartialMonth.first }));

  // ---- Performance detail per hospital (month vs last month) ----
  const METRICS = [
    ["attendance", "Attendance", "int"], ["newReg", "New registrations", "int"], ["privAtt", "Private attendance", "int"],
    ["hmoAtt", "HMO attendance", "int"], ["admissions", "Admissions", "int"], ["conversion", "Conversion rate", "pct"],
    ["discharges", "Discharges", "int"], ["tat", "Average TAT (mins)", "dec"], ["nps", "NPS", "nps"], ["arpe", "ARPE (₦)", "money"],
  ];
  const detail = ranked.map(r => ({
    id: r.id, name: r.name,
    metrics: METRICS.map(([k, label, fmt]) => {
      const a = cur.hospitals[r.id]?.[k] ?? null, b = prev.hospitals[r.id]?.daysSubmitted ? prev.hospitals[r.id][k] ?? null : null;
      return { key: k, label, fmt, cur: a, prev: b, change: a !== null && b !== null ? (fmt === "pct" || fmt === "nps" ? (a - b) * 100 : b ? (a - b) / b : null) : null };
    }),
    notes: [
      cur.hospitals[r.id].npsDays === 0 ? "NPS not captured (no day with both promoters and detractors recorded)." : null,
      cur.hospitals[r.id].tatDays === 0 ? "TAT not captured this month." : null,
      cur.hospitals[r.id].tatZeros ? `${cur.hospitals[r.id].tatZeros} day(s) with TAT entered as 0 were not averaged.` : null,
      r.prevPartialMonth ? `Last month is partial: ${r.prevPartialMonth.days} of ${r.prevPartialMonth.of} days reported (from ${shortDate(r.prevPartialMonth.first)}).` : null,
    ].filter(Boolean),
  }));

  // ---- Scorecard (domains with data only) ----
  const fastestTat = Math.min(...ids.map(id => cur.hospitals[id].tat).filter(v => v !== null));
  const scorecard = ranked.map(r => {
    const h = cur.hospitals[r.id];
    const scores = {
      financial: r.pct !== null ? Math.min(r.pct, 1) * 100 : null,          // achievement vs full monthly target, capped at 100
      experience: h.nps !== null ? (h.nps + 1) / 2 * 100 : null,             // NPS -100..+100 rescaled to 0..100
      operational: h.tat !== null && isFinite(fastestTat) ? fastestTat / h.tat * 100 : null, // fastest TAT in the network = 100
    };
    const used = Object.keys(scores).filter(k => scores[k] !== null);
    const w = used.reduce((a, k) => a + SCORECARD_WEIGHTS[k], 0);
    return { id: r.id, name: r.name, scores, used, composite: w ? used.reduce((a, k) => a + scores[k] * SCORECARD_WEIGHTS[k], 0) / w : null };
  }).sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1));
  scorecard.forEach((s, i) => { s.rank = i + 1; });

  // ---- Trend: week-by-week revenue inside the month ----
  const weeks = monthWeeks(cur.dates);
  const weekRevenue = id => weeks.map(w => {
    const recs = cur.canon.find(h => h.id === id).records.filter(r => r.submitted && w.dates.includes(r.date));
    const k = computeHospitalKPIs({ records: recs }).totals.revenue;
    return k ?? 0;
  });
  const weekly = { weeks, rows: ranked.map(r => ({ id: r.id, name: r.name, values: weekRevenue(r.id), total: r.revenue })) };
  weekly.network = weeks.map((_, i) => weekly.rows.reduce((a, r) => a + r.values[i], 0));

  // ---- Data quality: R4 for the month (never blocks the run) ----
  const noGaps = Object.fromEntries(cur.canon.map(h => [h.id, { missing: [], incomplete: [], calendarConfirmed: true }]));
  const r4 = generateExceptions(cur.canon, cur.kpis, noGaps, cur.period)
    .filter(e => e.rule === "R4" && e.category === CATEGORY.DQ)
    .map(e => ({ hospital: cur.hospitals[e.hospital].name, date: e.dates[0], issue: e.issue.replace(/ on \d{4}-\d{2}-\d{2}$/, ""), detail: e.current }))
    .sort((a, b) => a.hospital.localeCompare(b.hospital) || a.date.localeCompare(b.date));

  // ---- Reporting compliance ----
  const compliance = ranked.map(r => {
    const h = cur.hospitals[r.id];
    return { id: r.id, name: r.name, complete: h.daysComplete, submitted: h.daysSubmitted, partial: h.partial, missing: h.missing, of: dim, pct: h.daysComplete / dim };
  });

  // ---- Insights (numbers only) ----
  const insights = [];
  const withPct = ranked.filter(r => r.pct !== null);
  if (withPct.length) {
    const top = withPct[0], bottom = withPct[withPct.length - 1];
    insights.push(`${top.name} led the network at ${(top.pct * 100).toFixed(1)}% of its monthly target; ${bottom.name} was lowest at ${(bottom.pct * 100).toFixed(1)}%.`);
  }
  if (prevHasData && prevRevenue) {
    const ch = (revenue - prevRevenue) / prevRevenue;
    insights.push(`Network revenue was ₦${Math.round(revenue).toLocaleString("en-US")}, ${ch >= 0 ? "up" : "down"} ${Math.abs(ch * 100).toFixed(1)}% on ${monthLabel(prevId)} (₦${Math.round(prevRevenue).toLocaleString("en-US")})` +
      (likeForLike && prevPartialHospitals.length
        ? `; ${prevPartialHospitals.length} hospital${prevPartialHospitals.length > 1 ? "s" : ""} reported only part of ${monthLabel(prevId)}, so like-for-like across the ${likeForLike.hospitals} with a full month the change is ${likeForLike.change >= 0 ? "+" : "−"}${Math.abs(likeForLike.change * 100).toFixed(1)}%.`
        : "."));
  }
  const fullBoth = ranked.filter(r => r.momPts !== null && !r.prevPartialMonth);
  if (fullBoth.length >= 2) {
    const up = [...fullBoth].sort((a, b) => b.momPts - a.momPts)[0], down = [...fullBoth].sort((a, b) => a.momPts - b.momPts)[0];
    if (up.momPts > 0) insights.push(`Biggest improver: ${up.name}, +${up.momPts.toFixed(1)} pts of target vs ${monthLabel(prevId)} (${(up.prevPct * 100).toFixed(1)}% → ${(up.pct * 100).toFixed(1)}%).`);
    if (down.momPts < 0) insights.push(`Biggest decline: ${down.name}, −${Math.abs(down.momPts).toFixed(1)} pts of target vs ${monthLabel(prevId)} (${(down.prevPct * 100).toFixed(1)}% → ${(down.pct * 100).toFixed(1)}%).`);
  }
  if (prevHasData && net.privShare !== null && prevNet.privShare !== null) {
    const d = (net.privShare - prevNet.privShare) * 100;
    if (Math.abs(d) >= 1) insights.push(`Payer mix shifted ${d > 0 ? "towards private" : "towards HMO/other"} payers: private revenue was ${(net.privShare * 100).toFixed(1)}% of the total vs ${(prevNet.privShare * 100).toFixed(1)}% in ${monthLabel(prevId)}.`);
  }
  const beatButFell = ranked.filter(r => r.pct !== null && r.pct >= 1 && !r.prevPartialMonth && prev.hospitals[r.id]?.attendance && cur.hospitals[r.id].attendance < prev.hospitals[r.id].attendance);
  if (beatButFell.length) insights.push(`Met target but saw fewer patients than in ${monthLabel(prevId)}: ${beatButFell.map(r => `${r.name} (attendance ${prev.hospitals[r.id].attendance} → ${cur.hospitals[r.id].attendance})`).join("; ")}.`);

  // ---- Risks and actions (only items supported by the data) ----
  const redOrCritical = ranked.filter(r => r.status.tone === "bad" || r.status.tone === "critical");
  const belowTarget = ranked.filter(r => r.pct !== null && r.pct < 1);
  const focus = [];
  const crit = ranked.filter(r => r.status.tone === "critical");
  if (crit.length) focus.push(`Revenue recovery at ${crit.length} Critical hospital${crit.length > 1 ? "s" : ""} (below 50% of target): ${crit.map(r => r.name).join(", ")}; combined shortfall ₦${Math.round(-crit.reduce((a, r) => a + r.variance, 0)).toLocaleString("en-US")}.`);
  const decliners = fullBoth.filter(r => r.momPts <= -10);
  if (decliners.length) focus.push(`Find out why achievement fell by 10 pts or more vs ${monthLabel(prevId)}: ${decliners.map(r => `${r.name} (−${Math.abs(r.momPts).toFixed(1)} pts)`).join(", ")}.`);
  const lowCompliance = compliance.filter(c => c.pct < 0.9);
  if (lowCompliance.length) focus.push(`Reporting discipline: ${lowCompliance.length} hospital${lowCompliance.length > 1 ? "s" : ""} filed complete reports on under 90% of days (${lowCompliance.map(c => `${c.name} ${c.complete}/${c.of}`).join(", ")}).`);
  const r4Hosp = [...new Set(r4.map(x => x.hospital))];
  if (r4.length) focus.push(`Data quality: ${r4.length} day${r4.length > 1 ? "s" : ""} where payer figures do not add up to the total (${r4Hosp.join(", ")}); reconcile at source.`);

  return {
    mode: "monthly", monthId, prevId, monthLabel: monthLabel(monthId), prevLabel: monthLabel(prevId),
    periodStart: cur.dates[0], periodEnd: cur.dates[dim - 1], daysInMonth: dim, prevDaysInMonth: prevDim,
    generatedOn: lagosToday(now), dataThrough,
    dataReadAt: loadFromSource(monthId).meta?.readAt ?? null,
    hospitalCount: ids.length, configuredHospitalCount: CONFIG.hospitals.length,
    snapshot: {
      revenue, prevRevenue, networkTarget, networkAchievement, prevNetworkAchievement,
      momRevenue: prevHasData && prevRevenue ? (revenue - prevRevenue) / prevRevenue : null,
      ...Object.fromEntries(Object.entries(net).filter(([k]) => k !== "revenue")),
    },
    network: net, prevNetwork: prevHasData ? prevNet : null, likeForLike, prevPartialHospitals,
    missingTail: dataThrough && dataThrough < cur.dates[dim - 1] ? cur.dates.filter(d => d > dataThrough) : [],
    achievement: ranked, achievers: { top: withPct.slice(0, 3), bottom: withPct.slice(-3).reverse(), atOrAbove: withPct.filter(r => r.pct >= 1).length, withTarget: withPct.length },
    bands: ACHIEVEMENT_THRESHOLDS,
    detail, scorecard, weekly, compliance, r4, insights: insights.slice(0, 5),
    risks: { redOrCritical, belowTarget, focus },
  };
}
