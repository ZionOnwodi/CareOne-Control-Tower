// Renders the Daily Situation Report as an HTML email that follows the approved design template.
// The same template renders the Weekly Situation Report with { mode: "weekly" }; the default is "daily".
// { mode: "monthly" } renders the Monthly Situation Report (renderMonthlyEmail, at the end of this file).
//
// IMAGES: every image (logo, icons) is loaded by public HTTPS URL from the repo's /email-assets folder,
// which GitHub Pages serves (.github/workflows/email-assets-pages.yml). Nothing is attached to the
// message. Never use cid: or base64 data: URIs (Gmail blocks data: images).
// The connected Gmail assistant tool strips all <img> tags, so this HTML must be sent through SMTP
// (send-email.mjs) — not through that tool.
//
// STYLE RULES (email clients drop a lot): longhand CSS only (no `font:` / `background:` shorthand),
// coloured cells use BOTH a bgcolor attribute and background-color, pills are one-cell tables,
// no emoji, no gradients.

/** Where GitHub Pages serves the repo's /email-assets folder. */
export const EMAIL_ASSET_BASE = "https://ziononwodi.github.io/CareOne-Control-Tower/email-assets";

/** Image name used in this template -> file in /email-assets. */
export const EMAIL_IMAGES = {
  "logo-header": "logo-control-tower.png",
  "badge-chart": "icon-section-chart.png",
  "badge-hospital": "icon-section-hospital.png",
  "badge-alert": "icon-section-alert.png",
  "kpi-revenue": "icon-revenue.png",
  "kpi-attendance": "icon-attendance.png",
  "kpi-admissions": "icon-admissions.png",
  "kpi-arpe": "icon-arpe.png",
  "kpi-conversion": "icon-conversion.png",
  "kpi-achievement": "icon-achievement.png",
  "wf-eye": "icon-see-early.png",
  "wf-alert": "icon-escalate-fast.png",
  "wf-gear": "icon-act-decisively.png",
  "wf-check": "icon-close-completely.png",
  "cal": "icon-calendar.png",
  "rs-hospital": "icon-hospitals-reporting.png",
  "rs-alert": "icon-not-reporting.png",
  "heartbeat": "icon-heartbeat.png",
};

function imgUrl(name) {
  if (!EMAIL_IMAGES[name]) throw new Error(`No hosted image registered for "${name}" (add it to EMAIL_IMAGES)`);
  return `${EMAIL_ASSET_BASE}/${EMAIL_IMAGES[name]}`;
}

// ---- palette (from the template) ----
const RED = "#D31E24", RED_DEEP = "#A61B14", NAVY = "#14213D", INK = "#1F2937", DIM = "#6B7787";
const LINE = "#E6E9EE", HEAD_BG = "#EEF1F5", PAGE = "#F4F6F8", WHITE = "#FFFFFF";
const PINK = "#FDF1F1", PINK_LINE = "#F6D5D5";
const AMBER_TEXT = "#B45309";
const GREEN = "#159A5B", AMBER = "#F0A81C", GRAY_DOT = "#A7B0BC";
const FONT = "font-family:Arial,Helvetica,sans-serif;";

const T = (size, weight, color, extra = "") => `${FONT}font-size:${size}px;font-weight:${weight};color:${color};${extra}`;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = v => v === null || v === undefined ? "—" : "₦" + Math.round(v).toLocaleString("en-US");
const num = v => v === null || v === undefined ? "—" : Math.round(v).toLocaleString("en-US");
const pct0 = v => v === null || v === undefined ? "—" : Math.round(v * 100) + "%";
const pct1 = v => v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${d} ${MONTHS[m - 1]} ${y}`;
}
// "Mon 21 – Sun 27 September 2026" (the month/year are only repeated when the week crosses them).
function rangeDate(startIso, endIso) {
  const [ys, ms, ds] = startIso.split("-").map(Number), [ye, me, de] = endIso.split("-").map(Number);
  const wd = (y, m, d) => WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3);
  const left = ys !== ye ? `${ds} ${MONTHS[ms - 1]} ${ys}` : ms !== me ? `${ds} ${MONTHS[ms - 1]}` : `${ds}`;
  return `${wd(ys, ms, ds)} ${left} – ${wd(ye, me, de)} ${de} ${MONTHS[me - 1]} ${ye}`;
}

const img = (name, w, h, alt = "") =>
  `<img src="${imgUrl(name)}" width="${w}" height="${h}" alt="${esc(alt)}" style="display:block;border:0;outline:none;width:${w}px;height:${h}px;">`;

// One-cell-table pill (Gmail keeps table-cell backgrounds; it drops them on spans).
function pill(bg, fg, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;"><tr>
<td bgcolor="${bg}" align="center" style="background-color:${bg};border-radius:11px;padding:4px 13px;${T(11.5, 700, fg, "line-height:14px;white-space:nowrap;")}"><font color="${fg}">${esc(label)}</font></td></tr></table>`;
}
const priorityPill = p => p === "HIGH" ? pill(RED, WHITE, "High") : p === "MEDIUM" ? pill("#F6B93B", "#3A2A00", "Medium") : pill("#E2E5E9", INK, "Low");

// Icon cell whose size never depends on the td width attribute (Gmail's mobile app ignores it):
// explicit inline width + min-width, and the gap to the text is real padding. `w + gap` equals the
// width attribute, so desktop spacing is unchanged.
const iconCell = (name, w, h, gap, cls = "") =>
  `<td valign="middle" width="${w + gap}"${cls ? ` class="${cls}"` : ""} style="width:${w}px;min-width:${w}px;padding-right:${gap}px;">${img(name, w, h, "")}</td>`;

