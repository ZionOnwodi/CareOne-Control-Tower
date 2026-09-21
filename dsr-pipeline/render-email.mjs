// Renders the Daily Situation Report as an HTML email that follows the approved design template.
//
// IMAGES: every image (logo, icons) is referenced as  cid:<name>  and shipped INSIDE the message as
// an inline attachment (see send-email.mjs / EMAIL_ASSETS below). This is what makes them show in
// Gmail, Outlook and company web-mail without the recipient having to "load images".
// The connected Gmail assistant tool strips all <img> tags, so this HTML must be sent through SMTP
// (send-email.mjs) — not through that tool.
//
// STYLE RULES (email clients drop a lot): longhand CSS only (no `font:` / `background:` shorthand),
// coloured cells use BOTH a bgcolor attribute and background-color, pills are one-cell tables,
// no emoji, no gradients.

import path from "path";
import { fileURLToPath } from "url";
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** cid name -> file on disk. send-email.mjs attaches each one that the HTML references. */
export const EMAIL_ASSETS = {
  "logo-header": path.join(HERE, "..", "public", "logo-header.png"),
  ...Object.fromEntries([
    "badge-chart", "badge-hospital", "badge-alert",
    "kpi-revenue", "kpi-attendance", "kpi-admissions", "kpi-arpe", "kpi-conversion", "kpi-achievement",
    "wf-eye", "wf-alert", "wf-gear", "wf-check", "cal", "rs-hospital", "rs-alert", "heartbeat",
  ].map(n => [n, path.join(HERE, "email-assets", n + ".png")])),
};

// ---- palette (from the template) ----
const RED = "#D31E24", RED_DEEP = "#A61B14", NAVY = "#14213D", INK = "#1F2937", DIM = "#6B7787";
const LINE = "#E6E9EE", HEAD_BG = "#EEF1F5", PAGE = "#F4F6F8", WHITE = "#FFFFFF";
const PINK = "#FDF1F1", PINK_LINE = "#F6D5D5";
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

const img = (name, w, h, alt = "") =>
  `<img src="cid:${name}" width="${w}" height="${h}" alt="${esc(alt)}" style="display:block;border:0;outline:none;width:${w}px;height:${h}px;">`;

// One-cell-table pill (Gmail keeps table-cell backgrounds; it drops them on spans).
function pill(bg, fg, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;"><tr>
<td bgcolor="${bg}" align="center" style="background-color:${bg};border-radius:11px;padding:4px 13px;${T(11.5, 700, fg, "line-height:14px;white-space:nowrap;")}"><font color="${fg}">${esc(label)}</font></td></tr></table>`;
}
const priorityPill = p => p === "HIGH" ? pill(RED, WHITE, "High") : p === "MEDIUM" ? pill("#F6B93B", "#3A2A00", "Medium") : pill("#E2E5E9", INK, "Low");

// Section heading: red badge icon + title + short red underline.
function sectionHead(badge, title, color = NAVY) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" width="46">${img(badge, 34, 34, "")}</td>
<td valign="middle">
  <div style="${T(15, 700, color, "letter-spacing:0.4px;line-height:20px;")}">${esc(title)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="62" height="3" bgcolor="${RED}" style="background-color:${RED};width:62px;height:3px;font-size:1px;line-height:3px;">&nbsp;</td></tr></table>
</td></tr></table>`;
}

