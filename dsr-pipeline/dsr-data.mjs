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
  ULT: 200000000, FHM: 10000000, MFM: null, NLB: null, ROD: 40000000, TAL: 40000000, HOS: 45000000, GRV: null, MTP: null,
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

function priorityForReportingGap(days) {
  return days >= PRIORITY_RULES.reportingGapDaysForHigh ? "HIGH" : "MEDIUM";
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
  // "Days elapsed" is derived from period.asOfDate (latest confirmed data + 1 day), never the
  // system clock — consistent with the rest of this engine's rule of only trusting data it has
  // actually seen. A hospital exactly on schedule shows 100% against its OWN target-to-date.
  const [py, pm] = period.id.split("-").map(Number);
  const daysInMonth = new Date(py, pm, 0).getDate();
  const daysElapsed = Math.max(1, Math.min(daysInMonth, new Date(period.asOfDate + "T00:00:00").getDate() - 1));
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
    const pct = targetToDate ? mtd / targetToDate : null;
    let status;
    if (target === null || target === undefined) status = { label: "Target not configured", tone: "neutral" };
    else if (pct >= ACHIEVEMENT_THRESHOLDS.green) status = { label: "On Track", tone: "good" };
    else if (pct >= ACHIEVEMENT_THRESHOLDS.amber) status = { label: "At Risk", tone: "warn" };
    else if (pct >= ACHIEVEMENT_THRESHOLDS.red) status = { label: "Below Target", tone: "bad" };
    else status = { label: "Critical", tone: "critical" };
    return { id: h.id, name: h.name, mtd, target, targetToDate, pct, status, hasData: reporting[h.id].missing.length < reporting[h.id].due.length };
  });

  // ---- Exceptions Requiring Attention (DSR view — simplified from the full register) ----
  const dsrExceptions = [];
  canon.forEach(h => {
    const rep = reporting[h.id];
    if (rep.missing.length > 0) {
      const days = rep.missing.length;
      dsrExceptions.push({
        hospital: h.name,
        issue: days === rep.due.length
          ? `Not reporting — no data submitted all period`
          : `Not reporting — ${days} day${days > 1 ? "s" : ""} missing (last: ${rep.lastSubmitted || "none"})`,
        priority: priorityForReportingGap(days),
      });
    }
  });
  // Revenue-shortfall exceptions — real thresholds now active.
  hospitalAchievement.forEach(h => {
    if (h.target && h.pct !== null && h.hasData) {
      if (h.pct < ACHIEVEMENT_THRESHOLDS.red) {
        dsrExceptions.push({ hospital: h.name, issue: `Revenue CRITICAL — ${pctFmt(h.pct)} of target-to-date`, priority: "HIGH" });
      } else if (h.pct < ACHIEVEMENT_THRESHOLDS.amber) {
        dsrExceptions.push({ hospital: h.name, issue: `Revenue RED — ${pctFmt(h.pct)} of target-to-date`, priority: "HIGH" });
      } else if (h.pct < ACHIEVEMENT_THRESHOLDS.green) {
        dsrExceptions.push({ hospital: h.name, issue: `Revenue AMBER — ${pctFmt(h.pct)} of target-to-date`, priority: "MEDIUM" });
      }
    }
  });
  // Surface a few of the highest-value data-quality exceptions too (not the full 30+ register —
  // this is an executive view; the full register lives in the dashboard's Exceptions tab).
  openEx.filter(e => e.category === CATEGORY.DQ).slice(0, 3).forEach(e => {
    const hospName = canon.find(h => h.id === e.hospital)?.name || e.hospital;
    dsrExceptions.push({ hospital: hospName, issue: e.issue, priority: "LOW" });
  });
  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  dsrExceptions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  return {
    asOfDate: period.asOfDate, period, daysElapsed, daysInMonth,
    snapshot: { revenue, attendance, admissions, arpe, conversion, networkAchievement, targetsKnown, totalHospitals: canon.length },
    reportingStatus: { reportingCount: reportingNow.length, totalCount: canon.length, notReporting: notReporting.map(h => h.name) },
    hospitalAchievement,
    exceptions: dsrExceptions,
    thresholdsApproved: ACHIEVEMENT_THRESHOLDS.thresholdsApproved,
  };
}