// Section heading: red badge icon + title + short red underline (the underline sits in the text cell,
// directly under the title, so it can never drift under the badge).
function sectionHead(badge, title, color = NAVY) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${iconCell(badge, 34, 34, 12)}
<td valign="middle" align="left" style="text-align:left;">
  <div style="${T(15, 700, color, "letter-spacing:0.4px;line-height:20px;")}">${esc(title)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="62" height="3" bgcolor="${RED}" style="background-color:${RED};width:62px;height:3px;font-size:1px;line-height:3px;">&nbsp;</td></tr></table>
</td></tr></table>`;
}

function kpiCard({ icon, label, value, trend }, trendLabel = "vs. last month") {
  const trendHtml = trend
    ? `<div style="${T(12, 700, trend.up ? GREEN : RED, "line-height:16px;padding-top:3px;")}">${trend.up ? "&uarr;" : "&darr;"} ${esc(trend.text)} <span style="${T(12, 400, DIM)}">${trendLabel}</span></div>`
    : "";
  return `
  <td width="33.33%" valign="top" style="padding:0 5px 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;">
      <tr><td bgcolor="${WHITE}" style="background-color:${WHITE};border-radius:8px;padding:14px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          ${iconCell(icon, 48, 48, 12)}
          <td valign="middle">
            <div style="${T(12.5, 400, INK, "line-height:16px;")}">${esc(label)}</div>
            <div style="${T(20, 700, NAVY, "line-height:26px;padding-top:3px;")}">${value}</div>
            ${trendHtml}
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td>`;
}

function kpiCardMobile({ icon, label, value, trend }, trendLabel = "vs. last month") {
  const trendHtml = trend
    ? `<div style="${T(11, 700, trend.up ? GREEN : RED, "line-height:14px;padding-top:3px;")}">${trend.up ? "&uarr;" : "&darr;"} ${esc(trend.text)} <span style="${T(11, 400, DIM)}">${trendLabel}</span></div>`
    : "";
  return `
  <td width="50%" valign="top" align="left" bgcolor="${WHITE}" style="width:50%;background-color:${WHITE};border:1px solid ${LINE};border-radius:8px;padding:12px 10px;text-align:left;">
    ${img(icon, 32, 32, "")}
    <div style="${T(12, 400, INK, "line-height:15px;padding-top:8px;")}">${esc(label)}</div>
    <div style="${T(17, 700, NAVY, "line-height:22px;padding-top:2px;white-space:nowrap;")}">${value}</div>
    ${trendHtml}
  </td>`;
}

const th = (label, align = "left", cls = "") =>
  `<td bgcolor="${HEAD_BG}" align="${align}"${cls ? ` class="${cls}"` : ""} style="background-color:${HEAD_BG};padding:11px 10px;${T(12, 400, INK, "line-height:15px;")}">${label}</td>`;
const cell = (extra = "") => `padding:11px 10px;border-bottom:1px solid ${LINE};${extra}`;

const STATUS_DOT = { good: GREEN, warn: AMBER, bad: RED, critical: RED_DEEP, neutral: GRAY_DOT };
const STATUS_LABEL = { "Target not configured": "No target set" };

export function renderDSREmail(dsr, { mode = "daily" } = {}) {
  if (mode === "monthly") return renderMonthlyEmail(dsr);
  const weekly = mode === "weekly";
  const s = dsr.snapshot, rs = dsr.reportingStatus, tr = s.trend || {};
  const day = dsr.daysElapsed, dim = dsr.daysInMonth;
  const partial = rs.partiallyReporting || [];
  const allReporting = rs.notReporting.length === 0 && partial.length === 0;
  const reportName = weekly ? "Weekly Situation Report" : "Daily Situation Report";
  const trendLabel = weekly ? "vs. last week" : "vs. last month";

  const preheader = weekly
    ? `Week of ${dsr.rangeLabel}: network revenue ${money(s.revenue)} · ${rs.reportingCount}/${rs.totalCount} hospitals reported all 7 days in full · ${dsr.exceptions.length} items need attention.`
    : `Network revenue ${money(s.revenue)} · ${rs.reportingCount}/${rs.totalCount} hospitals reporting · ${dsr.exceptions.length} items need attention.`;

  const kpis = [
    { icon: "kpi-revenue", label: "Total Revenue", value: money(s.revenue), trend: tr.revenue },
    { icon: "kpi-attendance", label: "Attendance", value: num(s.attendance), trend: tr.attendance },
    { icon: "kpi-admissions", label: "Admissions", value: num(s.admissions), trend: tr.admissions },
    { icon: "kpi-arpe", label: "ARPE", value: money(s.arpe), trend: tr.arpe },
    { icon: "kpi-conversion", label: "Admission Conversion", value: pct1(s.conversion), trend: tr.conversion },
    { icon: "kpi-achievement", label: "Revenue Achievement", value: s.targetsKnown === 0 ? "Not set" : pct0(s.networkAchievement), trend: tr.achievement },
  ];
  const cards = kpis.map(k => kpiCard(k, trendLabel));
  const cardsMob = kpis.map(k => kpiCardMobile(k, trendLabel));

  // "Data as of": when the hospital Google Sheets were last read into the dashboard (Lagos time, as recorded).
  const dataAsOf = iso => `${Number(iso.slice(8, 10))} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}, ${iso.slice(11, 16)} WAT`;
  const MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const shortDay = iso => `${Number(iso.slice(8, 10))} ${MON3[Number(iso.slice(5, 7)) - 1]}`;
  // A hospital that has not reported the report date keeps its last-known figures in the table;
  // say so under its name so those numbers are not read as current.
  const nameCell = h => h.partialSince
    ? `${esc(h.name)}<br><span style="${T(11, 400, AMBER_TEXT)}">Partial report for ${shortDay(h.partialSince.date)}: ${esc(h.partialSince.fields.join(", "))} not entered</span>`
    : h.partialDays && h.partialDays.length
    ? `${esc(h.name)}<br><span style="${T(11, 400, AMBER_TEXT)}">Partial report: ${h.partialDays.map(shortDay).join(", ")}</span>`
    : h.staleSince !== undefined && h.staleSince !== null
    ? `${esc(h.name)}<br><span style="${T(11, 400, AMBER_TEXT)}">Last report: ${shortDay(h.staleSince)}</span>`
    : h.staleSince === null && h.lastReport === null && h.hasData === false
      ? `${esc(h.name)}<br><span style="${T(11, 400, AMBER_TEXT)}">No report this period</span>`
      : esc(h.name);
  const achievementRows = dsr.hospitalAchievement.map(h => {
    const dot = STATUS_DOT[h.status.tone] || GRAY_DOT;
    const label = STATUS_LABEL[h.status.label] || h.status.label;
    if (weekly) return `
    <tr>
      <td style="${cell(T(13, 400, INK))}">${nameCell(h)}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${num(h.weekRevenue)}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.weeklyTarget ? num(h.weeklyTarget) : "—"}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.pct !== null ? pct0(h.pct) : "—"}</td>
      <td class="st" style="${cell(T(13, 400, INK, "white-space:nowrap;"))}"><span style="color:${dot};font-size:15px;line-height:13px;">&#9679;</span>&nbsp;&nbsp;${esc(label)}</td>
    </tr>`;
    return `
    <tr>
      <td style="${cell(T(13, 400, INK))}">${nameCell(h)}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.mtd === null ? "—" : num(h.mtd)}</td>
      <td align="right" class="hide-mob" style="${cell(T(13, 400, INK))}">${h.target ? num(h.target) : "—"}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.targetToDate ? num(h.targetToDate) : "—"}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.pct !== null ? pct0(h.pct) : "—"}</td>
      <td class="st" style="${cell(T(13, 400, INK, "white-space:nowrap;"))}"><span style="color:${dot};font-size:15px;line-height:13px;">&#9679;</span>&nbsp;&nbsp;${esc(label)}</td>
    </tr>`;
  }).join("");

  const exceptionRows = dsr.exceptions.length ? dsr.exceptions.map(e => `
    <tr>
      <td valign="middle" bgcolor="${WHITE}" style="${cell(T(13, 400, INK) + `background-color:${WHITE};`)}">${esc(e.hospital)}</td>
      <td valign="middle" bgcolor="${WHITE}" style="${cell(T(13, 400, INK, "line-height:18px;") + `background-color:${WHITE};`)}">${esc(e.issue)}</td>
      <td valign="middle" width="84" bgcolor="${WHITE}" style="${cell(`background-color:${WHITE};`)}">${priorityPill(e.priority)}</td>
    </tr>`).join("")
    : `<tr><td colspan="3" align="center" style="padding:16px 12px;${T(13, 400, DIM)}">${weekly ? "No items need attention this week." : "No items need attention today."}</td></tr>`;

  const none = `<span style="${T(13, 400, INK)}">None</span>`;
  const partialText = partial.length
    ? partial.map(p => `<span style="${T(13, 400, INK)}">${esc(p.name)}${p.fields && p.fields.length ? ` <span style="color:${DIM};">(${esc(p.fields.join(", "))} not entered)</span>` : ""}</span>`).join(`<span style="${T(13, 400, DIM)}">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`)
    : none;
  const notReporting = allReporting
    ? `<span style="${T(13, 400, INK)}">None &mdash; every hospital has reported in full.</span>`
    : rs.notReporting.length === 0 ? none : rs.notReporting.map(n => `<span style="${T(13, 400, INK)}">${esc(n)}</span>`).join(`<span style="${T(13, 400, DIM)}">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`);

  const workflowItem = (icon, label) => `${iconCell(icon, 22, 22, 6, "wf-ico")}<td valign="middle" style="${T(13.5, 400, NAVY, "white-space:nowrap;")}">${label}</td>`;
  const arrow = `<td valign="middle" align="center" class="wf-arrow" style="${T(16, 700, RED)}padding:0 8px;">&rarr;</td>`;

  return `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>CareOne Enterprise Control Tower — ${reportName}</title>
<!--[if mso]>
<style type="text/css">table {border-collapse:collapse;} body,table,td,a {font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:${PAGE}; }
  @media only screen and (max-width:640px) {
    .container { width:100% !important; }
    .outer { padding:10px 4px !important; }
    .pad { padding-left:12px !important; padding-right:12px !important; }
    /* KPI cards: swap the 3x2 desktop grid for the 2x3 mobile grid. */
    .kpi-desk { display:none !important; }
    .kpi-mob { display:table !important; width:100% !important; max-height:none !important; overflow:visible !important; }
    /* Header */
    .logo-cell { width:64px !important; min-width:64px !important; padding-right:10px !important; }
    .logo-cell img { width:64px !important; height:64px !important; }
    .h-text { padding-left:12px !important; }
    .h-l1 { font-size:15px !important; line-height:19px !important; }
    .h-l2 { font-size:16px !important; line-height:20px !important; }
    .h-l3, .h-date { font-size:12px !important; line-height:16px !important; }
    /* Workflow strip: smaller icons, words may wrap */
    .wf-wrap td { font-size:10.5px !important; white-space:normal !important; }
    .wf-ico { width:16px !important; min-width:16px !important; padding-right:4px !important; }
    .wf-ico img { width:16px !important; height:16px !important; }
    .wf-arrow { padding:0 3px !important; font-size:12px !important; }
    .wf-box { padding:10px 4px !important; }
    /* Reporting status: heading on its own line, the two figures side by side underneath */
    .rs-box { padding:14px 12px !important; }
    .rs-head { display:block !important; width:100% !important; padding-bottom:12px !important; }
    .rs-fig { display:inline-block !important; width:50% !important; box-sizing:border-box !important; vertical-align:middle !important; }
    .rs-fig-1 { padding-left:0 !important; }
    .rs-fig-2 { padding-left:12px !important; }
    /* Tables: tighter cells so every column fits at 375px */
    .box { padding:14px 10px 12px !important; }
    .tbl td { padding:8px 3px !important; font-size:10.5px !important; line-height:14px !important; }
    .tbl td.st { white-space:normal !important; }
    .hide-mob { display:none !important; }
    /* Footer */
    .foot-mid { width:auto !important; white-space:normal !important; font-size:11px !important; line-height:15px !important; }
  }
