const RED = "#C0392F", INK = "#15191D", DIM = "#5C6773", LINE = "#E2E5E9", SOFT = "#F1F3F5";
const GREEN = "#1E8E5A", GREEN_BG = "#E9F7EF", AMBER = "#B4680A", AMBER_BG = "#FDF2E3", RED_BG = "#FCEBEA";

const money = v => v === null || v === undefined ? "—" : "₦" + Math.round(v).toLocaleString();
const pct = v => v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
const int = v => v === null || v === undefined ? "—" : Math.round(v).toLocaleString();
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function dateLabel(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m-1]} ${y}`;
}

function kpiCard({ icon, iconBg, label, value, sub }) {
  return `
  <td width="33.33%" valign="top" style="padding:0 6px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-radius:8px;">
      <tr><td style="padding:16px 14px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="38" style="background:${iconBg};border-radius:19px;width:38px;height:38px;text-align:center;vertical-align:middle;font-size:17px;line-height:38px;">${icon}</td>
          <td style="padding-left:10px;font:400 12.5px Arial,Helvetica,sans-serif;color:${DIM};vertical-align:middle;">${esc(label)}</td>
        </tr></table>
        <div style="font:700 22px Arial,Helvetica,sans-serif;color:${INK};margin-top:10px;letter-spacing:-.2px;">${value}</div>
        ${sub ? `<div style="font:400 11px Arial,Helvetica,sans-serif;color:${DIM};margin-top:4px;">${sub}</div>` : ""}
      </td></tr>
    </table>
  </td>`;
}

function statusPill(tone, label) {
  const map = { good: [GREEN_BG, GREEN], warn: [AMBER_BG, AMBER], bad: [RED_BG, RED], critical: [RED, "#fff"], neutral: [SOFT, DIM] };
  const [bg, fg] = map[tone];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:11px;background:${bg};color:${fg};font:700 11px Arial,Helvetica,sans-serif;white-space:nowrap;">${esc(label)}</span>`;
}

function priorityPill(p) {
  const map = { HIGH: [RED, "#fff"], MEDIUM: [AMBER, "#fff"], LOW: [SOFT, DIM] };
  const [bg, fg] = map[p] || map.LOW;
  return `<span style="display:inline-block;padding:3px 12px;border-radius:11px;background:${bg};color:${fg};font:700 11px Arial,Helvetica,sans-serif;">${p}</span>`;
}