function kpiCard({ icon, label, value, trend }) {
  const trendHtml = trend
    ? `<div style="${T(12, 700, trend.up ? GREEN : RED, "line-height:16px;padding-top:3px;")}">${trend.up ? "&uarr;" : "&darr;"} ${esc(trend.text)} <span style="${T(12, 400, DIM)}">vs. last month</span></div>`
    : "";
  return `
  <td class="kpi" width="33.33%" valign="top" style="padding:0 5px 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;">
      <tr><td bgcolor="${WHITE}" style="background-color:${WHITE};border-radius:8px;padding:14px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" width="60">${img(icon, 48, 48, "")}</td>
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

const th = (label, align = "left") =>
  `<td bgcolor="${HEAD_BG}" align="${align}" style="background-color:${HEAD_BG};padding:11px 10px;${T(12, 400, INK, "line-height:15px;")}">${label}</td>`;
const cell = (extra = "") => `padding:11px 10px;border-bottom:1px solid ${LINE};${extra}`;

const STATUS_DOT = { good: GREEN, warn: AMBER, bad: RED, critical: RED_DEEP, neutral: GRAY_DOT };
const STATUS_LABEL = { "Target not configured": "No target set" };

export function renderDSREmail(dsr, opts = {}) {
  const { logoWatermarkUrl = "" } = opts;
  const s = dsr.snapshot, rs = dsr.reportingStatus, tr = s.trend || {};
  const day = dsr.daysElapsed, dim = dsr.daysInMonth;
  const allReporting = rs.notReporting.length === 0;

  const preheader = `Network revenue ${money(s.revenue)} · ${rs.reportingCount}/${rs.totalCount} hospitals reporting · ${dsr.exceptions.length} items need attention.`;

  const cards = [
    kpiCard({ icon: "kpi-revenue", label: "Total Revenue", value: money(s.revenue), trend: tr.revenue }),
    kpiCard({ icon: "kpi-attendance", label: "Attendance", value: num(s.attendance), trend: tr.attendance }),
    kpiCard({ icon: "kpi-admissions", label: "Admissions", value: num(s.admissions), trend: tr.admissions }),
    kpiCard({ icon: "kpi-arpe", label: "ARPE", value: money(s.arpe), trend: tr.arpe }),
    kpiCard({ icon: "kpi-conversion", label: "Admission Conversion", value: pct1(s.conversion), trend: tr.conversion }),
    kpiCard({ icon: "kpi-achievement", label: "Revenue Achievement", value: s.targetsKnown === 0 ? "Not set" : pct0(s.networkAchievement), trend: tr.achievement }),
  ];

  const achievementRows = dsr.hospitalAchievement.map(h => {
    const dot = STATUS_DOT[h.status.tone] || GRAY_DOT;
    const label = STATUS_LABEL[h.status.label] || h.status.label;
    return `
    <tr>
      <td style="${cell(T(13, 400, INK))}">${esc(h.name)}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.mtd === null ? "—" : num(h.mtd)}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.target ? num(h.target) : "—"}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.targetToDate ? num(h.targetToDate) : "—"}</td>
      <td align="right" style="${cell(T(13, 400, INK))}">${h.pct !== null ? pct0(h.pct) : "—"}</td>
      <td style="${cell(T(13, 400, INK, "white-space:nowrap;"))}"><span style="color:${dot};font-size:15px;line-height:13px;">&#9679;</span>&nbsp; ${esc(label)}</td>
    </tr>`;
  }).join("");

  const exceptionRows = dsr.exceptions.length ? dsr.exceptions.map(e => `
    <tr>
      <td valign="middle" bgcolor="${WHITE}" style="${cell(T(13, 400, INK) + `background-color:${WHITE};`)}">${esc(e.hospital)}</td>
      <td valign="middle" bgcolor="${WHITE}" style="${cell(T(13, 400, INK, "line-height:18px;") + `background-color:${WHITE};`)}">${esc(e.issue)}</td>
      <td valign="middle" width="84" bgcolor="${WHITE}" style="${cell(`background-color:${WHITE};`)}">${priorityPill(e.priority)}</td>
    </tr>`).join("")
    : `<tr><td colspan="3" align="center" style="padding:16px 12px;${T(13, 400, DIM)}">No items need attention today.</td></tr>`;

  const notReporting = allReporting
    ? `<span style="${T(13, 400, INK)}">None &mdash; every hospital has reported.</span>`
    : rs.notReporting.map(n => `<span style="${T(13, 400, INK)}">${esc(n)}</span>`).join(`<span style="${T(13, 400, DIM)}">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`);

  const workflowItem = (icon, label) => `<td valign="middle" width="22" style="padding:0 6px 0 0;">${img(icon, 22, 22, "")}</td><td valign="middle" style="${T(13.5, 400, NAVY, "white-space:nowrap;")}">${label}</td>`;
  const arrow = `<td valign="middle" align="center" style="${T(16, 700, RED)}padding:0 8px;">&rarr;</td>`;

  return `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>CareOne Enterprise Control Tower — Daily Situation Report</title>