</style>
</head>
<body bgcolor="${PAGE}" style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
<tr><td align="center" class="outer" style="padding:18px 8px;">

<table role="presentation" class="container" width="700" cellpadding="0" cellspacing="0" border="0" style="width:700px;max-width:700px;border:1px solid ${LINE};border-radius:14px;">

  <!-- HEADER -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};border-radius:14px 14px 0 0;padding:24px 26px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="118" valign="middle" class="logo-cell" style="padding-right:16px;">${img("logo-header", 102, 102, "CareOne Enterprise Control Tower")}</td>
      <td width="2" bgcolor="${RED}" style="background-color:${RED};width:2px;font-size:1px;line-height:1px;">&nbsp;</td>
      <td valign="middle" class="h-text" style="padding-left:18px;">
        <div class="h-l1" style="${T(22, 700, NAVY, "letter-spacing:0.3px;line-height:26px;")}">CONTROL TOWER</div>
        <div class="h-l2" style="${T(24, 700, RED, "letter-spacing:0.2px;line-height:28px;")}">${reportName.toUpperCase()}</div>
        <div class="h-l3" style="${T(14, 400, NAVY, "line-height:20px;padding-top:3px;")}">Network Performance &amp; Exception Management</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr>
          ${iconCell("cal", 16, 16, 8)}
          <td valign="middle" class="h-date" style="${T(13.5, 400, NAVY)}">${weekly ? rangeDate(dsr.weekStart, dsr.weekEnd) : longDate(dsr.dataThrough)}</td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>

  <!-- WORKFLOW STRIP -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:0 26px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="wf-wrap"><tr>
      <td bgcolor="#EEF2F7" align="center" class="wf-box" style="background-color:#EEF2F7;border-radius:8px;border:1px solid #E1E7EF;padding:13px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
          ${workflowItem("wf-eye", "See Early")}${arrow}${workflowItem("wf-alert", "Escalate Fast")}${arrow}${workflowItem("wf-gear", "Act Decisively")}${arrow}${workflowItem("wf-check", "Close Completely")}
        </tr></table>
      </td>
    </tr></table>
  </td></tr>

  <!-- NETWORK SNAPSHOT + REPORTING STATUS -->
  <tr><td bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};padding:0 21px 6px;">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:6px 5px 12px;">${sectionHead("badge-chart", "NETWORK SNAPSHOT")}</td></tr></table>
    <table role="presentation" class="kpi-desk" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${cards[0]}${cards[1]}${cards[2]}</tr>
      <tr>${cards[3]}${cards[4]}${cards[5]}</tr>
    </table>
    <!--[if !mso]><!-->
    <table role="presentation" class="kpi-mob" width="100%" cellpadding="0" cellspacing="6" border="0" style="display:none;max-height:0;overflow:hidden;mso-hide:all;border-collapse:separate;">
      <tr>${cardsMob[0]}${cardsMob[1]}</tr>
      <tr>${cardsMob[2]}${cardsMob[3]}</tr>
      <tr>${cardsMob[4]}${cardsMob[5]}</tr>
    </table>
    <!--<![endif]-->

    <!-- REPORTING STATUS -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr><td style="padding:0 5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${allReporting ? "#CDEBDC" : PINK_LINE};border-radius:10px;">
        <tr><td bgcolor="${allReporting ? "#F0FAF5" : PINK}" class="rs-box" style="background-color:${allReporting ? "#F0FAF5" : PINK};border-radius:10px;padding:16px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" class="rs-head">${sectionHead("badge-hospital", "REPORTING STATUS", RED)}</td>
            <td valign="middle" width="190" class="rs-fig rs-fig-1" style="padding-left:8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                ${iconCell("rs-hospital", 30, 30, 10)}
                <td valign="middle"><div style="${T(19, 700, NAVY, "line-height:22px;")}">${rs.reportingCount} / ${rs.totalCount}</div><div style="${T(12, 400, DIM)}">${weekly ? "Reported All 7 Days" : "Hospitals Reporting"}</div></td>
              </tr></table>
            </td><td valign="middle" width="150" class="rs-fig rs-fig-2" style="border-left:1px solid ${PINK_LINE};padding-left:16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                ${iconCell("rs-alert", 30, 30, 10)}
                <td valign="middle"><div style="${T(19, 700, allReporting ? GREEN : NAVY, "line-height:22px;")}">${rs.notReporting.length}</div><div style="${T(12, 400, DIM)}">Not Reporting</div></td>
              </tr></table>
            </td><td valign="middle" width="150" class="rs-fig rs-fig-2" style="border-left:1px solid ${PINK_LINE};padding-left:16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle"><div style="${T(19, 700, partial.length ? NAVY : GREEN, "line-height:22px;")}">${partial.length}</div><div style="${T(12, 400, DIM)}">Partial Report</div></td>
              </tr></table>
            </td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
            <td bgcolor="#FBE3E3" style="background-color:#FBE3E3;border-radius:8px;padding:11px 14px;">
              <span style="${T(13, 700, RED)}">Not Reporting:</span>&nbsp;&nbsp; ${notReporting}
            </td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr>
            <td bgcolor="#FDF1DC" style="background-color:#FDF1DC;border-radius:8px;padding:11px 14px;">
              <span style="${T(13, 700, AMBER_TEXT)}">Partial Report${weekly ? " (some days incomplete)" : ""}:</span>&nbsp;&nbsp; ${partialText}
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr></table>
  </td></tr>

  <!-- REVENUE ACHIEVEMENT BY HOSPITAL -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:12px 26px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;">
      <tr><td bgcolor="${WHITE}" class="box" style="background-color:${WHITE};border-radius:10px;padding:16px 16px 14px;">
        ${sectionHead("badge-chart", "REVENUE ACHIEVEMENT BY HOSPITAL")}
        ${weekly
          ? `<div style="${T(12, 400, DIM, "line-height:17px;padding:10px 0 12px;")}"><b>Weekly Target</b> = each day's share of that month's target (monthly target &divide; days in the month), added up over the 7 days. <b>Achievement %</b> compares the week's revenue with that figure; 100% means exactly on target.</div>`
          : `<div style="${T(12, 400, DIM, "line-height:17px;padding:10px 0 12px;")}">Day ${day} of ${dim}. <b>Target to Date</b> = monthly target &times; ${day}/${dim}. <b>Achievement %</b> compares revenue earned so far with that figure; 100% means exactly on pace.</div>`}
        <table role="presentation" class="tbl" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;">
          <tr>${weekly
            ? `${th("Hospital")}${th("Week Revenue (₦)", "right")}${th("Weekly Target (₦)", "right")}${th("Achievement %", "right")}${th("Status")}`
            : `${th("Hospital")}${th("MTD Revenue (₦)", "right")}${th("Monthly Target (₦)", "right", "hide-mob")}${th("Target to Date (₦)", "right")}${th("Achievement %", "right")}${th("Status")}`}</tr>
          ${achievementRows}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- EXCEPTIONS -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:10px 26px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${PINK_LINE};border-radius:10px;">
      <tr><td bgcolor="${PINK}" class="box" style="background-color:${PINK};border-radius:10px;padding:16px 16px 14px;">
        ${sectionHead("badge-alert", "EXCEPTIONS REQUIRING ATTENTION", RED)}
        <table role="presentation" class="tbl" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;margin-top:12px;">
          <tr>${th("Hospital")}${th("Issue")}${th("Priority", "center")}</tr>
          ${exceptionRows}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CALL TO ACTION -->
  <tr><td class="pad" bgcolor="${WHITE}" align="center" style="background-color:${WHITE};padding:4px 26px 22px;">
    <div style="${T(13, 400, DIM, "line-height:19px;padding-bottom:12px;")}">For full network intelligence and real-time performance data, visit the CareOne Enterprise Control Tower</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
      <td bgcolor="${RED}" align="center" style="background-color:${RED};border-radius:8px;">
        <a href="https://care-one-control-tower-theta.vercel.app/" target="_blank" style="${T(13.5, 700, WHITE, "display:block;padding:12px 30px;text-decoration:none;letter-spacing:0.2px;")}"><font color="${WHITE}">Open the Control Tower &rarr;</font></a>
      </td>
    </tr></table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:4px 26px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="border-bottom:1px solid ${LINE};font-size:1px;line-height:1px;">&nbsp;</td>
      <td valign="middle" align="center" width="330" class="foot-mid" style="padding:0 10px;${T(12, 400, NAVY)}white-space:nowrap;">CareOne Enterprise Control Tower &nbsp;<span style="color:${RED};">|</span>&nbsp; Data. Insight. Action.</td>
      <td valign="middle" style="border-bottom:1px solid ${LINE};font-size:1px;line-height:1px;">&nbsp;</td>
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:8px;"><tr><td>${img("heartbeat", 46, 18, "")}</td></tr></table>
    ${dsr.dataReadAt ? `<div align="center" style="${T(11, 400, DIM)}padding-top:8px;">Data as of ${dataAsOf(dsr.dataReadAt)}</div>` : ""}
  </td></tr>

  <tr><td bgcolor="${NAVY}" style="background-color:${NAVY};border-radius:0 0 14px 14px;height:14px;font-size:1px;line-height:14px;padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="86%" bgcolor="${NAVY}" style="background-color:${NAVY};height:14px;font-size:1px;line-height:14px;border-radius:0 0 0 14px;">&nbsp;</td>
      <td width="14%" bgcolor="${RED}" style="background-color:${RED};height:14px;font-size:1px;line-height:14px;border-radius:0 0 14px 0;">&nbsp;</td>
    </tr></table>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