export function renderDSREmail(dsr, opts) {
  const { logoHeaderUrl, logoWatermarkUrl } = opts;
  const s = dsr.snapshot;

  const preheader = `Network revenue ${money(s.revenue)} · ${dsr.reportingStatus.reportingCount}/${dsr.reportingStatus.totalCount} hospitals reporting · ${dsr.exceptions.length} exceptions requiring attention.`;

  const cards = [
    kpiCard({ icon:"₦", iconBg:"#FCEBEA", label:"Total Revenue", value: money(s.revenue), sub: `${dsr.period.label}, MTD` }),
    kpiCard({ icon:"👥", iconBg:"#EAF1F8", label:"Attendance", value: int(s.attendance) }),
    kpiCard({ icon:"🛏", iconBg:"#F1EAF8", label:"Admissions", value: int(s.admissions) }),
    kpiCard({ icon:"₦", iconBg:"#E9F7EF", label:"ARPE", value: money(s.arpe) }),
    kpiCard({ icon:"%", iconBg:"#FDF2E3", label:"Admission Conversion", value: pct(s.conversion) }),
    kpiCard({ icon:"🎯", iconBg:"#EAF7F5", label:"Revenue Achievement",
      value: s.targetsKnown === 0 ? "Not configured" : pct(s.networkAchievement),
      sub: s.targetsKnown === 0 ? "Awaiting revenue targets" : `${s.targetsKnown}/${s.totalHospitals} hospitals have a target set` }),
  ];
  const cardRows = `<tr>${cards.slice(0,3).join("")}</tr><tr>${cards.slice(3,6).join("")}</tr>`;

  const achievementRows = dsr.hospitalAchievement.map(h => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font:600 13px Arial,Helvetica,sans-serif;color:${INK};">${esc(h.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font:400 13px Arial,Helvetica,sans-serif;color:${INK};text-align:right;">${money(h.mtd)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font:400 13px Arial,Helvetica,sans-serif;color:${DIM};text-align:right;">${h.target ? money(h.target) : "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font:600 13px Arial,Helvetica,sans-serif;color:${INK};text-align:right;">${h.pct !== null ? pct(h.pct) : "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};text-align:right;">${statusPill(h.status.tone, h.status.label)}</td>
    </tr>`).join("");

  const exceptionRows = dsr.exceptions.length ? dsr.exceptions.map(e => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font:600 13px Arial,Helvetica,sans-serif;color:${INK};">${esc(e.hospital)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font:400 13px Arial,Helvetica,sans-serif;color:${INK};">${esc(e.issue)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${LINE};text-align:center;">${priorityPill(e.priority)}</td>
    </tr>`).join("")
    : `<tr><td colspan="3" style="padding:16px 12px;font:400 13px Arial,Helvetica,sans-serif;color:${DIM};text-align:center;">No exceptions open today.</td></tr>`;

  const notReportingLine = dsr.reportingStatus.notReporting.length
    ? dsr.reportingStatus.notReporting.join(" | ") : "None — full network reporting";

  return `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>CareOne Enterprise Control Tower — Daily Situation Report</title>
<!--[if mso]>
<style type="text/css">table {border-collapse:collapse;} body,table,td,a {font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
<style>
  body { margin:0; padding:0; background:${SOFT}; }
  @media only screen and (max-width:640px) {
    .email-container { width:100% !important; }
    .kpi-card-cell { display:block !important; width:100% !important; padding:0 0 12px !important; }
    .stat-cell { display:block !important; width:100% !important; text-align:left !important; padding:8px 0 !important; }
    .hide-mobile { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${SOFT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${SOFT};">${esc(preheader)}</div>

<center>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};">
<tr><td align="center" style="padding:20px 10px;">

<!--[if gte mso 9]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:680px;">
<v:fill type="frame" src="${logoWatermarkUrl}" color="#ffffff" />
<v:textbox inset="0,0,0,0">
<![endif]-->
<div style="background-image:url('${logoWatermarkUrl}');background-repeat:no-repeat;background-position:center 620px;background-size:380px auto;">

<table role="presentation" class="email-container" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:680px;background:#ffffff;border:1px solid ${LINE};border-radius:10px;overflow:hidden;">

  <tr><td style="padding:4px 0;background:linear-gradient(90deg,${INK},${RED});">&nbsp;</td></tr>

  <tr><td style="padding:24px 28px 16px;">
    <table role="presentation" width="100%"><tr>
      <td width="80" valign="top"><img src="${logoHeaderUrl}" width="64" alt="CareOne Control Tower" style="display:block;border:0;"></td>
      <td valign="top" style="padding-left:16px;">
        <div style="font:700 18px Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.4px;">CONTROL TOWER</div>
        <div style="font:800 24px Arial,Helvetica,sans-serif;color:${RED};letter-spacing:.2px;line-height:1.15;">DAILY SITUATION REPORT</div>
        <div style="font:400 12.5px Arial,Helvetica,sans-serif;color:${DIM};margin-top:3px;">Network Performance &amp; Exception Management</div>
        <div style="font:700 12px Arial,Helvetica,sans-serif;color:${RED};margin-top:7px;">&#128197; ${dateLabel(dsr.asOfDate)}</div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 28px 18px;">
    <table role="presentation" width="100%" style="background:${SOFT};border-radius:5px;"><tr>
      <td align="center" style="padding:9px 6px;font:700 11px Arial,Helvetica,sans-serif;color:${DIM};letter-spacing:.2px;">
        SEE EARLY &nbsp;→&nbsp; ESCALATE FAST &nbsp;→&nbsp; ACT DECISIVELY &nbsp;→&nbsp; CLOSE COMPLETELY
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 22px 6px;">
    <table role="presentation" width="100%"><tr>
      <td style="padding:0 6px 10px;font:800 13.5px Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.2px;">&#128202; NETWORK SNAPSHOT</td>
    </tr></table>
    <table role="presentation" width="100%">${cardRows}</table>
  </td></tr>

  <tr><td style="padding:8px 22px 18px;">
    <table role="presentation" width="100%" style="background:${RED_BG};border-radius:8px;border:1px solid #F3C9C6;"><tr>
      <td width="46" style="padding:14px 0 14px 16px;font-size:20px;vertical-align:middle;">&#9888;&#65039;</td>
      <td style="padding:14px 10px;font:800 13px Arial,Helvetica,sans-serif;color:${INK};vertical-align:middle;">REPORTING STATUS</td>
      <td align="center" style="padding:14px 10px;vertical-align:middle;border-left:1px solid #F3C9C6;">
        <div style="font:400 11px Arial,Helvetica,sans-serif;color:${DIM};">Hospitals Reporting</div>
        <div style="font:800 18px Arial,Helvetica,sans-serif;color:${INK};">${dsr.reportingStatus.reportingCount} / ${dsr.reportingStatus.totalCount}</div>
      </td>
      <td align="center" style="padding:14px 16px 14px 10px;vertical-align:middle;border-left:1px solid #F3C9C6;">
        <div style="font:400 11px Arial,Helvetica,sans-serif;color:${DIM};">Not Reporting</div>
        <div style="font:800 18px Arial,Helvetica,sans-serif;color:${RED};">${dsr.reportingStatus.notReporting.length}</div>
      </td>
    </tr>
    <tr><td colspan="4" style="padding:0 16px 12px;font:400 11.5px Arial,Helvetica,sans-serif;color:${DIM};">Not reporting: <strong style="color:${INK};">${esc(notReportingLine)}</strong></td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 22px 10px;font:800 13.5px Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.2px;">&#128202; REVENUE ACHIEVEMENT BY HOSPITAL</td></tr>
  <tr><td style="padding:0 22px 4px;">
    <div style="padding:7px 12px;margin-bottom:8px;background:${SOFT};border-radius:6px;font:400 11px Arial,Helvetica,sans-serif;color:${DIM};">Day ${dsr.daysElapsed} of ${dsr.daysInMonth} &mdash; Achievement % is measured against each hospital's target-to-date (Target &times; ${dsr.daysElapsed}/${dsr.daysInMonth}), not the full monthly figure. 100% means exactly on pace for the month.</div>
    ${dsr.snapshot.targetsKnown === 0 ? `<div style="padding:8px 12px;margin-bottom:8px;background:${AMBER_BG};border-radius:6px;font:400 11.5px Arial,Helvetica,sans-serif;color:${INK};">Revenue targets have not yet been configured for any hospital — Target, Achievement % and Status will activate automatically once supplied.</div>` : ""}
    <table role="presentation" width="100%" style="border:1px solid ${LINE};border-radius:6px;overflow:hidden;">
      <tr style="background:${SOFT};">
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${DIM};">HOSPITAL</td>
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${DIM};text-align:right;">MTD REVENUE (₦)</td>
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${DIM};text-align:right;">TARGET (₦)</td>
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${DIM};text-align:right;">ACHIEVEMENT %</td>
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${DIM};text-align:right;">STATUS</td>
      </tr>
      ${achievementRows}
    </table>
  </td></tr>

  <tr><td style="padding:22px 22px 10px;font:800 13.5px Arial,Helvetica,sans-serif;color:${INK};letter-spacing:.2px;">&#9888;&#65039; EXCEPTIONS REQUIRING ATTENTION</td></tr>
  <tr><td style="padding:0 22px 20px;">
    <table role="presentation" width="100%" style="border:1px solid ${LINE};border-radius:6px;overflow:hidden;">
      <tr style="background:${RED_BG};">
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${INK};">HOSPITAL</td>
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${INK};">ISSUE</td>
        <td style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:${INK};text-align:center;">PRIORITY</td>
      </tr>
      ${exceptionRows}
    </table>
  </td></tr>

  <tr><td style="padding:16px 22px;background:${SOFT};border-top:1px solid ${LINE};text-align:center;">
    <div style="font:400 11px Arial,Helvetica,sans-serif;color:${DIM};">CareOne Enterprise Control Tower &nbsp;|&nbsp; Data. Insight. Action.</div>
  </td></tr>

</table>

</div>
<!--[if gte mso 9]>
</v:textbox>
</v:rect>
<![endif]-->

</td></tr>
</table>
</center>
</body>
</html>`;
}