<!--[if mso]>
<style type="text/css">table {border-collapse:collapse;} body,table,td,a {font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
<style>
  body { margin:0; padding:0; background-color:${PAGE}; }
  @media only screen and (max-width:640px) {
    .container { width:100% !important; }
    .pad { padding-left:12px !important; padding-right:12px !important; }
    .kpi { display:block !important; width:100% !important; padding:0 0 10px !important; }
    .wf-wrap td { font-size:11px !important; }
  }
</style>
</head>
<body bgcolor="${PAGE}" style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
<tr><td align="center" style="padding:18px 8px;">

<table role="presentation" class="container" width="700" cellpadding="0" cellspacing="0" border="0" style="width:700px;max-width:700px;border:1px solid ${LINE};border-radius:14px;">

  <!-- HEADER -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};border-radius:14px 14px 0 0;padding:24px 26px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="118" valign="middle" style="padding-right:16px;">${img("logo-header", 102, 102, "CareOne Enterprise Control Tower")}</td>
      <td width="2" bgcolor="${RED}" style="background-color:${RED};width:2px;font-size:1px;line-height:1px;">&nbsp;</td>
      <td valign="middle" style="padding-left:18px;">
        <div style="${T(22, 700, NAVY, "letter-spacing:0.3px;line-height:26px;")}">CONTROL TOWER</div>
        <div style="${T(24, 700, RED, "letter-spacing:0.2px;line-height:28px;")}">DAILY SITUATION REPORT</div>
        <div style="${T(14, 400, NAVY, "line-height:20px;padding-top:3px;")}">Network Performance &amp; Exception Management</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr>
          <td valign="middle" width="24">${img("cal", 16, 16, "")}</td>
          <td valign="middle" style="${T(13.5, 400, NAVY)}">${longDate(dsr.dataThrough)}</td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>

  <!-- WORKFLOW STRIP -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:0 26px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="wf-wrap"><tr>
      <td bgcolor="#EEF2F7" align="center" style="background-color:#EEF2F7;border-radius:8px;border:1px solid #E1E7EF;padding:13px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
          ${workflowItem("wf-eye", "See Early")}${arrow}${workflowItem("wf-alert", "Escalate Fast")}${arrow}${workflowItem("wf-gear", "Act Decisively")}${arrow}${workflowItem("wf-check", "Close Completely")}
        </tr></table>
      </td>
    </tr></table>
  </td></tr>

  <!-- WATERMARK REGION: snapshot + reporting status -->
  <tr><td background="${logoWatermarkUrl}" bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};background-image:url('${logoWatermarkUrl}');background-repeat:no-repeat;background-position:center 46%;background-size:400px auto;padding:0 21px 6px;">
    <!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:700px;"><v:fill type="frame" src="${logoWatermarkUrl}" color="#ffffff" /><v:textbox inset="0,0,0,0"><![endif]-->

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:6px 5px 12px;">${sectionHead("badge-chart", "NETWORK SNAPSHOT")}</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${cards[0]}${cards[1]}${cards[2]}</tr>
      <tr>${cards[3]}${cards[4]}${cards[5]}</tr>
    </table>

    <!-- REPORTING STATUS -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr><td style="padding:0 5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${allReporting ? "#CDEBDC" : PINK_LINE};border-radius:10px;">
        <tr><td bgcolor="${allReporting ? "#F0FAF5" : PINK}" style="background-color:${allReporting ? "#F0FAF5" : PINK};border-radius:10px;padding:16px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle">${sectionHead("badge-hospital", "REPORTING STATUS", RED)}</td>
            <td valign="middle" width="190" style="padding-left:8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle" width="40">${img("rs-hospital", 30, 30, "")}</td>
                <td valign="middle"><div style="${T(19, 700, NAVY, "line-height:22px;")}">${rs.reportingCount} / ${rs.totalCount}</div><div style="${T(12, 400, DIM)}">Hospitals Reporting</div></td>
              </tr></table>
            </td>
            <td valign="middle" width="150" style="border-left:1px solid ${PINK_LINE};padding-left:16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle" width="40">${img("rs-alert", 30, 30, "")}</td>
                <td valign="middle"><div style="${T(19, 700, allReporting ? GREEN : NAVY, "line-height:22px;")}">${rs.notReporting.length}</div><div style="${T(12, 400, DIM)}">Not Reporting</div></td>
              </tr></table>
            </td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
            <td bgcolor="#FBE3E3" style="background-color:#FBE3E3;border-radius:8px;padding:11px 14px;">
              <span style="${T(13, 700, RED)}">Not Reporting:</span>&nbsp;&nbsp; ${notReporting}
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr></table>

    <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
  </td></tr>

  <!-- REVENUE ACHIEVEMENT BY HOSPITAL -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:12px 26px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;">
      <tr><td bgcolor="${WHITE}" style="background-color:${WHITE};border-radius:10px;padding:16px 16px 14px;">
        ${sectionHead("badge-chart", "REVENUE ACHIEVEMENT BY HOSPITAL")}
        <div style="${T(12, 400, DIM, "line-height:17px;padding:10px 0 12px;")}">Day ${day} of ${dim}. <b>Target to Date</b> = monthly target &times; ${day}/${dim}. <b>Achievement %</b> compares revenue earned so far with that figure; 100% means exactly on pace.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;">
          <tr>${th("Hospital")}${th("MTD Revenue (₦)", "right")}${th("Monthly Target (₦)", "right")}${th("Target to Date (₦)", "right")}${th("Achievement %", "right")}${th("Status")}</tr>
          ${achievementRows}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- EXCEPTIONS -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:10px 26px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${PINK_LINE};border-radius:10px;">
      <tr><td bgcolor="${PINK}" style="background-color:${PINK};border-radius:10px;padding:16px 16px 14px;">
        ${sectionHead("badge-alert", "EXCEPTIONS REQUIRING ATTENTION", RED)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;margin-top:12px;">
          <tr>${th("Hospital")}${th("Issue")}${th("Priority", "center")}</tr>
          ${exceptionRows}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td class="pad" bgcolor="${WHITE}" style="background-color:${WHITE};padding:4px 26px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="border-bottom:1px solid ${LINE};font-size:1px;line-height:1px;">&nbsp;</td>
      <td valign="middle" align="center" width="330" style="padding:0 10px;${T(12, 400, NAVY)}white-space:nowrap;">CareOne Enterprise Control Tower &nbsp;<span style="color:${RED};">|</span>&nbsp; Data. Insight. Action.</td>
      <td valign="middle" style="border-bottom:1px solid ${LINE};font-size:1px;line-height:1px;">&nbsp;</td>
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:8px;"><tr><td>${img("heartbeat", 46, 18, "")}</td></tr></table>
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