/* ============================================================================
   MONTHLY SITUATION REPORT  (renderDSREmail(msr, { mode: "monthly" }))
   ----------------------------------------------------------------------------
   Same header, footer, palette, hosted images and mobile patterns as the DSR / WSR.
   Wide tables have a hidden mobile twin (display:none + mso-hide:all, swapped in by the
   media query), exactly like the KPI grid, so a client that ignores media queries falls
   back to the desktop layout.
   SIZE: Gmail clips any email over ~102 KB ("View entire message"). The MSR has far more
   rows than the DSR, so its tables set the font once on the table (cells inherit it;
   Outlook gets it from the mso style block) and keep per-cell styles short.
   ============================================================================ */
const BLACK = "#111111", BAR_BG = "#E6E9EE";
const M_TONE = { good: GREEN, warn: AMBER, bad: RED, critical: BLACK, neutral: GRAY_DOT };
const M_LIGHT = { good: "Green", warn: "Amber", bad: "Red", critical: "Critical", neutral: "Not set" };
const MON_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const mDay = iso => `${Number(iso.slice(8, 10))} ${MON_SHORT[Number(iso.slice(5, 7)) - 1]}`;
const mDayYear = iso => `${mDay(iso)} ${iso.slice(0, 4)}`;
const mMoneyShort = v => v === null || v === undefined ? "—" : (v < 0 ? "−" : "") + "₦" + (Math.abs(v) / 1e6).toFixed(1) + "M";
const mSigned = v => v === null || v === undefined ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.round(Math.abs(v)).toLocaleString("en-US");
const mPts = v => v === null || v === undefined ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
const mPct = v => v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
// Short style: no font-family (inherited from the table).
const S_ = (size, weight, color, extra = "") => `font-size:${size}px;${weight === 700 ? "font-weight:700;" : ""}color:${color};${extra}`;
// Data tables: padding comes from the cellpadding attribute and row stripes from the <tr>, so cells need no style.
const TB = (cls, extra = "") => `<table${cls ? ` class="${cls}"` : ""} width="100%" cellpadding="7" cellspacing="0" style="${FONT}font-size:12.5px;line-height:16px;color:${INK};${extra}">`;
// Rows are right-aligned (most cells are figures), so only text cells carry align="left".
const al_ = align => align === "right" ? "" : ` align="${align || "left"}"`;
const td_ = (html, align = "", extra = "", cls = "") => `<td${al_(align)}${cls ? ` class="${cls}"` : ""}${extra ? ` style="${extra}"` : ""}>${html}</td>`;
const th_ = (label, align = "") => `<td${al_(align)}>${label}</td>`;
const HROW = cells => `<tr align="right" bgcolor="${HEAD_BG}" style="background-color:${HEAD_BG};font-size:11.5px;">${cells}</tr>`;
const TROW = cells => `<tr align="right" bgcolor="${HEAD_BG}" style="background-color:${HEAD_BG};font-weight:700;color:${NAVY};">${cells}</tr>`;
const ZROW = (i, cells) => i % 2 ? `<tr align="right" bgcolor="#F7F8FA">${cells}</tr>` : `<tr align="right">${cells}</tr>`;
const box_ = inner => `${TB("tbl", `border:1px solid ${LINE};border-radius:8px;`)}${inner}</table>`;

// Horizontal progress bar, capped visually at 100% (the real figure is printed beside it).
function mBar(pct, color, h = 8) {
  const w = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, Math.round(pct * 100)));
  const c = (width, bg) => `<td${width ? ` width="${width}%"` : ""} height="${h}" bgcolor="${bg}" style="font-size:0;line-height:0;"></td>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr>${w > 0 ? c(w, color) : ""}${w < 100 ? c(0, BAR_BG) : ""}</tr></table>`;
}
const mMixText = r => r.revenue ? `P&nbsp;${Math.round(r.privShare * 100)}% · H&nbsp;${Math.round(r.hmoShare * 100)}%${r.otherShare >= 0.005 ? ` · O&nbsp;${Math.round(r.otherShare * 100)}%` : ""}` : "—";
const mDot = tone => `<span class="d${{ good: "g", warn: "a", bad: "r", critical: "c" }[tone] || "n"}">&#9679;</span>`;
const mLight = tone => `<b style="color:${tone === "warn" ? AMBER_TEXT : M_TONE[tone] || DIM};white-space:nowrap;">${mDot(tone)} ${M_LIGHT[tone] || "—"}</b>`;
const mImg = (name, w) => `<img src="${imgUrl(name)}" width="${w}" height="${w}" alt="" style="display:block;border:0;">`;
const mH = text => `<div style="${S_(13, 700, NAVY, "padding:16px 0 6px;")}">${text}</div>`;
const mNote = html => `<div style="${S_(12, 400, DIM, "line-height:17px;padding:10px 0 12px;")}">${html}</div>`;
const mList = items => `${TB("", "font-size:13px;line-height:19px;").replace('cellpadding="7"', 'cellpadding="0"')}${items.map(i => `<tr><td valign="top" width="14" class="bl">&bull;</td><td class="li">${i}</td></tr>`).join("")}</table>`;

// A white panel with a section heading (same look as the DSR's achievement panel).
function mPanel(badge, title, body, { headline = false, tint = false, color = NAVY } = {}) {
  const border = headline ? `2px solid ${RED}` : `1px solid ${tint ? PINK_LINE : LINE}`, bg = tint ? PINK : WHITE;
  return `
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:12px 26px 6px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:${border};border-radius:10px;"><tr>
    <td bgcolor="${bg}" class="box" style="background-color:${bg};border-radius:10px;padding:16px 16px 14px;${FONT}font-size:13px;line-height:18px;color:${INK};">
      ${headline ? `<div style="${S_(11, 700, RED, "letter-spacing:1px;padding-bottom:6px;")}">HEADLINE</div>` : ""}
      ${sectionHead(badge, title, color)}
      ${body}
    </td></tr></table>
  </td></tr>`;
}

// KPI card (desktop 3 per row; mobile twin 2 per row).
function mCard(k, mobile, vs) {
  const tr = k.trend ? `<div style="${S_(mobile ? 11 : 11.5, 700, k.trend.up ? GREEN : RED, "padding-top:2px;")}">${k.trend.up ? "&uarr;" : "&darr;"} ${esc(k.trend.text)} <span style="font-weight:400;color:${DIM};">vs ${vs}</span></div>` : "";
  const text = `<div style="font-size:12px;line-height:15px;">${esc(k.label)}</div><div style="${S_(mobile ? 16 : 18, 700, NAVY, "line-height:23px;white-space:nowrap;")}">${k.value}</div>${tr}`;
  return mobile
    ? `<td width="50%" valign="top" bgcolor="${WHITE}" style="width:50%;border:1px solid ${LINE};border-radius:8px;padding:10px;">${mImg(k.icon, 32)}<div style="padding-top:6px;">${text}</div></td>`
    : `<td width="33.33%" valign="top" style="padding:0 5px 10px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;"><tr><td width="48" style="width:32px;min-width:32px;padding:12px 8px;">${mImg(k.icon, 32)}</td><td style="padding:12px 8px 12px 0;">${text}</td></tr></table></td>`;
}

export function renderMonthlyEmail(m) {
  // Indentation is collapsed: whitespace between tags renders the same and the MSR must stay under Gmail's clip size.
  return buildMonthlyEmail(m).replace(/\n[ \t]+/g, "\n").replace(/\n{2,}/g, "\n");
}
function buildMonthlyEmail(m) {
  const s = m.snapshot, reportName = "Monthly Situation Report";
  const prevShort = MON_SHORT[Number(m.prevId.slice(5, 7)) - 1], curShort = MON_SHORT[Number(m.monthId.slice(5, 7)) - 1];
  const star = `<sup style="color:${AMBER_TEXT};">*</sup>`;
  const flagPrev = r => r.prevPartialMonth ? star : "";
  // Days missing only because the whole network's data stops early are said once, in the banner.
  const partialLine = r => !r.partialMonth || r.partialMonth.days === r.partialMonth.of - m.missingTail.length ? ""
    : `<br><span style="${S_(11, 400, AMBER_TEXT)}">Partial month: ${r.partialMonth.days} of ${r.partialMonth.of} days</span>`;
  const preheader = `${m.monthLabel}: network revenue ${money(s.revenue)}, ${mPct(s.networkAchievement)} of target · ${m.achievers.atOrAbove} of ${m.achievers.withTarget} hospitals at or above target.`;

  // ---- 2. Network snapshot ----
  const prevN = m.prevNetwork;
  const tr = (cur, old) => cur === null || !old ? null : { up: cur >= old, text: Math.abs((cur - old) / old * 100).toFixed(0) + "%" };
  const trPts = (cur, old) => cur === null || old === null || old === undefined ? null : { up: cur >= old, text: Math.abs((cur - old) * 100).toFixed(1) + " pts" };
  const kpis = [
    { icon: "kpi-revenue", label: "Total Revenue", value: money(s.revenue) },
    { icon: "kpi-achievement", label: "Network Achievement", value: mPct(s.networkAchievement), trend: trPts(s.networkAchievement, s.prevNetworkAchievement) },
    { icon: "kpi-arpe", label: "Network Target", value: money(s.networkTarget) },
    { icon: "kpi-conversion", label: `Revenue vs ${prevShort}`, value: s.momRevenue === null ? "—" : (s.momRevenue >= 0 ? "+" : "−") + Math.abs(s.momRevenue * 100).toFixed(1) + "%" },
    { icon: "kpi-attendance", label: "Total Attendance", value: num(s.attendance), trend: prevN && tr(s.attendance, prevN.attendance) },
    { icon: "kpi-admissions", label: "Admissions", value: num(s.admissions), trend: prevN && tr(s.admissions, prevN.admissions) },
    { icon: "wf-check", label: "Average NPS", value: s.nps === null ? "Not captured" : mPct(s.nps), trend: prevN && trPts(s.nps, prevN.nps) },
    { icon: "cal", label: "Average TAT", value: s.tat === null ? "Not captured" : `${s.tat.toFixed(1)} mins` },
    { icon: "rs-hospital", label: "Reporting Compliance", value: mPct(s.compliance), trend: prevN && trPts(s.compliance, prevN.compliance) },
  ];
  const cd = kpis.map(k => mCard(k, false, prevShort)), cm = kpis.map(k => mCard(k, true, prevShort));
  const lfl = m.likeForLike && m.prevPartialHospitals.length ? `${m.likeForLike.change >= 0 ? "+" : "−"}${Math.abs(m.likeForLike.change * 100).toFixed(1)}%` : null;
  const snapshotNote = [
    lfl ? `<b>Revenue vs ${prevShort}</b> is flattered by ${m.prevPartialHospitals.length} hospitals with a part-month ${prevShort}; like-for-like (${m.likeForLike.hospitals} hospitals) it is <b>${lfl}</b>.` : "",
    s.nps !== null ? `NPS: mean of the ${s.npsHospitals} hospitals with promoter and detractor counts.` : "",
    s.tat !== null ? `TAT: average over every recorded day (${s.tatHospitals} hospitals record it).` : "",
    `Compliance: days with a complete report &divide; days in the month, all ${m.hospitalCount} hospitals.`,
  ].filter(Boolean).join(" ");

  // ---- 3. Revenue achievement (headline) ----
  const A = m.achievement;
  const netTone = s.networkAchievement === null ? "neutral" : s.networkAchievement >= m.bands.green ? "good" : s.networkAchievement >= m.bands.amber ? "warn" : s.networkAchievement >= m.bands.red ? "bad" : "critical";
  const netRow = { revenue: s.revenue, target: s.networkTarget, pct: s.networkAchievement, variance: s.revenue - s.networkTarget, prevPct: s.prevNetworkAchievement,
    momPts: s.networkAchievement !== null && s.prevNetworkAchievement !== null ? (s.networkAchievement - s.prevNetworkAchievement) * 100 : null,
    status: { tone: netTone, label: { good: "On Track", warn: "At Risk", bad: "Below Target", critical: "Critical", neutral: "Not set" }[netTone] }, privShare: s.privShare, hmoShare: s.hmoShare, otherShare: s.otherShare };
  const callout = (title, body, bg = "#F7F8FA", border = LINE) => `<td class="co" width="33.33%" valign="top" style="padding:0 4px 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${border};border-radius:8px;"><tr><td bgcolor="${bg}" style="background-color:${bg};border-radius:8px;padding:10px 12px;${FONT}font-size:12.5px;line-height:18px;color:${INK};"><div style="${S_(11, 700, DIM, "letter-spacing:0.6px;")}">${title}</div>${body}</td></tr></table></td>`;
  const callouts = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;"><tr>
    ${callout("TOP 3 ACHIEVERS", m.achievers.top.map((r, i) => `${i + 1}. ${esc(r.name)} <b>${mPct(r.pct)}</b>`).join("<br>"), "#F0FAF5", "#CDEBDC")}
    ${callout("BOTTOM 3", m.achievers.bottom.map(r => `${esc(r.name)} <b>${mPct(r.pct)}</b>`).join("<br>"), PINK, PINK_LINE)}
    ${callout("AT OR ABOVE TARGET", `<span style="${S_(26, 700, m.achievers.atOrAbove ? GREEN : RED, "line-height:32px;")}">${m.achievers.atOrAbove}</span><span style="color:${DIM};"> of ${m.achievers.withTarget}</span><br><span style="font-size:11.5px;color:${DIM};">hospitals reached 100% of their monthly target</span>`)}
  </tr></table>`;
  // Achievement % with its bar, and the payer split (Private / HMO / Other) right under it.
  const achCell = r => `<b class="nw" style="font-size:13px;color:${r.status.tone === "critical" ? BLACK : NAVY};">${mPct(r.pct)}</b>${mBar(r.pct, M_TONE[r.status.tone] || GRAY_DOT)}<span class="xb">${mMixText(r)}</span>`;
  const varStyle = v => `color:${v < 0 ? RED : GREEN};`;
  const varCls = v => v < 0 ? "r" : "g";
  const achDesk = `${TB("tbl m-desk", `border:1px solid ${LINE};border-radius:8px;font-size:12px;`).replace('cellpadding="7"', 'cellpadding="5"')}
    ${HROW(`${th_("#", "center")}${th_("Hospital")}${th_("Actual Revenue (₦)", "right")}${th_("Monthly Target (₦)", "right")}${th_("<b>ACHIEVEMENT %</b><br>Payer mix")}${th_("Variance (₦)", "right")}${th_(`Last Month %<br>(${prevShort})`, "right")}${th_("MoM (pts)", "right")}${th_("Status")}`)}
    ${A.map((r, i) => ZROW(i, `${td_(`<b>${r.rank}</b>`, "center")}${td_(esc(r.name) + partialLine(r))}${td_(num(r.revenue), "right")}${td_(num(r.target), "right")}${td_(achCell(r))}${td_(mSigned(r.variance), "right", "", varCls(r.variance))}${td_(mPct(r.prevPct) + flagPrev(r), "right")}${td_(mPts(r.momPts), "right")}${td_(`${mDot(r.status.tone)}&nbsp;${esc(r.status.label)}`, "", "", "st nw")}`)).join("\n    ")}
    ${TROW(`<td colspan="2" align="left">Network total</td>${td_(num(s.revenue), "right")}${td_(num(s.networkTarget), "right")}${td_(achCell(netRow))}${td_(mSigned(netRow.variance), "right", varStyle(netRow.variance))}${td_(mPct(netRow.prevPct), "right")}${td_(mPts(netRow.momPts), "right")}${td_(`${mDot(netTone)}&nbsp;${netRow.status.label}`, "", "", "nw")}`)}
  </table>`;
  const mobBlock = (r, isNet) => `<tr><td${isNet ? ` bgcolor="${HEAD_BG}"` : ""} style="padding:10px;border-bottom:1px solid ${LINE};">
      <div style="${S_(13.5, 700, NAVY)}"><span style="float:right;font-size:15px;color:${r.status.tone === "critical" ? BLACK : NAVY};">${mPct(r.pct)}</span>${isNet ? "Network total" : `${r.rank}.&nbsp;${esc(r.name)}`}</div>
      ${mBar(r.pct, M_TONE[r.status.tone] || GRAY_DOT, 9)}
      <div style="font-size:12px;line-height:17px;padding-top:5px;">${mMoneyShort(r.revenue)} of ${mMoneyShort(r.target)} &middot; <span class="${varCls(r.variance)}">${r.variance < 0 ? "short" : "over"} ${mMoneyShort(Math.abs(r.variance))}</span><br><span style="color:${DIM};">${mDot(r.status.tone)} ${esc(r.status.label)} &middot; ${prevShort} ${mPct(r.prevPct)}${isNet ? "" : flagPrev(r)} (${mPts(r.momPts)} pts)<br>${mMixText(r)}</span>${isNet ? "" : partialLine(r)}</div>
    </td></tr>`;
  const achMob = `<!--[if !mso]><!-->
  ${TB("m-mob", `display:none;max-height:0;overflow:hidden;mso-hide:all;border:1px solid ${LINE};border-radius:8px;`)}
    ${A.map(r => mobBlock(r, false)).join("")}${mobBlock(netRow, true)}
  </table>
  <!--<![endif]-->`;
  const legend = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;${FONT}font-size:11.5px;color:${INK};"><tr>
      ${[["good", `On Track &ge;${Math.round(m.bands.green * 100)}%`], ["warn", `At Risk ${Math.round(m.bands.amber * 100)}–${Math.round(m.bands.green * 100) - 1}%`], ["bad", `Below Target ${Math.round(m.bands.red * 100)}–${Math.round(m.bands.amber * 100) - 1}%`], ["critical", `Critical &lt;${Math.round(m.bands.red * 100)}%`]]
        .map(([t, l]) => `<td class="lg" style="padding:2px 12px 2px 0;white-space:nowrap;">${mDot(t)}&nbsp;<b>${M_LIGHT[t]}</b> &middot; ${l}</td>`).join("")}
    </tr></table>
    <div style="${S_(11.5, 400, DIM, "line-height:16px;padding-top:6px;")}">Bands are the CEO-approved revenue thresholds used by the DSR and WSR. Bars are capped at 100%; the figure shows the real value. Payer mix: P = private, H = HMO, O = other (NHIA + company), as shares of each hospital's revenue.${m.prevPartialHospitals.length ? ` ${star} ${esc(m.prevPartialHospitals.map(p => `${p.name} (${p.days} of ${p.of} days, from ${mDay(p.first)})`).join(", "))} reported only part of ${esc(m.prevLabel)}, measured against the full target, so their ${prevShort} % is low and their MoM change overstates the improvement.` : ""}</div>`;
  const achBody = `${mNote(`<b>Achievement %</b> = ${curShort} revenue &divide; full monthly target &times; 100 (no pro-rating). Ranked highest first.`)}${callouts}${achDesk}${achMob}${legend}`;

  // ---- 4. Traffic light ----
  const mv = r => r.movement === "Improved" ? `<b class="g">&uarr; Improved</b>` : r.movement === "Declined" ? `<b class="r">&darr; Declined</b>` : `<span class="x">${r.movement === "Unchanged" ? "&rarr; Unchanged" : `No ${prevShort} data`}</span>`;
  const tlBody = `${mNote(`Same classification as the achievement status above, ${esc(m.monthLabel)} against ${esc(m.prevLabel)}.`)}
    ${box_(`${HROW(`${th_("Hospital")}${th_(curShort)}${th_(prevShort)}${th_("Movement")}`)}
    ${A.map((r, i) => ZROW(i, `${td_(esc(r.name))}${td_(mLight(r.status.tone))}${td_(r.prevStatus ? mLight(r.prevStatus.tone) + (r.prevPartialMonth ? `<br><span style="font-size:10.5px;color:${AMBER_TEXT};">partial month</span>` : "") : "—")}${td_(mv(r))}`)).join("\n    ")}`)}`;

  // ---- 5. Scorecard ----
  const sc = v => v === null || v === undefined ? `<span style="color:${DIM};">n/c</span>` : v.toFixed(0);
  const scBody = `${mNote(`Ranking weights: Financial 30 &middot; Clinical 25 &middot; Patient Experience 20 &middot; Operational 15 &middot; Strategic 10. <b>Only domains with data are scored.</b>
      <b>Financial</b> = achievement % (capped at 100). <b>Patient Experience</b> = NPS rescaled from &minus;100..+100 to 0..100. <b>Operational</b> = average turnaround time (fastest hospital = 100, others in proportion).
      <b>Clinical</b> and <b>Strategic</b>: not captured in current data (clinical fields are filled in by only some hospitals and are not validated; there are no strategic measures), so they are left out and the weights of the scored domains are rescaled to 100.
      Where a hospital has no data for a domain (n/c), its score uses the domains it has. Indicative only.`)}
    ${box_(`${HROW(`${th_("#", "center")}${th_("Hospital")}${th_("Financial<br>(30)", "right")}${th_("Patient Exp.<br>(20)", "right")}${th_("Operational<br>(15)", "right")}${th_("Score", "right")}`)}
    ${m.scorecard.map((x, i) => ZROW(i, `${td_(x.rank, "center", `font-weight:700;color:${NAVY};`)}${td_(esc(x.name) + (x.used.length < 3 ? `<br><span style="${S_(10.5, 400, DIM)}">${x.used.length} of 3 domains</span>` : ""))}${td_(sc(x.scores.financial), "right")}${td_(sc(x.scores.experience), "right")}${td_(sc(x.scores.operational), "right")}${td_(`<b>${sc(x.composite)}</b>`, "right")}`)).join("\n    ")}`)}`;

  // ---- 6. Performance detail ----
  const fv = (v, f) => v === null || v === undefined ? "—" : f === "int" ? num(v) : f === "pct" || f === "nps" ? mPct(v) : f === "dec" ? v.toFixed(1) : money(v);
  const fc = x => x.change === null ? "" : (x.fmt === "pct" || x.fmt === "nps") ? `${mPts(x.change)} pts` : `${x.change > 0 ? "+" : x.change < 0 ? "−" : ""}${Math.abs(x.change * 100).toFixed(0)}%`;
  const dCell = x => td_(`<b>${fv(x.cur, x.fmt)}</b><br><span class="x">${fv(x.prev, x.fmt)}${fc(x) ? ` <span class="${x.change > 0 ? "g" : x.change < 0 ? "r" : ""}">${fc(x)}</span>` : ""}</span>`, "right");
  const GROUPS = [["Patient volume", ["attendance", "newReg", "privAtt", "hmoAtt"]], ["Admissions", ["admissions", "conversion", "discharges"]], ["Quality and value", ["tat", "nps", "arpe"]]];
  const SHORT = { attendance: "Attendance", newReg: "New reg.", privAtt: "Private att.", hmoAtt: "HMO att.", admissions: "Admissions", conversion: "Conversion", discharges: "Discharges", tat: "Avg TAT (mins)", nps: "NPS", arpe: "ARPE (₦)" };
  const detTables = GROUPS.map(([title, keys]) => `${mH(title)}${box_(`${HROW(`${th_("Hospital")}${keys.map(k => th_(SHORT[k], "right")).join("")}`)}
    ${m.detail.map(d => ZROW(0, `${td_(esc(d.name) + (m.prevPartialHospitals.some(p => p.name === d.name) ? star : ""))}${keys.map(k => dCell(d.metrics.find(x => x.key === k))).join("")}`)).join("\n    ")}`)}`).join("");
  const detNotes = m.detail.flatMap(d => d.notes.filter(n => !/^Last month is partial/.test(n)).map(n => `${esc(d.name)}: ${esc(n)}`));
  const detBody = `${mNote(`Each cell: <b>${esc(m.monthLabel)}</b> value, with ${esc(m.prevLabel)} and the change underneath (in % for counts and money, in points for rates). Counts are monthly totals; conversion = admissions &divide; attendance; ARPE = revenue &divide; attendance; NPS = (promoters &minus; detractors) &divide; all respondents, from the daily counts. Ranked order.${m.prevPartialHospitals.length ? ` ${star} Part-month ${prevShort} (see the achievement section).` : ""}`)}
    ${detTables}${detNotes.length ? `<div style="${S_(11, 400, AMBER_TEXT, "line-height:16px;padding-top:8px;")}">${detNotes.join("<br>")}</div>` : ""}`;

  // ---- 7. Trend ----
  const wk = m.weekly;
  // Each figure carries its unit (₦9.5M = 9.5 million naira); the wk class tightens the columns on phones.
  const wkCell = v => td_(mMoneyShort(v), "right", "", "nw");
  const weekTbl = box_(`${HROW(`${th_("Hospital")}${wk.weeks.map(w => th_(w.label.replace("–", "–<br>"), "right")).join("")}${th_(curShort, "right")}`)}
    ${wk.rows.map((r, i) => ZROW(i, `${td_(esc(r.name))}${r.values.map(wkCell).join("")}${td_(`<b>${mMoneyShort(r.total)}</b>`, "right", "", "nw")}`)).join("\n    ")}
    ${TROW(`${td_("Network")}${wk.network.map(wkCell).join("")}${td_(mMoneyShort(s.revenue), "right", "", "nw")}`)}`);
  const n0 = m.network, n1 = m.prevNetwork;
  let momI = 0;
  const momRow = (label, a, b, f) => {
    const v = x => x === null || x === undefined ? "—" : f === "pct" ? mPct(x) : f === "money" ? money(x) : f === "dec" ? x.toFixed(1) : num(x);
    const ch = a === null || b === null || b === undefined ? "—" : f === "pct" ? `${mPts((a - b) * 100)} pts` : b ? `${a >= b ? "+" : "−"}${Math.abs((a - b) / b * 100).toFixed(1)}%` : "—";
    return ZROW(momI++, `${td_(label)}${td_(`<b>${v(a)}</b>`, "right")}${td_(v(b), "right")}${td_(ch, "right")}`);
  };
  const momTbl = n1 ? box_(`${HROW(`${th_("Network")}${th_(curShort, "right")}${th_(prevShort, "right")}${th_("Change", "right")}`)}${[
    momRow("Revenue (₦)", s.revenue, s.prevRevenue, "money"), momRow("Achievement of target", s.networkAchievement, s.prevNetworkAchievement, "pct"),
    momRow("Attendance", n0.attendance, n1.attendance), momRow("New registrations", n0.newReg, n1.newReg), momRow("Admissions", n0.admissions, n1.admissions),
    momRow("Discharges", n0.discharges, n1.discharges), momRow("Conversion rate", n0.conversion, n1.conversion, "pct"), momRow("ARPE (₦)", n0.arpe, n1.arpe, "money"),
    momRow("Average NPS", n0.nps, n1.nps, "pct"), momRow("Average TAT (mins)", n0.tat, n1.tat, "dec"), momRow("Private share of revenue", n0.privShare, n1.privShare, "pct"),
    momRow("Reporting compliance", n0.compliance, n1.compliance, "pct")].join("")}`)
    : `<div style="color:${DIM};">No ${esc(m.prevLabel)} data, so no month-on-month comparison.</div>`;
  const trendBody = `${mNote(`Revenue by Monday&ndash;Sunday week inside the month, in millions of naira: <b>₦9.5M = ₦9,500,000</b>. The first and last weeks are part-weeks.${m.missingTail.length ? ` ${m.missingTail.map(mDay).join(" and ")} are not loaded yet, so the last week is understated.` : ""}`)}
    ${weekTbl.replace('class="tbl"', 'class="tbl wk"')}
    ${mH("Month on month")}
    ${lfl ? `<div style="${S_(11.5, 400, AMBER_TEXT, "line-height:16px;padding-bottom:8px;")}">Network growth is overstated by the part-month ${prevShort} hospitals; like-for-like (${m.likeForLike.hospitals} hospitals): <b>${lfl}</b>.</div>` : ""}
    ${momTbl}
    ${mH("What the numbers say")}
    ${mList(m.insights.map(esc))}`;

  // ---- 8. Compliance and data quality ----
  const gaps = m.compliance.filter(c => c.missing.length || c.partial.length);
  const tail = new Set(m.missingTail);
  const compBody = `${mNote(`A day counts only when the full daily report is entered (attendance, new registrations, admissions, patients on admission, discharges, total revenue and the payer revenue the hospital normally reports). A day with only some of these is <b>partial</b>.${m.missingTail.length ? ` ${m.missingTail.map(mDay).join(" and ")} are not loaded yet and count as missing for every hospital.` : ""}`)}
    ${box_(`${HROW(`${th_("Hospital")}${th_("Complete days", "right")}${th_("Partial", "right")}${th_("Missing", "right")}${th_("Compliance", "right")}`)}
    ${m.compliance.map((c, i) => ZROW(i, `${td_(esc(c.name))}${td_(`${c.complete} / ${c.of}`, "right")}${td_(c.partial.length, "right")}${td_(c.missing.length, "right")}${td_(`<b style="color:${c.pct >= 0.9 ? GREEN : RED};">${mPct(c.pct)}</b>`, "right")}`)).join("\n    ")}
    ${TROW(`${td_("Network")}${td_(`${s.daysComplete} / ${s.daysPossible}`, "right")}${td_("")}${td_("")}${td_(mPct(s.compliance), "right")}`)}`)}
    ${mH("Hospitals with gaps")}
    ${gaps.some(c => c.partial.length || c.missing.some(d => !tail.has(d)))
      ? mList(gaps.filter(c => c.partial.length || c.missing.some(d => !tail.has(d))).map(c => `<b>${esc(c.name)}</b>: ${[c.missing.filter(d => !tail.has(d)).length ? `missing ${c.missing.filter(d => !tail.has(d)).map(mDay).join(", ")}` : "", c.partial.length ? `partial ${c.partial.map(mDay).join(", ")}` : ""].filter(Boolean).join("; ")}`))
      : `<div>None${m.missingTail.length ? ` apart from ${m.missingTail.map(mDay).join(" and ")}, not loaded yet` : ""}.</div>`}
    ${mH("Data-quality exceptions (rule R4: payer figures do not add up to the total)")}
    ${m.r4.length ? box_(`${HROW(`${th_("Hospital")}${th_("Date")}${th_("Issue")}`)}${m.r4.map((x, i) => ZROW(i, `${td_(esc(x.hospital))}${td_(mDay(x.date), "", "white-space:nowrap;")}${td_(`${esc(x.issue)}<br><span style="color:${DIM};">${esc(x.detail)}</span>`)}`)).join("")}`)
      : `<div style="line-height:18px;">None in ${esc(m.monthLabel)}: on every reported day the payer figures add up to the totals entered.</div>`}`;

  // ---- 9. Risks and actions ----
  const rk = m.risks;
  const riskBody = `
    ${mH(`Red or Critical this month (${rk.redOrCritical.length})`)}
    ${rk.redOrCritical.length ? mList(rk.redOrCritical.map(r => `${esc(r.name)}: <b>${mPct(r.pct)}</b> of target (${M_LIGHT[r.status.tone]}), short by ${money(-r.variance)}`)) : `<div>None.</div>`}
    ${mH(`Below 100% of monthly target (${rk.belowTarget.length} of ${m.achievers.withTarget})`)}
    <div style="line-height:19px;">${rk.belowTarget.length ? esc(rk.belowTarget.map(r => `${r.name} ${mPct(r.pct)}`).join(" · ")) : "None: every hospital reached its target."}</div>
    ${mH("Recommended focus for the Executive Director")}
    ${rk.focus.length ? mList(rk.focus.map(esc)) : `<div>Nothing in the data calls for escalation this month.</div>`}`;

  const workflowItem = (icon, label) => `${iconCell(icon, 22, 22, 6, "wf-ico")}<td style="${T(13.5, 400, NAVY, "white-space:nowrap;")}">${label}</td>`;
  const arrow = `<td align="center" class="wf-arrow" style="${T(16, 700, RED)}padding:0 8px;">&rarr;</td>`;
  const dataAsOf = iso => `${Number(iso.slice(8, 10))} ${MON_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}, ${iso.slice(11, 16)} WAT`;
  const banner = m.missingTail.length ? `
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:0 26px 10px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="#FDF1DC" style="background-color:#FDF1DC;border-radius:8px;padding:11px 14px;${T(12.5, 400, INK, "line-height:18px;")}"><b style="color:${AMBER_TEXT};">Data through ${mDay(m.dataThrough)}.</b> ${m.missingTail.map(mDay).join(" and ")} ${m.missingTail.length > 1 ? "are" : "is"} not loaded yet, so ${esc(m.monthLabel)} revenue and activity are understated until the next data refresh.</td>
  </tr></table></td></tr>` : "";

  return `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>CareOne Enterprise Control Tower — ${reportName} — ${esc(m.monthLabel)}</title>
<!--[if mso]>
<style type="text/css">table {border-collapse:collapse;} body,table,td,a {font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:${PAGE}; }
  /* Cosmetic only: if a client drops this block the numbers are unchanged, just plainer. */
  .x { font-size:10.5px; color:${DIM}; white-space:nowrap; }
  .g { color:${GREEN}; }
  .r { color:${RED}; }
  .nw { white-space:nowrap; }
  .xb { display:block; padding-top:3px; font-size:10.5px; color:${DIM}; }
  .bl { color:${RED}; font-weight:700; padding:3px 0; }
  .li { padding:3px 0; }
  .dg, .da, .dr, .dc, .dn { font-size:14px; }
  .dg { color:${GREEN}; } .da { color:${AMBER}; } .dr { color:${RED}; } .dc { color:${BLACK}; } .dn { color:${GRAY_DOT}; }
  @media only screen and (max-width:640px) {
    .container { width:100% !important; }
    .outer { padding:10px 4px !important; }
    .pad { padding-left:12px !important; padding-right:12px !important; }
    .kpi-desk, .m-desk { display:none !important; }
    .kpi-mob, .m-mob { display:table !important; width:100% !important; max-height:none !important; overflow:visible !important; }
    .logo-cell { width:64px !important; min-width:64px !important; padding-right:10px !important; }
    .logo-cell img { width:64px !important; height:64px !important; }
    .h-text { padding-left:12px !important; }
    .h-l1 { font-size:15px !important; line-height:19px !important; }
    .h-l2 { font-size:16px !important; line-height:20px !important; }
    .h-l3, .h-date { font-size:12px !important; line-height:16px !important; }
    .wf-wrap td { font-size:10.5px !important; white-space:normal !important; }
    .wf-ico { width:16px !important; min-width:16px !important; padding-right:4px !important; }
    .wf-ico img { width:16px !important; height:16px !important; }
    .wf-arrow { padding:0 3px !important; font-size:12px !important; }
    .wf-box { padding:10px 4px !important; }
    .box { padding:14px 10px 12px !important; }
    .tbl td { padding:7px 3px !important; font-size:10.5px !important; line-height:14px !important; }
    .tbl td.st { white-space:normal !important; }
    .wk td { padding:6px 3px !important; font-size:9.5px !important; }
    .wk td:first-child { padding-left:4px !important; }
    .co, .half { display:block !important; width:100% !important; box-sizing:border-box !important; padding:0 0 8px !important; }
    .lg { display:block !important; padding:2px 0 !important; }
    .foot-mid { width:auto !important; white-space:normal !important; font-size:11px !important; line-height:15px !important; }
  }
</style>
</head>
<body bgcolor="${PAGE}" style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
<tr><td align="center" class="outer" style="padding:18px 8px;">

<table class="container" width="700" cellpadding="0" cellspacing="0" border="0" style="width:700px;max-width:700px;border:1px solid ${LINE};border-radius:14px;">

  <!-- 1. HEADER -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};border-radius:14px 14px 0 0;padding:24px 26px 18px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="118" class="logo-cell" style="padding-right:16px;">${img("logo-header", 102, 102, "CareOne Enterprise Control Tower")}</td>
      <td width="2" bgcolor="${RED}" style="background-color:${RED};width:2px;font-size:1px;line-height:1px;">&nbsp;</td>
      <td class="h-text" style="padding-left:18px;">
        <div class="h-l1" style="${T(22, 700, NAVY, "letter-spacing:0.3px;line-height:26px;")}">CONTROL TOWER</div>
        <div class="h-l2" style="${T(24, 700, RED, "letter-spacing:0.2px;line-height:28px;")}">MONTHLY SITUATION REPORT</div>
        <div class="h-l3" style="${T(16, 700, NAVY, "line-height:22px;padding-top:2px;")}">${esc(m.monthLabel)}</div>
        <table cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>
          ${iconCell("cal", 16, 16, 8)}
          <td class="h-date" style="${T(13, 400, NAVY, "line-height:18px;")}">Reporting period: ${Number(m.periodStart.slice(8, 10))}–${Number(m.periodEnd.slice(8, 10))} ${esc(m.monthLabel)}</td>
        </tr></table>
        <div class="h-date" style="${T(12, 400, DIM, "line-height:17px;padding-top:3px;")}">Generated ${mDayYear(m.generatedOn)} &middot; Data through ${m.dataThrough ? mDayYear(m.dataThrough) : "—"}</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- WORKFLOW STRIP -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:0 26px 14px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="wf-wrap"><tr>
      <td bgcolor="#EEF2F7" align="center" class="wf-box" style="background-color:#EEF2F7;border-radius:8px;border:1px solid #E1E7EF;padding:13px 8px;">
        <table cellpadding="0" cellspacing="0" border="0" align="center"><tr>
          ${workflowItem("wf-eye", "See Early")}${arrow}${workflowItem("wf-alert", "Escalate Fast")}${arrow}${workflowItem("wf-gear", "Act Decisively")}${arrow}${workflowItem("wf-check", "Close Completely")}
        </tr></table>
      </td>
    </tr></table>
  </td></tr>
  ${banner}

  <!-- 2. NETWORK SNAPSHOT -->
  <tr><td bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};padding:0 21px 6px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:6px 5px 12px;">${sectionHead("badge-chart", "NETWORK SNAPSHOT")}</td></tr></table>
    <table class="kpi-desk" width="100%" cellpadding="0" cellspacing="0" style="${FONT}color:${INK};">
      <tr>${cd[0]}${cd[1]}${cd[2]}</tr>
      <tr>${cd[3]}${cd[4]}${cd[5]}</tr>
      <tr>${cd[6]}${cd[7]}${cd[8]}</tr>
    </table>
    <!--[if !mso]><!-->
    <table class="kpi-mob" width="100%" cellpadding="0" cellspacing="6" border="0" style="display:none;max-height:0;overflow:hidden;mso-hide:all;border-collapse:separate;${FONT}color:${INK};">
      <tr>${cm[0]}${cm[1]}</tr>
      <tr>${cm[2]}${cm[3]}</tr>
      <tr>${cm[4]}${cm[5]}</tr>
      <tr>${cm[6]}${cm[7]}</tr>
      <tr>${cm[8]}<td width="50%" style="width:50%;">&nbsp;</td></tr>
    </table>
    <!--<![endif]-->
    <div style="${T(11.5, 400, DIM, "line-height:16px;padding:2px 5px 6px;")}">${snapshotNote}</div>
  </td></tr>

  <!-- 3. REVENUE ACHIEVEMENT BY HOSPITAL (HEADLINE) -->
  ${mPanel("badge-chart", "REVENUE ACHIEVEMENT BY HOSPITAL", achBody, { headline: true, color: RED })}

  <!-- 4. TRAFFIC LIGHT -->
  ${mPanel("badge-hospital", "HOSPITAL TRAFFIC-LIGHT STATUS", tlBody)}

  <!-- 5. SCORECARD -->
  ${mPanel("badge-chart", "HOSPITAL SCORECARD / RANKING", scBody)}

  <!-- 6. PERFORMANCE DETAIL -->
  ${mPanel("badge-hospital", "PERFORMANCE DETAIL PER HOSPITAL", detBody)}

  <!-- 7. TREND -->
  ${mPanel("badge-chart", "TREND ANALYSIS", trendBody)}

  <!-- 8. COMPLIANCE AND DATA QUALITY -->
  ${mPanel("badge-alert", "REPORTING COMPLIANCE AND DATA QUALITY", compBody)}

  <!-- 9. RISKS AND ACTIONS -->
  ${mPanel("badge-alert", "RISKS AND ACTIONS", riskBody, { tint: true, color: RED })}

  <!-- CALL TO ACTION -->
  <tr><td class="pad" bgcolor="${WHITE}" align="center" style="background-color:${WHITE};padding:14px 26px 22px;">
    <div style="${T(13, 400, DIM, "line-height:19px;padding-bottom:12px;")}">For full network intelligence and real-time performance data, visit the CareOne Enterprise Control Tower</div>
    <table cellpadding="0" cellspacing="0" border="0" align="center"><tr>
      <td bgcolor="${RED}" align="center" style="background-color:${RED};border-radius:8px;">
        <a href="https://care-one-control-tower-theta.vercel.app/" target="_blank" style="${T(13.5, 700, WHITE, "display:block;padding:12px 30px;text-decoration:none;letter-spacing:0.2px;")}"><font color="${WHITE}">Open the Control Tower &rarr;</font></a>
      </td>
    </tr></table>
  </td></tr>

  <!-- 10. FOOTER -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:4px 26px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-bottom:1px solid ${LINE};font-size:1px;line-height:1px;">&nbsp;</td>
      <td align="center" width="330" class="foot-mid" style="padding:0 10px;${T(12, 400, NAVY)}white-space:nowrap;">CareOne Enterprise Control Tower &nbsp;<span style="color:${RED};">|</span>&nbsp; Data. Insight. Action.</td>
      <td style="border-bottom:1px solid ${LINE};font-size:1px;line-height:1px;">&nbsp;</td>
    </tr></table>
    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:8px;"><tr><td>${img("heartbeat", 46, 18, "")}</td></tr></table>
    <div align="center" style="${T(11, 400, DIM, "line-height:16px;")}padding-top:8px;">Data quality: every figure is recomputed from each hospital's daily components (revenue = private + HMO + NHIA + company); sheet totals are not used. Days whose payer figures do not add up (rule R4) are listed above and do not stop the report.</div>
    ${m.dataReadAt ? `<div align="center" style="${T(11, 400, DIM)}padding-top:6px;">Data as of ${dataAsOf(m.dataReadAt)}</div>` : ""}
  </td></tr>

  <tr><td bgcolor="${NAVY}" style="background-color:${NAVY};border-radius:0 0 14px 14px;height:14px;font-size:1px;line-height:14px;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="86%" bgcolor="${NAVY}" style="background-color:${NAVY};height:14px;font-size:1px;line-height:14px;border-radius:0 0 0 14px;">&nbsp;</td>
      <td width="14%" bgcolor="${RED}" style="background-color:${RED};height:14px;font-size:1px;line-height:14px;border-radius:0 0 14px 0;">&nbsp;</td>
    </tr></table>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}
