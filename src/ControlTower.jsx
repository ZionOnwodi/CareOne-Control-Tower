import React, { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ============================================================================
   CAREONE ENTERPRISE CONTROL TOWER — V0.1
   ----------------------------------------------------------------------------
   Layering (see Product Specification §5):
     SOURCE ADAPTER -> CANONICAL MODEL -> KPI ENGINE -> DQ ENGINE
       -> REPORTING ENGINE -> EXCEPTION ENGINE -> UI
   No business logic lives in UI components.
   ========================================================================== */

/* ===========================================================================
   SECTION 1 — CONFIGURATION  (spec §3, §12; prompt "Configuration over hard-coding")
   Everything here is config, not code. Adding a hospital = adding an entry.
   =========================================================================== */

const CONFIG = {
  period: { id: "2026-09", label: "September 2026", start: "2026-09-01", end: "2026-09-30" },
  asOfDate: "2026-09-16",

  // Reporting calendar is NOT supplied by the business. Declared, not assumed.
  reportingCalendar: {
    cadence: "DAILY",
    cadenceConfirmed: false,          // -> gaps surface as POTENTIAL, never CONFIRMED (spec §14)
    countCurrentDayAsDue: false,      // same-day cut-off time unknown
    source: "Not supplied — default pending confirmation by Control Tower Lead",
  },

  hospitals: [
    { id: "ULT", name: "Ultimate",       sheetId: "1F5JFQ-2dVb63ZacL3yBRPfI6MDv4sa7kzhOOwQWv3ck" },
    { id: "FHM", name: "First Health",   sheetId: "1SKnMVaDwaMQHErQos8J3Lv3QaxeTS_CzLFvIvub1-_I" },
    { id: "MFM", name: "Mainframe",      sheetId: "16LaDrhJKk8ZkvAp6D45Ar5ccSEJvUe5urGmhW5LBf7Q" },
    { id: "NLB", name: "Neolife Babies", sheetId: "1h9urREc1Y66agFaAG5tnv2z3TJSHn1c27KAGPRHxXm8" },
    { id: "ROD", name: "Roding",         sheetId: "1Lr1KkTkkTX1yuaYFURJ_Vo5L5f_qwDcEse023dl9C9k" },
    { id: "TAL", name: "Talent",         sheetId: "1utlKxNij4ZOnAn2YfmJiv7dkEQUTPsl6ZB2OilonXtA" },
    { id: "HOS", name: "Hosanna",        sheetId: "11VunObagnwAkf8snGm5Ie16QQVhcFNjhcOEd73ytll4" },
  ],

  // Only N/A the specification explicitly authorises (spec §9, prompt §5).
  declaredNotApplicable: {
    NLB: {
      fields: ["priv", "privRev"],
      reason: "Product Specification §9 — Neolife payer mix is HMO-based; private fields are genuinely N/A.",
    },
  },

  // Empty by design. V0.1 must not invent thresholds (spec §12).
  thresholds: [],

  // Empty by design. No SLA values were supplied.
  slaRules: [],

  // Accountability defaults come from the mandate, not from guesswork (prompt §6).
  ownership: {
    REPORTING_COMPLIANCE: { role: "Business Manager", named: null },
    DATA_QUALITY:         { role: "Business Manager", named: null },
    PERFORMANCE:          { role: "Business Manager", named: null },
    OPERATIONAL_RISK:     { role: "Functional Head",  named: null },
  },

  modules: [
    { id: "overview",   label: "Network overview",   group: "Command" },
    { id: "hospitals",  label: "Hospital performance", group: "Command" },
    { id: "exceptions", label: "Exceptions",         group: "Command" },
    { id: "reporting",  label: "Reporting compliance", group: "Command" },
    { id: "revenue",    label: "Revenue & finance",  group: "Domains" },
    { id: "activity",   label: "Patient activity",   group: "Domains" },
    { id: "experience", label: "Patient experience", group: "Domains" },
    { id: "operations", label: "Operations",         group: "Domains" },
    { id: "clinical",   label: "Clinical & quality", group: "Domains" },
    { id: "workforce",  label: "People & workforce", group: "Domains" },
    { id: "digital",    label: "Digital systems",    group: "Domains" },
    { id: "followup",   label: "Follow-Up",          group: "Domains" },
    { id: "config",     label: "Rules & thresholds", group: "System" },
    { id: "lineage",    label: "Data lineage",       group: "System" },
  ],
};

/* ===========================================================================
   SECTION 2 — SOURCE ADAPTER  (prompt "Future EMR integration")
   The rest of the application never reads this shape directly. Swap this
   adapter for an EMR adapter and nothing downstream changes.
   =========================================================================== */

const SOURCE_META = {
  type: "GOOGLE_SHEETS",
  status: "SNAPSHOT",
  readAt: "2026-09-16T11:20:00+01:00",
  note: "Read directly from the seven live hospital sheets via the connected Drive account. Values are a point-in-time snapshot, not a live feed.",
};

// Raw rows exactly as submitted. `null` = blank cell. Strings preserved where the
// sheet stores text (so unit inconsistencies stay visible instead of being silently cast).
const RAW = {
  ULT: [
    { d:"2026-09-01", att:85, nreg:7, priv:8, hmo:58, comp:19, adm:13, onadm:21, disch:4, prom:88, privRev:731000, hmoRev:1033840, rConv:.1529, rTotRev:1764840, rARPE:20762.82, rMTD:1764840, ops:{revAch:"1.18%"} },
    { d:"2026-09-02", att:63, nreg:3, priv:8, hmo:48, comp:7,  adm:4,  onadm:22, disch:4, prom:68, privRev:723300, hmoRev:920010,  rConv:.0635, rTotRev:1643310, rARPE:26084.29, rMTD:3408150, ops:{revAch:"2.27%"} },
    { d:"2026-09-03", att:89, nreg:5, priv:6, hmo:70, comp:13, adm:7,  onadm:16, disch:12,prom:88, privRev:619546, hmoRev:1157849, rConv:.0787, rTotRev:1777395, rARPE:19970.73, rMTD:5185545, ops:{revAch:"3.46%"} },
    { d:"2026-09-04", att:61, nreg:4, priv:8, hmo:46, comp:7,  adm:12, onadm:18, disch:10,prom:70, privRev:4559000,hmoRev:1050085, rConv:.1967, rTotRev:5609085, rARPE:91952.21, rMTD:10794630,ops:{revAch:"7.20%"} },
    { d:"2026-09-05", att:33, nreg:4, priv:5, hmo:27, comp:1,  adm:5,  onadm:17, disch:7, prom:65, privRev:819572, hmoRev:682090,  rConv:.1515, rTotRev:1501662, rARPE:45504.91, rMTD:12296292,ops:{revAch:"8.20%"} },
    { d:"2026-09-06", att:35, nreg:5, priv:4, hmo:31, comp:0,  adm:5,  onadm:15, disch:6, prom:30, privRev:241000, hmoRev:881538.25,rConv:.1429, rTotRev:1122538.25,rARPE:32072.52,rMTD:13418830.25,ops:{revAch:"8.95%"} },
    { d:"2026-09-07", att:58, nreg:8, priv:10,hmo:43, comp:5,  adm:6,  onadm:16, disch:6, prom:50, privRev:820818, hmoRev:1553951, rConv:.1034, rTotRev:2374769, rARPE:40944.29, rMTD:15793599.25,ops:{revAch:"10.53%"} },
    { d:"2026-09-08", att:64, nreg:8, priv:7, hmo:46, comp:11, adm:10, onadm:21, disch:5, prom:50, privRev:467000, hmoRev:1307151.75,rConv:.1563,rTotRev:1774151.75,rARPE:27721.12,rMTD:17567751,ops:{revAch:"11.71%"} },
    { d:"2026-09-09", att:49, nreg:4, priv:6, hmo:37, comp:6,  adm:4,  onadm:15, disch:6, prom:50, privRev:784518, hmoRev:296881,  rConv:.0816, rTotRev:1081399, rARPE:22069.37, rMTD:18649150,ops:{revAch:"12.43%"} },
    { d:"2026-09-10", att:65, nreg:2, priv:9, hmo:50, comp:6,  adm:6,  onadm:17, disch:4, prom:60, privRev:927978, hmoRev:3100111, rConv:.0923, rTotRev:4028089, rARPE:61970.60, rMTD:22677239, ops:{revAch:"15.12%"} },
    { d:"2026-09-11", att:59, nreg:7, priv:5, hmo:41, comp:13, adm:4,  onadm:13, disch:7, prom:62, privRev:1075000, hmoRev:523670,  rConv:.0678, rTotRev:1598670, rARPE:27096.10, rMTD:24275909, ops:{revAch:"16.18%"} },
    { d:"2026-09-12", att:57, nreg:8, priv:5, hmo:44, comp:8,  adm:6,  onadm:14, disch:6, prom:54, privRev:819000, rTotRev:819000, rARPE:14368.42, rMTD:25094909, ops:{revAch:"16.73%"} },
    { d:"2026-09-13", att:46, nreg:4, priv:2, hmo:43, comp:1,  adm:1,  onadm:8,  disch:7, prom:42, privRev:156327, rTotRev:156327, rARPE:3398.41, rMTD:25251236, ops:{revAch:"16.83%"} },
  ],
  FHM: [
    { d:"2026-09-01", att:2, nreg:0, priv:2, hmo:0, adm:0, onadm:3, disch:0, yld:2, tat:15, det:0, prom:1, indiff:1, privRev:769000, rConv:0, rPctY:1, rNPS:.5, rTotRev:769000, rARPE:384500, rMTD:769000, ops:{revAch:"1.71%"} },
    { d:"2026-09-02", att:2, nreg:0, priv:2, hmo:0, adm:0, onadm:3, disch:0, yld:2, tat:11.5, det:0, prom:2, indiff:0, privRev:235000, rConv:0, rPctY:1, rNPS:1, rTotRev:235000, rARPE:117500, rMTD:1004000, ops:{revAch:"2.23%"} },
    { d:"2026-09-03", att:1, nreg:0, priv:1, hmo:0, adm:0, onadm:3, disch:0, yld:1, tat:60, det:0, prom:1, indiff:0, privRev:150000, rConv:0, rPctY:1, rNPS:1, rTotRev:150000, rARPE:150000, rMTD:1154000, ops:{revAch:"2.56%"} },
    { d:"2026-09-04", att:0, nreg:0, priv:0, hmo:0, adm:0, onadm:3, disch:0, yld:0, tat:0, det:0, prom:0, indiff:0, privRev:0, rTotRev:0, rMTD:1154000, ops:{revAch:"2.56%"} },
    { d:"2026-09-05", att:1, nreg:1, priv:1, hmo:0, adm:0, onadm:3, disch:0, yld:1, tat:97, det:0, prom:1, indiff:0, privRev:0, rConv:0, rPctY:1, rNPS:1, rTotRev:0, rARPE:0, rMTD:1154000, ops:{revAch:"2.56%"} },
    { d:"2026-09-06", att:7, nreg:1, priv:6, hmo:1, adm:0, onadm:3, disch:0, yld:7, tat:132, det:0, prom:7, indiff:0, privRev:680000, hmoRev:31312.50, rConv:0, rPctY:1, rNPS:1, rTotRev:711312.50, rARPE:101616.07, rMTD:1865312.50, ops:{revAch:"4.15%"} },
    { d:"2026-09-07", att:0, nreg:0, priv:0, hmo:0, adm:0, onadm:3, disch:0, yld:0, tat:0, det:0, prom:0, indiff:0, privRev:0, rTotRev:0, rMTD:1865312.50, ops:{revAch:"4.15%"} },
    { d:"2026-09-08", att:0, nreg:0, priv:0, hmo:0, adm:null, onadm:2, disch:1, yld:0, tat:0, det:0, prom:0, indiff:0, privRev:50000, rTotRev:50000, rMTD:1915312.50, ops:{revAch:"4.26%"} },
    { d:"2026-09-09", att:6, nreg:3, priv:3, hmo:3, adm:0, onadm:2, disch:0, yld:6, tat:80, det:0, prom:5, indiff:0, privRev:120000, hmoRev:148800, rConv:0, rPctY:1, rNPS:1, rTotRev:268800, rARPE:44800, rMTD:2184112.50, ops:{revAch:"4.85%"} },
    { d:"2026-09-10", att:0, nreg:0, priv:0, hmo:0, adm:0, onadm:2, disch:0, yld:0, tat:0, det:0, prom:0, indiff:0, privRev:0, rTotRev:0, rMTD:2184112.50, ops:{revAch:"4.85%"} },
    { d:"2026-09-11", att:2, nreg:1, priv:1, hmo:1, adm:0, onadm:2, disch:0, yld:2, tat:117.5, det:0, prom:2, indiff:0, privRev:500000, hmoRev:65000, rConv:0, rPctY:1, rNPS:1, rTotRev:565000, rARPE:282500, rMTD:2749112.50, ops:{revAch:"6.11%"} },
    { d:"2026-09-12", att:0, nreg:0, priv:0, hmo:0, adm:0, onadm:2, disch:0, privRev:0, rTotRev:0, rMTD:2749112.50, ops:{revAch:"6.11%"} },
    { d:"2026-09-13", att:4, nreg:0, priv:4, hmo:0, adm:0, onadm:2, disch:0, yld:4, tat:63.5, det:0, prom:4, indiff:0, privRev:80000, rConv:0, rPctY:1, rNPS:1, rTotRev:80000, rARPE:20000, rMTD:2829112.50, ops:{revAch:"6.29%"} },
    { d:"2026-09-14", att:3, nreg:1, priv:2, hmo:1, adm:1, onadm:3, disch:0, yld:2, tat:63.3, det:0, prom:2, indiff:0, privRev:370000, rConv:.3333, rPctY:.6667, rNPS:1, rTotRev:370000, rARPE:123333.33, rMTD:3199112.50, ops:{revAch:"7.11%"} },
  ],
  MFM: [
    { d:"2026-09-01", att:5, nreg:1, priv:5, adm:0, onadm:0, disch:0, privRev:99500,  rConv:0,    rTotRev:99500,  rARPE:19900,   rMTD:99500,   ops:{revAch:"0.22%"} },
    { d:"2026-09-02", att:5, nreg:2, priv:5, adm:1, onadm:1, disch:1, privRev:255500, rConv:.20,  rTotRev:255500, rARPE:51100,   rMTD:355000,  ops:{revAch:"0.79%"} },
    { d:"2026-09-03", att:5, nreg:0, priv:5, adm:1, onadm:1, disch:1, privRev:150000, rConv:.20,  rTotRev:150000, rARPE:30000,   rMTD:505000,  ops:{revAch:"1.12%"} },
    { d:"2026-09-04", att:4, nreg:1, priv:4, adm:0, onadm:0, disch:0, privRev:94000,  rConv:0,    rTotRev:94000,  rARPE:23500,   rMTD:599000,  ops:{revAch:"1.33%"} },
    { d:"2026-09-05", att:5, nreg:3, priv:5, adm:0, onadm:0, disch:0, privRev:112000, rConv:0,    rTotRev:112000, rARPE:22400,   rMTD:711000,  ops:{revAch:"1.58%"} },
    { d:"2026-09-06", att:1, nreg:0, priv:1, adm:0, onadm:0, disch:0, privRev:34000,  rConv:0,    rTotRev:34000,  rARPE:34000,   rMTD:745000,  ops:{revAch:"1.66%"} },
    { d:"2026-09-07", att:9, nreg:7, priv:9, adm:1, onadm:1, disch:0, privRev:308000, rConv:.1111,rTotRev:308000, rARPE:34222.22,rMTD:1053000, ops:{revAch:"2.34%"} },
    { d:"2026-09-08", att:17,nreg:2, priv:17,adm:0, onadm:1, disch:1, det:0, prom:2, indiff:0, privRev:327000, rConv:0, rNPS:1, rTotRev:327000, rARPE:19235.29, rMTD:1380000, ops:{revAch:"3.07%"} },
    { d:"2026-09-09", att:5, nreg:1, priv:5, adm:1, onadm:1, disch:0, privRev:84000,  rConv:.20,  rTotRev:84000,  rARPE:16800,   rMTD:1464000, ops:{revAch:"3.25%"} },
    { d:"2026-09-10", att:3, nreg:0, priv:3, adm:0, onadm:0, disch:1, privRev:21000,  rConv:0,    rTotRev:21000,  rARPE:7000,    rMTD:1485000, ops:{revAch:"3.30%"} },
    { d:"2026-09-11", att:5, nreg:3, priv:5, adm:1, onadm:1, disch:1, det:0, prom:1, indiff:0, privRev:273000, rConv:.20, rNPS:1, rTotRev:273000, rARPE:54600, rMTD:1758000, ops:{revAch:"3.91%"} },
    { d:"2026-09-12", att:6, nreg:2, priv:6, adm:2, onadm:2, disch:0, privRev:249000, rConv:.3333, rTotRev:249000, rARPE:41500, rMTD:2007000, ops:{revAch:"4.46%"} },
    { d:"2026-09-13", att:3, nreg:3, priv:3, adm:1, onadm:3, disch:2, privRev:226000, rConv:.3333, rTotRev:226000, rARPE:75333.33, rMTD:2233000, ops:{revAch:"4.96%"} },
    { d:"2026-09-14", att:5, nreg:2, priv:5, adm:0, onadm:1, disch:0, privRev:81500, rConv:0, rTotRev:81500, rARPE:16300, rMTD:2314500, ops:{revAch:"5.14%"} },
  ],
  NLB: [
    { d:"2026-09-01", att:23, nreg:19, hmo:23, adm:15, onadm:69, disch:23, yld:15, tat:40, det:0, prom:23, indiff:0, hmoRev:4170405.70, rConv:.6522, rPctY:.6522, rNPS:1, rTotRev:4170405.70, rARPE:181321.99, rMTD:4170405.70 },
    { d:"2026-09-02", att:30, nreg:30, hmo:30, adm:26, onadm:77, disch:16, yld:26, tat:40, det:0, prom:16, indiff:0, hmoRev:1882251.20, rConv:.8667, rPctY:.8667, rNPS:1, rTotRev:1882251.20, rARPE:62741.71, rMTD:6052656.90 },
    { d:"2026-09-03", att:22, nreg:22, hmo:22, adm:16, onadm:81, disch:13, yld:16, tat:40, det:0, prom:13, indiff:0, hmoRev:4579794.40, rConv:.7273, rPctY:.7273, rNPS:1, rTotRev:4579794.40, rARPE:208172.47, rMTD:10632451.30 },
    { d:"2026-09-04", att:35, nreg:34, hmo:35, adm:20, onadm:81, disch:24, yld:20, tat:40, det:0, prom:24, indiff:0, hmoRev:4367035.80, rConv:.5714, rPctY:.5714, rNPS:1, rTotRev:4367035.80, rARPE:124772.45, rMTD:14999487.10 },
    { d:"2026-09-05", att:25, nreg:20, hmo:25, adm:18, onadm:85, disch:13, yld:18, tat:40, det:0, prom:13, indiff:0, hmoRev:3158845.50, rConv:.72, rPctY:.72, rNPS:1, rTotRev:3158845.50, rARPE:126353.82, rMTD:18158332.60 },
    { d:"2026-09-06", att:19, nreg:16, hmo:19, adm:18, onadm:76, disch:22, yld:18, tat:40, det:0, prom:22, indiff:0, hmoRev:4651743.40, rConv:.9474, rPctY:.9474, rNPS:1, rTotRev:4651743.40, rARPE:244828.60, rMTD:22810076.00 },
    { d:"2026-09-07", att:23, nreg:21, hmo:23, adm:19, onadm:80, disch:15, yld:19, tat:40, det:0, prom:15, indiff:0, hmoRev:5555012.90, rConv:.8261, rPctY:.8261, rNPS:1, rTotRev:5555012.90, rARPE:241522.30, rMTD:28365088.90 },
    { d:"2026-09-08", att:22, nreg:22, hmo:22, adm:18, onadm:74, disch:20, yld:18, tat:40, det:0, prom:20, indiff:0, hmoRev:4538906.20, rConv:.8182, rPctY:.8182, rNPS:1, rTotRev:4538906.20, rARPE:206313.92, rMTD:32903995.10 },
    { d:"2026-09-09", att:27, nreg:27, hmo:27, adm:19, onadm:74, disch:27, yld:19, tat:40, det:0, prom:27, indiff:0, hmoRev:3962001.90, rConv:.7037, rPctY:.7037, rNPS:1, rTotRev:3962001.90, rARPE:146740.81, rMTD:36865997.00 },
    { d:"2026-09-10", att:27, nreg:24, hmo:27, adm:23, onadm:84, disch:12, yld:23, tat:40, det:0, prom:12, indiff:0, hmoRev:5424356.50, rConv:.8519, rPctY:.8519, rNPS:1, rTotRev:5424356.50, rARPE:200902.09, rMTD:42290353.50 },
    { d:"2026-09-11", att:18, nreg:18, hmo:18, adm:18, onadm:85, disch:15, yld:18, tat:40, det:0, prom:15, indiff:0, hmoRev:3547786.40, rConv:1, rPctY:1, rNPS:1, rTotRev:3547786.40, rARPE:197099.24, rMTD:45838139.90 },
    { d:"2026-09-12", att:20, nreg:20, hmo:20, adm:11, onadm:84, disch:16, yld:11, tat:40, det:0, prom:16, indiff:0, hmoRev:2618423.00, rConv:.55, rPctY:.55, rNPS:1, rTotRev:2618423.00, rARPE:130921.15, rMTD:48456562.90 },
    { d:"2026-09-13", att:26, nreg:26, hmo:26, adm:25, onadm:83, disch:25, yld:25, tat:40, det:0, prom:25, indiff:0, hmoRev:7733259.50, rConv:.9615, rPctY:.9615, rNPS:1, rTotRev:7733259.50, rARPE:297433.06, rMTD:56189822.40 },
    { d:"2026-09-14", att:19, nreg:19, hmo:19, adm:9,  onadm:83, disch:10, yld:9,  tat:40, det:0, prom:10, indiff:0, hmoRev:5280626.50, rConv:.4737, rPctY:.4737, rNPS:1, rTotRev:5280626.50, rARPE:277927.71, rMTD:61470448.90 },
  ],
  ROD: [
    { d:"2026-09-01", att:8, nreg:0, priv:0, hmo:8,  adm:0, onadm:0, disch:2, yld:8, tat:25, det:0, prom:7, indiff:0, privRev:0, hmoRev:369687.24, rConv:0, rPctY:1, rNPS:1, rTotRev:369687.24, rARPE:46210.91, rMTD:369687.24, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"0.82%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"0",vac:"0",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-02", att:7, nreg:1, priv:0, hmo:7,  adm:0, onadm:0, disch:0, yld:6, tat:25, det:0, prom:6, indiff:0, privRev:5000, hmoRev:147709.17, rConv:0, rPctY:.8571, rNPS:1, rTotRev:152709.17, rARPE:21815.60, rMTD:522396.41, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"1.16%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"0",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-03", att:11,nreg:2, priv:1, hmo:10, adm:2, onadm:2, disch:0, yld:8, tat:25, det:0, prom:8, indiff:0, privRev:5000, hmoRev:177792.10, rConv:.1818, rPctY:.7273, rNPS:1, rTotRev:182792.10, rARPE:16617.46, rMTD:705188.51, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"1.57%",refund:"0",bed:"2",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"0",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-04", att:10,nreg:3, priv:1, hmo:9,  adm:0, onadm:0, disch:2, yld:9, tat:25, det:0, prom:9, indiff:0, privRev:50500, hmoRev:340768.46, rConv:0, rPctY:.90, rNPS:1, rTotRev:391268.46, rARPE:39126.85, rMTD:1096456.97, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"2.44%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"0",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-05", att:5, nreg:0, priv:1, hmo:4,  adm:0, onadm:0, disch:0, yld:5, tat:25, det:0, prom:4, indiff:0, privRev:22000, hmoRev:89760.30, rConv:0, rPctY:1, rNPS:1, rTotRev:111760.30, rARPE:22352.06, rMTD:1208217.27, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"2.68%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"0",vac:"0",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-06", att:4, nreg:0, priv:0, hmo:4,  adm:3, onadm:3, disch:0, yld:1, tat:25, det:0, prom:1, indiff:0, privRev:0, hmoRev:120000, rConv:.75, rPctY:.25, rNPS:1, rTotRev:120000, rARPE:30000, rMTD:1328217.27, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"2.95%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"0",vac:"0",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-07", att:10,nreg:3, priv:1, hmo:9,  adm:4, onadm:4, disch:3, yld:10,tat:25, det:0, prom:10,indiff:0, privRev:200000, hmoRev:347194.24, rConv:.40, rPctY:1, rNPS:1, rTotRev:547194.24, rARPE:54719.42, rMTD:1875411.51, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"4.17%",refund:"0",bed:"4",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"1",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-08", att:11,nreg:3, priv:1, hmo:10, adm:5, onadm:5, disch:4, yld:9, tat:25, det:0, prom:9, indiff:0, privRev:70000, hmoRev:526083.74, rConv:.4545, rPctY:.8182, rNPS:1, rTotRev:596083.74, rARPE:54189.43, rMTD:2471495.25, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"5.49%",refund:"0",bed:"5",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"1",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-09", att:9, nreg:3, priv:1, hmo:8,  adm:3, onadm:3, disch:5, yld:9, tat:25, det:0, prom:9, indiff:0, privRev:55360, hmoRev:486761.37, rConv:.3333, rPctY:1, rNPS:1, rTotRev:542121.37, rARPE:60235.71, rMTD:3013616.62, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"6.70%",refund:"0",bed:"3",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"1",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-10", att:10,nreg:2, priv:2, hmo:8,  adm:1, onadm:1, disch:2, yld:10,tat:25, det:0, prom:10,indiff:0, privRev:51250, hmoRev:178985.65, rConv:.10, rPctY:1, rNPS:1, rTotRev:230235.65, rARPE:23023.57, rMTD:3243852.27, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"7.21%",refund:"0",bed:"1",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"1",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-11", att:9, nreg:1, priv:1, hmo:8,  adm:0, onadm:0, disch:1, yld:9, tat:25, det:0, prom:9, indiff:0, privRev:63190, hmoRev:468632.29, rConv:0, rPctY:1, rNPS:1, rTotRev:531822.29, rARPE:59091.37, rMTD:3775674.56, ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"0",revAch:"8.39%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"1",vac:"1",wfs:"95",emr:"90",out:"0",rep:"95"} },
    { d:"2026-09-12", att:2, nreg:0, priv:1, hmo:1,  adm:0, onadm:0, disch:0, yld:2, tat:20, det:0, prom:2, indiff:0, privRev:31163, hmoRev:27258,   rConv:0, rPctY:1, rNPS:1, rTotRev:58421,   rARPE:29210.50, rMTD:3834095.56, ops:{bed:"0",staff:"0",vac:"0",wfs:"95",emr:"90",rep:"95"} },
    { d:"2026-09-13", att:3, nreg:0, priv:0, hmo:3,  adm:0, onadm:0, disch:0, yld:3, tat:20, det:0, prom:2, indiff:0, hmoRev:79725,   rConv:0, rPctY:1, rNPS:1, rTotRev:79725,   rARPE:26575,    rMTD:3913820.56, ops:{staff:"0",vac:"0",wfs:"95",emr:"90",rep:"95"} },
    { d:"2026-09-14", att:4, nreg:1, priv:0, hmo:4,  adm:0, onadm:0, disch:0, yld:4, tat:20, det:0, prom:4, indiff:0, hmoRev:59438.51, rConv:0, rPctY:1, rNPS:1, rTotRev:59438.51,rARPE:14859.63, rMTD:3973259.07, ops:{staff:"0",vac:"0",wfs:"95",emr:"90",rep:"95"} },
  ],
  TAL: [
    { d:"2026-09-01", att:19,nreg:0,priv:5, hmo:12,lash:0,nhia:2,adm:1,onadm:2,disch:1,yld:1,tat:50,det:0,prom:1,indiff:0,privRev:187850,hmoRev:278956.26,nhiaRev:3350,compRev:0,      rConv:.0526,rPctY:.0526,rNPS:1,rTotRev:470156.26,rARPE:24745.07,rMTD:470156.26, ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"191200",revAch:"1.18%",refund:"0",bed:"2",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"2",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-02", att:19,nreg:2,priv:4, hmo:13,lash:0,nhia:2,adm:2,onadm:4,disch:2,yld:1,tat:50,det:0,prom:1,indiff:0,privRev:228500,hmoRev:159335.30,nhiaRev:14100,compRev:0,     rConv:.1053,rPctY:.0526,rNPS:1,rTotRev:401935.30,rARPE:21154.49,rMTD:872091.56, ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"242600",revAch:"2.18%",refund:"0",bed:"2",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"2",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-03", att:19,nreg:0,priv:7, hmo:9, lash:2,nhia:1,adm:1,onadm:3,disch:1,yld:1,tat:50,det:1,prom:0,indiff:0,privRev:94100, hmoRev:191531.41,nhiaRev:700,  compRev:27700, rConv:.0526,rPctY:.0526,rNPS:-1,rTotRev:314031.41,rARPE:16527.97,rMTD:1186122.97,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"94800",revAch:"2.97%",refund:"0",bed:"2",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"2",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-04", att:24,nreg:0,priv:3, hmo:18,lash:1,nhia:2,adm:1,onadm:2,disch:1,yld:4,tat:50,det:0,prom:3,indiff:1,privRev:137300,hmoRev:386473.50,nhiaRev:1200, compRev:170800,rConv:.0417,rPctY:.1667,rNPS:.75,rTotRev:695773.50,rARPE:28990.56,rMTD:1881896.47,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"138500",revAch:"4.70%",refund:"0",bed:"2",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"2",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-05", att:28,nreg:2,priv:5, hmo:23,lash:0,nhia:0,adm:1,onadm:2,disch:0,yld:4,tat:50,det:0,prom:4,indiff:0,privRev:157100,hmoRev:377118.62,nhiaRev:500,  compRev:0,     rConv:.0357,rPctY:.1429,rNPS:1,rTotRev:534718.62,rARPE:19097.09,rMTD:2416615.09,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"157600",revAch:"6.04%",refund:"0",bed:"2",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"2",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-06", att:14,nreg:0,priv:0, hmo:11,lash:2,nhia:1,adm:1,onadm:1,disch:1,yld:3,tat:50,det:0,prom:3,indiff:0,privRev:131300,hmoRev:179641.74,nhiaRev:0,    compRev:0,     rConv:.0714,rPctY:.2143,rNPS:1,rTotRev:310941.74,rARPE:22210.12,rMTD:2727556.83,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"131300",revAch:"6.82%",refund:"0",bed:"2",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"2",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-07", att:30,nreg:2,priv:10,hmo:17,lash:3,nhia:0,adm:0,onadm:3,disch:3,yld:0,tat:50,det:0,prom:0,indiff:0,privRev:260000,hmoRev:367996.28,nhiaRev:2950, compRev:25700, rConv:0,rPctY:0,rNPS:"#DIV/0!",rTotRev:656646.28,rARPE:21888.21,rMTD:3384203.11,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"262950",revAch:"8.46%",refund:"0",bed:"1",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"2",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-08", att:21,nreg:0,priv:1, hmo:17,lash:0,nhia:3,adm:1,onadm:1,disch:1,yld:0,tat:50,det:0,prom:0,indiff:0,privRev:88000, hmoRev:275148.70,nhiaRev:2700, compRev:0,     rConv:.0476,rPctY:0,rNPS:"#DIV/0!",rTotRev:365848.70,rARPE:17421.37,rMTD:3750051.81,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"90700",revAch:"9.38%",refund:"0",bed:"1",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"1",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-09", att:14,nreg:0,priv:1, hmo:11,lash:0,nhia:2,adm:0,onadm:0,disch:0,yld:0,tat:50,det:0,prom:0,indiff:0,privRev:58000, hmoRev:178850,   nhiaRev:8100, compRev:26300, rConv:0,rPctY:0,rNPS:"#DIV/0!",rTotRev:271250,rARPE:19375,rMTD:4021301.81,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"66100",revAch:"10.05%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"0",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-10", att:27,nreg:1,priv:2, hmo:14,lash:7,nhia:4,adm:1,onadm:1,disch:0,yld:null,tat:50,det:0,prom:0,indiff:0,privRev:86000,hmoRev:220491.31,nhiaRev:10600,compRev:0,   rConv:.0370,rNPS:"#DIV/0!",rTotRev:317091.31,rARPE:11744.12,rMTD:4338393.12,ops:{mort:"0",ipc:"0",medErr:"0",esc:"0",wait:"50",coll:"96600",revAch:"10.85%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"100%",staff:"0",vac:"0",wfs:"0",emr:"0",out:"0",rep:"90"} },
    { d:"2026-09-11", att:23,nreg:1,priv:4, hmo:15,lash:0,nhia:2,comp:2,privRev:88400, hmoRev:147581.50,nhiaRev:4250,compRev:0,     rTotRev:240231.50,rARPE:10444.85,rMTD:4578624.62,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"50",coll:"0",revAch:"11.45%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"0",vac:"0",wfs:"0",emr:"0",out:"0",rep:"90%"} },
    { d:"2026-09-12", att:30,nreg:0,priv:1, hmo:27,lash:0,nhia:0,comp:2,adm:0,onadm:2,disch:2,det:0,prom:0,indiff:0,privRev:15500, hmoRev:375595.69,nhiaRev:0,   compRev:0,     rConv:0,    rNPS:"#DIV/0!",rTotRev:391095.69,rARPE:13036.52,rMTD:4969720.31,ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"50",coll:"0",revAch:"12.42%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"0",vac:"0",wfs:"90",emr:"95",out:"0",rep:"90"} },
    { d:"2026-09-13", att:21,nreg:4,priv:6, hmo:11,lash:0,nhia:4,comp:0,privRev:327700,hmoRev:177974.54,nhiaRev:5900,compRev:0,     rTotRev:511574.54,rARPE:24360.69,rMTD:5481294.85,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"50",coll:"0",revAch:"13.70%",refund:"0",bed:"0",crit:"0",pwr:"0",amb:"0",staff:"0",vac:"0",wfs:"90%",emr:"95%",out:"0",rep:"90"} },
  ],
  HOS: [
    { d:"2026-09-01", att:33,nreg:5,priv:9,hmo:24,adm:3,onadm:9,disch:0,yld:29,tat:40,det:0,prom:20,indiff:9,privRev:170250,hmoRev:361851.06,rConv:.0909,rPctY:.8788,rNPS:.6897,rTotRev:532101.06,rARPE:16124.27,rMTD:532101.06, ops:{mort:"1",ipc:"90%",medErr:"0",esc:"0",wait:"40",coll:"0",revAch:"1.18%",refund:"0",bed:"30.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"10%",out:"0",rep:"0"} },
    { d:"2026-09-02", att:16,nreg:8,priv:7,hmo:9, adm:5,onadm:8,disch:2,yld:11,tat:30,det:0,prom:8, indiff:3,privRev:199900,hmoRev:225847.48,rConv:.3125,rPctY:.6875,rNPS:.7273,rTotRev:425747.48,rARPE:26609.22,rMTD:957848.54, ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"30",coll:"184000",revAch:"2.13%",refund:"0",bed:"27.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"10%",out:"0",rep:"0"} },
    { d:"2026-09-03", att:28,nreg:6,priv:4,hmo:24,adm:2,onadm:10,disch:0,yld:23,tat:35,det:0,prom:20,indiff:3,privRev:93700, hmoRev:314617.06,rConv:.0714,rPctY:.8214,rNPS:.8696,rTotRev:408317.06,rARPE:14582.75,rMTD:1366165.60,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"35",coll:"46000",revAch:"3.04%",refund:"0",bed:"33.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"10%",out:"0",rep:"0"} },
    { d:"2026-09-04", att:24,nreg:4,priv:3,hmo:21,adm:0,onadm:3,disch:6,yld:18,tat:25,det:0,prom:13,indiff:5,privRev:165800,hmoRev:1125478.92,rConv:0,rPctY:.75,rNPS:.7222,rTotRev:1291278.92,rARPE:53803.29,rMTD:2657444.52,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"25",coll:"592800",revAch:"5.91%",refund:"0",bed:"10.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"70%",out:"0",rep:"0"} },
    { d:"2026-09-05", att:21,nreg:5,priv:3,hmo:18,adm:5,onadm:5,disch:3,yld:15,tat:25,det:0,prom:12,indiff:3,privRev:154000,hmoRev:364383.17,rConv:.2381,rPctY:.7143,rNPS:.80,rTotRev:518383.17,rARPE:24684.91,rMTD:3175827.69,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"25",coll:"144000",revAch:"7.06%",refund:"0",bed:"17.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"60%",out:"0",rep:"0"} },
    { d:"2026-09-06", att:23,nreg:2,priv:1,hmo:22,adm:3,onadm:6,disch:2,yld:19,tat:30,det:0,prom:14,indiff:5,privRev:212000,hmoRev:271340.27,rConv:.1304,rPctY:.8261,rNPS:.7368,rTotRev:483340.27,rARPE:21014.79,rMTD:3659167.96,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"30",coll:"43000",revAch:"8.13%",refund:"0",bed:"20.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"50%",out:"0",rep:"0"} },
    { d:"2026-09-07", att:16,nreg:2,priv:4,hmo:12,adm:2,onadm:8,disch:2,yld:11,tat:30,det:0,prom:9, indiff:2,privRev:214000,hmoRev:222345.72,rConv:.125,rPctY:.6875,rNPS:.8182,rTotRev:436345.72,rARPE:27271.61,rMTD:4095513.68,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"30",coll:"243000",revAch:"9.10%",refund:"0",bed:"27.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"60%",out:"0",rep:"0"} },
    { d:"2026-09-08", att:33,nreg:5,priv:7,hmo:26,adm:2,onadm:6,disch:2,yld:28,tat:40,det:0,prom:23,indiff:5,privRev:563000,hmoRev:214691.81,rConv:.0606,rPctY:.8485,rNPS:.8214,rTotRev:777691.81,rARPE:23566.42,rMTD:4873205.49,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"40",coll:"484000",revAch:"10.83%",refund:"0",bed:"20.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"70%",out:"0",rep:"0"} },
    { d:"2026-09-09", att:16,nreg:5,priv:5,hmo:11,adm:4,onadm:5,disch:4,yld:12,tat:25,det:0,prom:10,indiff:2,privRev:77000, hmoRev:404766.39,rConv:.25,rPctY:.75,rNPS:.8333,rTotRev:481766.39,rARPE:30110.40,rMTD:5354971.88,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"25",coll:"256000",revAch:"11.90%",refund:"0",bed:"33.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"75%",out:"0",rep:"0"} },
    { d:"2026-09-10", att:16,nreg:2,priv:4,hmo:12,adm:2,onadm:4,disch:3,yld:14,tat:25,det:0,prom:12,indiff:2,privRev:143500,hmoRev:289873.37,rConv:.125,rPctY:.875,rNPS:.8571,rTotRev:433373.37,rARPE:27085.84,rMTD:5788345.25,ops:{mort:"0",ipc:"90",medErr:"0",esc:"0",wait:"25",coll:"143500",revAch:"12.86%",refund:"0",bed:"13.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"70%",out:"0",rep:"0"} },
    { d:"2026-09-11", att:13,nreg:3,priv:3,hmo:8,nhia:2,adm:2,onadm:3,disch:2,yld:9, tat:25,det:1,prom:8, indiff:0,privRev:53500,hmoRev:228967.50,nhiaRev:20700,rConv:.1538,rPctY:.6923,rNPS:.7778,rTotRev:303167.50,rARPE:23320.58,rMTD:6075512.75,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"25",coll:"74200",revAch:"13.50%",refund:"0",bed:"10.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"70%",out:"0",rep:"0"} },
    { d:"2026-09-12", att:13,nreg:5,priv:2,hmo:11,adm:3,onadm:2,disch:1,yld:10,tat:30,det:0,prom:7, indiff:3,privRev:68000,hmoRev:165953.93,rConv:.2308,rPctY:.7692,rNPS:.70,  rTotRev:233953.93,rARPE:17996.46,rMTD:6309466.68,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"30",coll:"68000",revAch:"14.02%",refund:"0",bed:"17.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"80%",out:"0",rep:"0"} },
    { d:"2026-09-13", att:12,nreg:1,priv:2,hmo:10,adm:2,onadm:4,disch:5,yld:7, tat:25,det:0,prom:6, indiff:1,privRev:93000,hmoRev:333519.69,rConv:.1667,rPctY:.5833,rNPS:.8571,rTotRev:426519.69,rARPE:35543.31,rMTD:6735986.37,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"25",coll:"93000",revAch:"14.97%",refund:"0",bed:"13.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"80%",out:"0",rep:"0"} },
    { d:"2026-09-14", att:22,nreg:2,priv:7,hmo:13,nhia:2,adm:5,onadm:8,disch:0,yld:18,tat:35,det:0,prom:13,indiff:5,privRev:114500,hmoRev:78624.77,nhiaRev:3500,rConv:.2273,rPctY:.8182,rNPS:.7222,rTotRev:196624.77,rARPE:8937.49,rMTD:6932611.14,ops:{mort:"0",ipc:"90%",medErr:"0",esc:"0",wait:"35",coll:"118000",revAch:"15.41%",refund:"0",bed:"27.00%",crit:"0",pwr:"0",amb:"90%",staff:"0",vac:"3",wfs:"90%",emr:"80%",out:"0",rep:"0"} },
  ],
};

function loadFromSource() {
  return { meta: SOURCE_META, hospitals: CONFIG.hospitals.map(h => ({ ...h, rows: RAW[h.id] || [] })) };
}

/* ===========================================================================
   SECTION 3 — CANONICAL MODEL  (spec §5)
   Every value becomes { value, state, note }. State vocabulary is fixed.
   =========================================================================== */

const STATE = { VALID:"VALID", INCOMPLETE:"INCOMPLETE", EXCEPTION:"EXCEPTION", NA:"N/A", ZERO:"ZERO", NOT_OBSERVED:"NOT_OBSERVED" };

const PAYER_ATT = ["priv","hmo","lash","nhia","comp"];
const PAYER_REV = ["privRev","hmoRev","nhiaRev","compRev"];
const CORE_FIELDS = ["att","adm","rTotRev"];

const isErr = v => typeof v === "string" && v.startsWith("#");
const num = v => (typeof v === "number" && isFinite(v) ? v : null);

function cell(raw, { na=false } = {}) {
  if (na) return { value:null, state:STATE.NA };
  if (raw === undefined || raw === null) return { value:null, state:STATE.INCOMPLETE };
  if (isErr(raw)) return { value:null, state:STATE.EXCEPTION, note:`Source contains spreadsheet error ${raw}` };
  if (raw === 0) return { value:0, state:STATE.ZERO };
  return { value:raw, state:STATE.VALID };
}

function buildCanonical(source) {
  return source.hospitals.map(h => {
    const naCfg = CONFIG.declaredNotApplicable[h.id];
    const naFields = new Set(naCfg ? naCfg.fields : []);

    // Fields never populated on any submitted day: surfaced as a question, not an assertion.
    const everSeen = new Set();
    h.rows.forEach(r => Object.keys(r).forEach(k => { if (r[k] !== null && r[k] !== undefined && k !== "ops") everSeen.add(k); }));

    const records = h.rows.map(r => {
      const f = {};
      const put = (k, na) => { f[k] = cell(r[k], { na }); };
      ["att","nreg","adm","onadm","disch","yld","tat","det","prom","indiff"].forEach(k => put(k, naFields.has(k)));
      PAYER_ATT.forEach(k => {
        if (naFields.has(k)) return put(k, true);
        if (!everSeen.has(k)) { f[k] = { value:null, state:STATE.NOT_OBSERVED, note:"No value submitted on any day this period — confirm whether this payer applies." }; return; }
        put(k, false);
      });
      PAYER_REV.forEach(k => {
        if (naFields.has(k)) return put(k, true);
        if (!everSeen.has(k)) { f[k] = { value:null, state:STATE.NOT_OBSERVED, note:"No value submitted on any day this period — confirm whether this payer applies." }; return; }
        put(k, false);
      });
      ["rConv","rPctY","rNPS","rTotRev","rARPE","rMTD"].forEach(k => put(k, false));

      // rNPS as #DIV/0! with no respondent counts entered is an unfilled survey, not a broken
      // formula — the person did not enter Detractors/Promoters/Indifferent for that day.
      if (f.rNPS.state === STATE.EXCEPTION && [r.det, r.prom, r.indiff].every(v => !v)) {
        f.rNPS = { value:null, state:STATE.INCOMPLETE, note:"NPS survey parameters (Detractors/Promoters/Indifferent) were not filled in for this date." };
      }

      const submitted = CORE_FIELDS.some(k => r[k] !== null && r[k] !== undefined);
      const complete = ["att","adm","rTotRev"].every(k => r[k] !== null && r[k] !== undefined);

      return { hospitalId:h.id, date:r.d, f, ops:r.ops || {}, submitted, complete, _raw:r };
    });

    return { id:h.id, name:h.name, sheetId:h.sheetId, naFields:[...naFields], naReason:naCfg?.reason || null, records };
  });
}

/* ===========================================================================
   SECTION 4 — KPI ENGINE  (spec §8)
   KPIs are recomputed from components. Sheet-reported values are kept only to
   be reconciled against — never trusted as the answer.
   =========================================================================== */

const KPI_DEFS = {
  attendance: { label:"Total patient attendance", formula:"Private + HMO + LASHMA + NHIA + Company attendance", sources:PAYER_ATT },
  revenue:    { label:"Total revenue",            formula:"Private + HMO + NHIA + Company revenue",             sources:PAYER_REV },
  conversion: { label:"Conversion rate",          formula:"Admissions ÷ Total patient attendance",              sources:["adm","att"] },
  arpe:       { label:"ARPE",                     formula:"Total revenue ÷ Total patient attendance",            sources:PAYER_REV.concat(PAYER_ATT) },
  mtd:        { label:"Revenue MTD",              formula:"Cumulative total revenue within reporting month",     sources:PAYER_REV },
  nps:        { label:"Net promoter score",       formula:"(Promoters − Detractors) ÷ (Promoters + Detractors + Indifferent)", sources:["prom","det","indiff"] },
  pctYield:   { label:"Percentage yield",         formula:"Total yield ÷ Total patient attendance (hospital-sheet definition)", sources:["yld","att"] },
};

const sumPresent = (rec, keys) => {
  let total = null;
  keys.forEach(k => { const v = num(rec.f[k]?.value); if (v !== null) total = (total ?? 0) + v; });
  return total;
};

function computeRecordKPIs(rec) {
  const attendance = sumPresent(rec, PAYER_ATT);
  const revenue    = sumPresent(rec, PAYER_REV);
  const attRep     = num(rec.f.att.value);
  const attBasis   = attRep ?? attendance;          // denominator basis
  const adm        = num(rec.f.adm.value);
  const prom = num(rec.f.prom.value), det = num(rec.f.det.value), ind = num(rec.f.indiff.value);
  const respondents = [prom, det, ind].some(v => v !== null) ? (prom ?? 0) + (det ?? 0) + (ind ?? 0) : null;
  const yld = num(rec.f.yld.value);

  return {
    attendance,
    attendanceReported: attRep,
    revenue,
    revenueReported: num(rec.f.rTotRev.value),
    conversion: adm !== null && attBasis ? adm / attBasis : null,
    arpe: revenue !== null && attBasis ? revenue / attBasis : null,
    nps: respondents ? ((prom ?? 0) - (det ?? 0)) / respondents : null,
    npsRespondents: respondents,
    pctYield: yld !== null && attBasis ? yld / attBasis : null,
    admissions: adm,
    newReg: num(rec.f.nreg.value),
    discharges: num(rec.f.disch.value),
  };
}

function computeHospitalKPIs(hosp) {
  const perDay = hosp.records.map(r => ({ date:r.date, submitted:r.submitted, ...computeRecordKPIs(r) }));
  const sub = perDay.filter(d => d.submitted);
  const agg = (key) => sub.reduce((a, d) => (d[key] === null ? a : (a ?? 0) + d[key]), null);

  const attendance = agg("attendance"), revenue = agg("revenue"), admissions = agg("admissions");
  let running = 0;
  const mtdSeries = sub.map(d => { running += d.revenue ?? 0; return { date:d.date, mtd:running }; });
  const npsDays = sub.filter(d => d.nps !== null);

  return {
    perDay, mtdSeries,
    totals: {
      attendance, revenue, admissions,
      newReg: agg("newReg"), discharges: agg("discharges"),
      arpe: revenue !== null && attendance ? revenue / attendance : null,
      conversion: admissions !== null && attendance ? admissions / attendance : null,
      nps: npsDays.length ? npsDays.reduce((a,d)=>a+d.nps,0)/npsDays.length : null,
      npsDayCount: npsDays.length,
      daysSubmitted: sub.length,
    },
  };
}

/* ===========================================================================
   SECTION 5 — REPORTING COMPLIANCE ENGINE  (spec §13, §14)
   Compliance is derived from expected-date vs record-presence. The sheet's own
   "Reporting Compliance Rate" column is deliberately NOT used as truth.
   =========================================================================== */

function expectedDates(cal) {
  const out = [];
  const start = new Date(CONFIG.period.start + "T00:00:00");
  const asOf  = new Date(CONFIG.asOfDate + "T00:00:00");
  for (let t = new Date(start); t <= asOf; t.setDate(t.getDate() + 1)) {
    const iso = t.toISOString().slice(0,10);
    if (iso === CONFIG.asOfDate && !cal.countCurrentDayAsDue) continue;
    if (cal.cadence === "WEEKDAYS" && (t.getDay() === 0 || t.getDay() === 6)) continue;
    out.push(iso);
  }
  return out;
}

function computeReporting(hosp, cal) {
  const due = expectedDates(cal);
  const byDate = new Map(hosp.records.map(r => [r.date, r]));
  const missing = [], incomplete = [];
  due.forEach(d => {
    const r = byDate.get(d);
    if (!r || !r.submitted) missing.push(d);
    else if (!r.complete) incomplete.push(d);
  });
  const submittedDates = hosp.records.filter(r => r.submitted).map(r => r.date).sort();
  return {
    due, missing, incomplete,
    lastSubmitted: submittedDates.length ? submittedDates[submittedDates.length - 1] : null,
    submissionRate: due.length ? (due.length - missing.length) / due.length : null,
    calendarConfirmed: cal.cadenceConfirmed,
  };
}

/* ===========================================================================
   SECTION 6 — EXCEPTION ENGINE  (spec §10, §11, §15)
   Every rule below is deterministic and derived from the data or the
   specification. No rule depends on a threshold that was not supplied.
   =========================================================================== */

const CATEGORY = {
  REPORTING: "Reporting compliance",
  DQ: "Data quality",
  PERF: "Performance",
  RISK: "Operational / clinical risk",
};

const RULES = [
  { id:"R1",  cat:CATEGORY.REPORTING, name:"Expected reporting date with no record" },
  { id:"R2",  cat:CATEGORY.REPORTING, name:"Record submitted but core fields incomplete" },
  { id:"R3",  cat:CATEGORY.DQ,        name:"Source cell contains a spreadsheet error value" },
  { id:"R4",  cat:CATEGORY.DQ,        name:"Payer components do not reconcile to reported total" },
  { id:"R5",  cat:CATEGORY.DQ,        name:"Recomputed KPI differs from sheet-reported KPI" },
  { id:"R6",  cat:CATEGORY.DQ,        name:"Survey respondents exceed total attendance" },
  { id:"R7",  cat:CATEGORY.DQ,        name:"Revenue recorded on a zero-attendance day" },
  { id:"R8",  cat:CATEGORY.DQ,        name:"Payer revenue recorded with no payer attendance" },
  { id:"R9",  cat:CATEGORY.DQ,        name:"Field holds an identical non-zero value on every submitted day" },
  { id:"R10", cat:CATEGORY.DQ,        name:"Field mixes formats across days (percent and bare number)" },
];

const TOL = { money: 1, ratio: 0.005, count: 0.5 };
let SEQ = 0;
const mk = (o) => ({ id:`EX-${String(++SEQ).padStart(3,"0")}`, status:"OPEN", severity:null, owner:null,
  ownerRole: CONFIG.ownership[o.categoryKey]?.role ?? null, sla:null, escalation:0,
  identified: CONFIG.asOfDate, closedOn:null, evidence:null,
  history:[{ at:CONFIG.asOfDate, what:"Created by rule " + o.rule, by:"Exception engine" }], ...o });

function generateExceptions(canon, kpis, reporting) {
  const out = [];
  canon.forEach(h => {
    const rep = reporting[h.id], K = kpis[h.id];

    // R1 — reporting gap. Consecutive missing dates collapse into one exception.
    if (rep.missing.length) {
      const runs = []; let run = [rep.missing[0]];
      for (let i=1;i<rep.missing.length;i++){
        const prev = new Date(rep.missing[i-1]), cur = new Date(rep.missing[i]);
        if ((cur - prev) / 86400000 === 1) run.push(rep.missing[i]); else { runs.push(run); run=[rep.missing[i]]; }
      }
      runs.push(run);
      runs.forEach(r => out.push(mk({
        rule:"R1", categoryKey:"REPORTING_COMPLIANCE", category:CATEGORY.REPORTING, hospital:h.id, domain:"Reporting",
        issue: r.length === 1 ? `No record submitted for ${r[0]}` : `No records submitted for ${r[0]} → ${r[r.length-1]} (${r.length} days)`,
        current:`${r.length} expected ${r.length===1?"date":"dates"} with no record`,
        expected:`One record per ${CONFIG.reportingCalendar.cadence.toLowerCase()} reporting date`,
        provisional: !rep.calendarConfirmed,
        action:"Confirm the expected reporting calendar, then confirm submission or record the reason for the gap.",
        dates:r,
      })));
    }

    // R2 — partial submission
    rep.incomplete.forEach(d => out.push(mk({
      rule:"R2", categoryKey:"REPORTING_COMPLIANCE", category:CATEGORY.REPORTING, hospital:h.id, domain:"Reporting",
      issue:`Record for ${d} is present but core fields are not complete`,
      current:"Attendance/admissions entered; revenue not entered",
      expected:"All core fields completed before submission",
      action:"Complete the outstanding fields for this reporting date.", dates:[d],
    })));

    h.records.forEach((r, i) => {
      if (!r.submitted) return;
      const k = K.perDay[i];

      // R3 — spreadsheet error values
      Object.entries(r.f).forEach(([key, c]) => {
        if (c.state === STATE.EXCEPTION) out.push(mk({
          rule:"R3", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Data quality",
          issue:`${key} on ${r.date} contains a spreadsheet error`, current:String(r._raw[key]),
          expected:"A numeric value, or blank if not measured",
          action:"Correct the underlying formula or clear the cell.", dates:[r.date],
        }));
      });

      // R4 — component reconciliation
      const attRep = num(r.f.att.value);
      if (attRep !== null && k.attendance !== null && Math.abs(attRep - k.attendance) > TOL.count) out.push(mk({
        rule:"R4", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Patient activity",
        issue:`Payer attendance components do not sum to reported total on ${r.date}`,
        current:`components ${k.attendance} vs reported ${attRep}`, expected:"components = reported total",
        action:"Reconcile the payer split against total attendance.", dates:[r.date],
      }));
      const revRep = num(r.f.rTotRev.value);
      if (revRep !== null && k.revenue !== null && Math.abs(revRep - k.revenue) > TOL.money) out.push(mk({
        rule:"R4", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Revenue",
        issue:`Revenue components do not sum to reported total on ${r.date}`,
        current:`components ₦${Math.round(k.revenue).toLocaleString()} vs reported ₦${Math.round(revRep).toLocaleString()}`,
        expected:"components = reported total",
        action:"Reconcile the revenue split against total revenue.", dates:[r.date],
      }));

      // R5 — recompute variance
      const cmp = [
        ["Conversion rate", k.conversion, num(r.f.rConv.value), TOL.ratio, v=>`${(v*100).toFixed(2)}%`],
        ["ARPE",            k.arpe,       num(r.f.rARPE.value), 1,         v=>`₦${Math.round(v).toLocaleString()}`],
        ["NPS",             k.nps,        num(r.f.rNPS.value),  TOL.ratio, v=>`${(v*100).toFixed(2)}%`],
      ];
      cmp.forEach(([label, calc, reported, tol, fmt]) => {
        if (calc === null || reported === null) return;
        if (Math.abs(calc - reported) > tol) out.push(mk({
          rule:"R5", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"KPI integrity",
          issue:`${label} recomputed from components differs from the sheet value on ${r.date}`,
          current:`sheet ${fmt(reported)}`, expected:`engine ${fmt(calc)}`,
          action:"Determine which is correct; do not overwrite the source until confirmed.", dates:[r.date],
        }));
      });

      // R6 — respondents exceed attendance
      if (k.npsRespondents && attRep !== null && k.npsRespondents > attRep) out.push(mk({
        rule:"R6", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Patient experience",
        issue:`Survey respondents exceed total attendance on ${r.date}`,
        current:`${k.npsRespondents} respondents vs ${attRep} attendance`,
        expected:"respondents ≤ attendance",
        action:"Confirm whether these cells hold survey counts or another measure.", dates:[r.date],
      }));

      // R7 — revenue on zero-attendance day
      if (attRep === 0 && (k.revenue ?? 0) > 0) out.push(mk({
        rule:"R7", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Revenue",
        issue:`Revenue recorded on a day with zero attendance (${r.date})`,
        current:`₦${Math.round(k.revenue).toLocaleString()} on 0 encounters`,
        expected:"Revenue attributable to a reporting date with encounters, or an explanation",
        action:"Confirm whether this is a late posting for an earlier encounter date.", dates:[r.date],
      }));

      // R8 — payer revenue without payer attendance
      [["priv","privRev","Private"],["hmo","hmoRev","HMO"],["nhia","nhiaRev","NHIA"],["comp","compRev","Company"]].forEach(([a,rv,label]) => {
        const av = num(r.f[a]?.value), rvv = num(r.f[rv]?.value);
        const aState = r.f[a]?.state;
        if (rvv !== null && rvv > 0 && (av === 0 || aState === STATE.NOT_OBSERVED || aState === STATE.INCOMPLETE)) out.push(mk({
          rule:"R8", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Revenue",
          issue:`${label} revenue recorded with no ${label.toLowerCase()} attendance on ${r.date}`,
          current:`₦${Math.round(rvv).toLocaleString()} revenue, attendance ${av === 0 ? "0" : "not submitted"}`,
          expected:"Payer revenue accompanied by payer attendance",
          action:"Confirm the payer split for this date.", dates:[r.date],
        }));
      });
    });

    // R9 / R10 — period-level field behaviour
    const sub = h.records.filter(r => r.submitted);
    if (sub.length >= 5) {
      const opsKeys = new Set(); sub.forEach(r => Object.keys(r.ops).forEach(k => opsKeys.add(k)));
      opsKeys.forEach(key => {
        const vals = sub.map(r => r.ops[key]).filter(v => v !== undefined && v !== null && v !== "");
        if (vals.length < sub.length) return;
        const uniq = [...new Set(vals)];
        const nonZero = uniq.length === 1 && !["0","0%","0.00%"].includes(uniq[0]);
        if (nonZero) out.push(mk({
          rule:"R9", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Unvalidated domains",
          issue:`${OPS_LABEL[key] || key} is identical on all ${sub.length} submitted days`,
          current:`"${uniq[0]}" every day`, expected:"A value measured per reporting date",
          action:"Confirm whether this is genuinely measured daily or carried forward.", dates:sub.map(r=>r.date),
        }));
        const hasPct = vals.some(v => String(v).includes("%")), hasBare = vals.some(v => !String(v).includes("%"));
        if (hasPct && hasBare) out.push(mk({
          rule:"R10", categoryKey:"DATA_QUALITY", category:CATEGORY.DQ, hospital:h.id, domain:"Unvalidated domains",
          issue:`${OPS_LABEL[key] || key} mixes percent and bare-number formats within the period`,
          current:uniq.slice(0,4).map(v=>`"${v}"`).join(", "), expected:"One consistent unit for the field",
          action:"Standardise the unit so the field can be aggregated.", dates:sub.map(r=>r.date),
        }));
      });
    }
  });
  return out;
}

const OPS_LABEL = {
  mort:"Mortality rate", ipc:"IPC compliance rate", medErr:"Medication error rate", esc:"Escalated safety concerns",
  wait:"Average patient waiting time", coll:"Collections (cash received)", revAch:"Revenue achievement rate",
  refund:"Refund volume and value", bed:"Bed occupancy rate", crit:"Critical equipment downtime",
  pwr:"Power and utility disruptions", amb:"Ambulance readiness rate", staff:"Staffing gap rate",
  vac:"Key vacancy count", wfs:"Workforce stability index", emr:"EMR system uptime",
  out:"System outage count", rep:"Reporting compliance rate (sheet-entered)",
};

/* ===========================================================================
   SECTION 7 — RAG EVALUATOR  (spec §12)
   No thresholds were supplied, so nothing is rated by default. The evaluator
   returns UNRATED rather than defaulting to GREEN — a hospital must never look
   healthy just because nobody has configured a rule yet.
   =========================================================================== */

const RAG = { GREEN:"GREEN", AMBER:"AMBER", RED:"RED", CRITICAL:"CRITICAL", UNRATED:"UNRATED" };

function evaluateRAG(kpiId, hospitalId, value, thresholds) {
  if (value === null || value === undefined) return { status:RAG.UNRATED, reason:"No value" };
  const t = thresholds.find(x => x.kpi === kpiId && (x.hospital === hospitalId || x.hospital === "ALL"));
  if (!t) return { status:RAG.UNRATED, reason:"No threshold configured for this KPI" };
  const below = t.direction !== "HIGHER_IS_WORSE";
  const crossed = (lim) => lim === null || lim === undefined ? false : (below ? value < lim : value > lim);
  if (crossed(t.critical)) return { status:RAG.CRITICAL, reason:`Crossed critical ${t.critical}` };
  if (crossed(t.red))      return { status:RAG.RED,      reason:`Crossed red ${t.red}` };
  if (crossed(t.amber))    return { status:RAG.AMBER,    reason:`Crossed amber ${t.amber}` };
  return { status:RAG.GREEN, reason:"Within configured parameters" };
}

/* ===========================================================================
   SECTION 8 — PRESENTATION
   =========================================================================== */

const C = {
  bg:"#F1F3F5", panel:"#FFFFFF", panel2:"#F7F8FA", line:"#D9DEE3", lineSoft:"#E7EAED",
  ink:"#15191D", inkDim:"#5C6773", inkFaint:"#8B94A0",
  green:"#1E8E5A", amber:"#B4680A", red:"#C0392F", critical:"#8A231C", brand:"#C0392F", info:"#4B7FA8",
};

const money = v => v === null || v === undefined ? "—" : "₦" + Math.round(v).toLocaleString();
const moneyK = v => v === null || v === undefined ? "—" : v >= 1e6 ? "₦" + (v/1e6).toFixed(1) + "m" : "₦" + Math.round(v/1000) + "k";
const pct = (v, d=1) => v === null || v === undefined ? "—" : (v*100).toFixed(d) + "%";
const int = v => v === null || v === undefined ? "—" : Math.round(v).toLocaleString();
const dayLabel = iso => { const d = new Date(iso+"T00:00:00"); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}); };
const weekday = iso => new Date(iso+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short"});

function Mono({ children, style }) {
  return <span style={{ fontFamily:"'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric:"tabular-nums", ...style }}>{children}</span>;
}

function StateDot({ state }) {
  const map = { VALID:C.green, ZERO:C.inkFaint, INCOMPLETE:C.amber, EXCEPTION:C.red, "N/A":C.info, NOT_OBSERVED:C.inkFaint };
  return <span title={state} style={{ display:"inline-block", width:6, height:6, borderRadius:1, background:map[state]||C.inkFaint }} />;
}

function RagChip({ status, small }) {
  const map = { GREEN:C.green, AMBER:C.amber, RED:C.red, CRITICAL:C.critical, UNRATED:"transparent" };
  const isU = status === RAG.UNRATED;
  return (
    <span style={{
      fontFamily:"'IBM Plex Mono', monospace", fontSize: small?10:11, letterSpacing:.6, padding: small?"1px 5px":"2px 7px",
      borderRadius:2, background: isU ? "transparent" : map[status],
      color: isU ? C.inkFaint : "#fff", border: isU ? `1px dashed ${C.line}` : "none", whiteSpace:"nowrap",
    }}>{isU ? "unrated" : status}</span>
  );
}

function Panel({ title, note, right, children, accent }) {
  return (
    <section style={{ background:C.panel, border:`1px solid ${C.line}`, borderTop: accent?`2px solid ${accent}`:`1px solid ${C.line}`, borderRadius:3, marginBottom:16 }}>
      {(title || right) && (
        <header style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:16, padding:"12px 16px", borderBottom:`1px solid ${C.lineSoft}` }}>
          <div>
            <h2 style={{ margin:0, fontSize:14, fontWeight:600, color:C.ink, letterSpacing:.1 }}>{title}</h2>
            {note && <p style={{ margin:"3px 0 0", fontSize:12, color:C.inkDim, maxWidth:"70ch", lineHeight:1.5 }}>{note}</p>}
          </div>
          {right}
        </header>
      )}
      <div style={{ padding:"14px 16px" }}>{children}</div>
    </section>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div style={{ padding:"12px 14px", background:C.panel2, border:`1px solid ${C.lineSoft}`, borderRadius:3, minWidth:0 }}>
      <div style={{ fontSize:11.5, color:C.inkDim, marginBottom:6, lineHeight:1.3 }}>{label}</div>
      <Mono style={{ fontSize:21, color: tone||C.ink, display:"block", lineHeight:1.15, letterSpacing:-.3 }}>{value}</Mono>
      {sub && <div style={{ fontSize:11, color:C.inkFaint, marginTop:5, lineHeight:1.4 }}>{sub}</div>}
    </div>
  );
}

const th = { textAlign:"left", fontSize:11, fontWeight:600, color:C.inkDim, padding:"7px 10px", borderBottom:`1px solid ${C.line}`, whiteSpace:"nowrap" };
const td = { fontSize:12.5, color:C.ink, padding:"8px 10px", borderBottom:`1px solid ${C.lineSoft}`, whiteSpace:"nowrap" };
const tdR = { ...td, textAlign:"right", fontFamily:"'IBM Plex Mono', monospace", fontVariantNumeric:"tabular-nums" };

function Unavailable({ title, reason, needs }) {
  return (
    <div style={{ border:`1px dashed ${C.line}`, borderRadius:3, padding:"22px 20px", background:C.panel2 }}>
      <div style={{ fontSize:13, color:C.ink, fontWeight:600, marginBottom:6 }}>{title}</div>
      <p style={{ margin:"0 0 10px", fontSize:12.5, color:C.inkDim, lineHeight:1.6, maxWidth:"72ch" }}>{reason}</p>
      {needs && (
        <div style={{ fontSize:12, color:C.inkFaint, lineHeight:1.7 }}>
          <div style={{ color:C.inkDim, marginBottom:3 }}>Needed to enable this:</div>
          {needs.map((n,i)=><div key={i}>· {n}</div>)}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- app root */

export default function ControlTower() {
  const [module, setModule] = useState("overview");
  const [cal, setCal] = useState(CONFIG.reportingCalendar);
  const [thresholds, setThresholds] = useState(CONFIG.thresholds);
  const [selHospital, setSelHospital] = useState("ULT");
  const [exState, setExState] = useState({});           // id -> {status, owner, severity, sla, evidence, history}
  const [exFilter, setExFilter] = useState("ALL");

  const model = useMemo(() => {
    SEQ = 0;
    const source = loadFromSource();
    const canon = buildCanonical(source);
    const kpis = Object.fromEntries(canon.map(h => [h.id, computeHospitalKPIs(h)]));
    const reporting = Object.fromEntries(canon.map(h => [h.id, computeReporting(h, cal)]));
    const exceptions = generateExceptions(canon, kpis, reporting);
    return { source, canon, kpis, reporting, exceptions };
  }, [cal]);

  const ex = model.exceptions.map(e => ({ ...e, ...(exState[e.id] || {}) }));
  const openEx = ex.filter(e => e.status !== "CLOSED");

  const network = useMemo(() => {
    const t = { attendance:0, revenue:0, admissions:0, newReg:0, discharges:0 };
    let npsSum = 0, npsN = 0;
    model.canon.forEach(h => {
      const k = model.kpis[h.id].totals;
      t.attendance += k.attendance ?? 0; t.revenue += k.revenue ?? 0; t.admissions += k.admissions ?? 0;
      t.newReg += k.newReg ?? 0; t.discharges += k.discharges ?? 0;
      if (k.nps !== null) { npsSum += k.nps; npsN++; }
    });
    const due = model.reporting[model.canon[0].id].due.length;
    const totalMissing = model.canon.reduce((a,h)=>a+model.reporting[h.id].missing.length,0);
    return {
      ...t,
      arpe: t.attendance ? t.revenue / t.attendance : null,
      conversion: t.attendance ? t.admissions / t.attendance : null,
      nps: npsN ? npsSum / npsN : null, npsHospitals: npsN,
      reportingToday: model.canon.filter(h => model.reporting[h.id].missing.length === 0).length,
      submissionRate: due * model.canon.length ? (due*model.canon.length - totalMissing)/(due*model.canon.length) : null,
      dueDates: due,
    };
  }, [model]);

  const updateEx = (id, patch, note) => setExState(s => {
    const cur = s[id] || {};
    const base = model.exceptions.find(e => e.id === id);
    const history = [...(cur.history || base.history), { at:CONFIG.asOfDate, what:note, by:"Control Tower Lead" }];
    return { ...s, [id]: { ...cur, ...patch, history } };
  });

  const groups = [...new Set(CONFIG.modules.map(m => m.group))];

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, color:C.ink, fontFamily:"'IBM Plex Sans', system-ui, sans-serif", fontSize:13 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:9px; height:9px; }
        ::-webkit-scrollbar-thumb { background:#C4CAD1; border-radius:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        button:focus-visible, select:focus-visible, input:focus-visible { outline:2px solid #4B7FA8; outline-offset:1px; }
        table { border-collapse:collapse; width:100%; }
        tbody tr:hover { background:#F7F8FA; }
      `}</style>

      {/* left rail */}
      <nav style={{ width:206, flexShrink:0, background:C.panel, borderRight:`1px solid ${C.line}`, position:"sticky", top:0, height:"100vh", overflowY:"auto" }}>
        <div style={{ padding:"16px 16px 14px", borderBottom:`1px solid ${C.line}` }}>
          <div style={{ fontSize:15, fontWeight:600, letterSpacing:-.2 }}>
            Care<span style={{ color:C.brand }}>One</span>
          </div>
          <div style={{ fontSize:11, color:C.inkDim, marginTop:2 }}>Enterprise Control Tower</div>
          <Mono style={{ fontSize:10, color:C.inkFaint, marginTop:5, display:"block" }}>v0.1 · {CONFIG.period.label}</Mono>
        </div>
        {groups.map(g => (
          <div key={g} style={{ padding:"10px 0 4px" }}>
            <div style={{ fontSize:10.5, color:C.inkFaint, padding:"0 16px 5px" }}>{g}</div>
            {CONFIG.modules.filter(m => m.group === g).map(m => {
              const active = module === m.id;
              const badge = m.id === "exceptions" ? openEx.length : null;
              return (
                <button key={m.id} onClick={()=>setModule(m.id)} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, width:"100%", textAlign:"left",
                  padding:"7px 16px", background: active ? "rgba(192,57,47,.09)" : "transparent",
                  border:"none", borderLeftWidth:2, borderLeftStyle:"solid", borderLeftColor: active ? C.brand : "transparent",
                  color: active ? C.ink : C.inkDim, fontSize:12.5, cursor:"pointer", fontFamily:"inherit",
                }}>
                  <span>{m.label}</span>
                  {badge ? <Mono style={{ fontSize:10, color:C.red }}>{badge}</Mono> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <main style={{ flex:1, minWidth:0 }}>
        {/* status strip */}
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:20, padding:"10px 22px",
                      background:C.panel2, borderBottom:`1px solid ${C.line}`, position:"sticky", top:0, zIndex:5 }}>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Reporting date </span><Mono style={{ fontSize:12 }}>{CONFIG.asOfDate}</Mono></div>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Source </span>
            <Mono style={{ fontSize:12, color:C.amber }}>Google Sheets · snapshot</Mono></div>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Read at </span><Mono style={{ fontSize:12 }}>{model.source.meta.readAt.slice(11,16)}</Mono></div>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Hospitals reporting </span>
            <Mono style={{ fontSize:12, color: network.reportingToday === 7 ? C.green : C.amber }}>{network.reportingToday}/7</Mono></div>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Open exceptions </span>
            <Mono style={{ fontSize:12, color: openEx.length ? C.red : C.green }}>{openEx.length}</Mono></div>
        </div>

        <div style={{ padding:"20px 22px 60px", maxWidth:1500 }}>
          {module === "overview"   && <Overview {...{model, network, ex, openEx, thresholds, setModule, setSelHospital}} />}
          {module === "hospitals"  && <Hospitals {...{model, selHospital, setSelHospital, thresholds, ex}} />}
          {module === "exceptions" && <Exceptions {...{ex, updateEx, exFilter, setExFilter, model}} />}
          {module === "reporting"  && <Reporting {...{model, cal, setCal}} />}
          {module === "revenue"    && <Revenue {...{model}} />}
          {module === "activity"   && <Activity {...{model}} />}
          {module === "experience" && <Experience {...{model, ex}} />}
          {module === "operations" && <UnvalidatedDomain domain="Operations" fields={["bed","crit","pwr","amb"]} model={model} ex={ex} />}
          {module === "clinical"   && <UnvalidatedDomain domain="Clinical & quality" fields={["mort","ipc","medErr","esc"]} model={model} ex={ex} />}
          {module === "workforce"  && <UnvalidatedDomain domain="People & workforce" fields={["staff","vac","wfs"]} model={model} ex={ex} />}
          {module === "digital"    && <UnvalidatedDomain domain="Digital systems" fields={["emr","out"]} model={model} ex={ex} />}
          {module === "followup"   && <FollowUp />}
          {module === "config"     && <ConfigModule {...{thresholds, setThresholds, cal, setCal}} />}
          {module === "lineage"    && <Lineage {...{model}} />}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------- 1. overview */

function Overview({ model, network, ex, openEx, thresholds, setModule, setSelHospital }) {
  const attention = openEx.filter(e => e.category === CATEGORY.REPORTING);
  const dqCount = openEx.filter(e => e.category === CATEGORY.DQ).length;

  return (
    <>
      <div style={{ marginBottom:18 }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:600, letterSpacing:-.3 }}>Network overview</h1>
        <p style={{ margin:"5px 0 0", fontSize:13, color:C.inkDim, maxWidth:"78ch", lineHeight:1.6 }}>
          Seven hospitals, {CONFIG.period.label}, computed from payer-level components rather than the sheets' own
          calculated columns. Figures cover submitted days only.
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(168px,1fr))", gap:10, marginBottom:18 }}>
        <Stat label="Total network revenue" value={moneyK(network.revenue)} sub={`${CONFIG.period.label}, submitted days`} />
        <Stat label="Total patient attendance" value={int(network.attendance)} sub={`${int(network.newReg)} new registrations`} />
        <Stat label="Total admissions" value={int(network.admissions)} sub={`${int(network.discharges)} discharges`} />
        <Stat label="Network ARPE" value={money(network.arpe)} sub="Revenue ÷ attendance" />
        <Stat label="Conversion rate" value={pct(network.conversion,2)} sub="Admissions ÷ attendance" />
        <Stat label="Average NPS" value={pct(network.nps,1)} sub={`${network.npsHospitals} of 7 hospitals computable`} tone={C.ink} />
        <Stat label="Hospitals with no gap" value={`${network.reportingToday}/7`} tone={network.reportingToday===7?C.green:C.amber} sub={`across ${network.dueDates} expected dates`} />
        <Stat label="Submission rate" value={pct(network.submissionRate,1)} tone={C.amber} sub="Observed, calendar unconfirmed" />
      </div>

      {/* CEO attention */}
      <section style={{ border:`1px solid ${C.red}`, borderLeft:`3px solid ${C.red}`, borderRadius:3, background:"rgba(192,57,47,.05)", marginBottom:18 }}>
        <header style={{ padding:"12px 16px", borderBottom:`1px solid rgba(192,57,47,.2)`, display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12 }}>
          <h2 style={{ margin:0, fontSize:14, fontWeight:600 }}>Requires CEO attention</h2>
          <Mono style={{ fontSize:11, color:C.inkDim }}>{attention.length} items</Mono>
        </header>
        <div style={{ padding:"6px 16px 14px" }}>
          {attention.length === 0 && <p style={{ fontSize:12.5, color:C.inkDim, margin:"10px 0" }}>Nothing outstanding.</p>}
          {attention.map(e => (
            <div key={e.id} style={{ display:"flex", gap:12, alignItems:"baseline", padding:"9px 0", borderBottom:`1px solid ${C.lineSoft}` }}>
              <Mono style={{ fontSize:11, color:C.inkFaint, width:56, flexShrink:0 }}>{e.id}</Mono>
              <span style={{ width:38, flexShrink:0 }}><Mono style={{ fontSize:11.5, color:C.ink }}>{e.hospital}</Mono></span>
              <span style={{ flex:1, fontSize:12.5, lineHeight:1.5 }}>
                {e.issue}
                {e.provisional && <em style={{ color:C.amber, fontStyle:"normal", fontSize:11.5 }}> · potential gap, calendar unconfirmed</em>}
              </span>
              <span style={{ fontSize:11.5, color: e.owner ? C.ink : C.amber, flexShrink:0 }}>
                {e.owner || `${e.ownerRole} — unnamed`}
              </span>
            </div>
          ))}
          <div style={{ display:"flex", gap:10, marginTop:12, flexWrap:"wrap" }}>
            <button onClick={()=>setModule("exceptions")} style={btn}>Open exception register</button>
            <button onClick={()=>setModule("reporting")} style={btnGhost}>Reporting compliance</button>
          </div>
          {dqCount > 0 && (
            <p style={{ fontSize:12, color:C.inkDim, marginTop:12, marginBottom:0, lineHeight:1.6 }}>
              A further {dqCount} data-quality exceptions are open for the Control Tower Lead. They are not shown here because
              they do not yet require executive intervention.
            </p>
          )}
        </div>
      </section>

      <Panel title="Hospital comparison"
             note="RAG is blank by design: no thresholds have been configured yet, and a hospital must not appear healthy merely because no rule exists. Configure thresholds under Rules & thresholds to activate rating.">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Hospital</th><th style={{...th,textAlign:"right"}}>Revenue</th>
              <th style={{...th,textAlign:"right"}}>Attendance</th><th style={{...th,textAlign:"right"}}>ARPE</th>
              <th style={{...th,textAlign:"right"}}>Admissions</th><th style={{...th,textAlign:"right"}}>Conversion</th>
              <th style={{...th,textAlign:"right"}}>NPS</th><th style={{...th,textAlign:"right"}}>Days</th>
              <th style={th}>Reporting</th><th style={th}>Status</th><th style={th}>Open</th>
            </tr></thead>
            <tbody>
              {model.canon.map(h => {
                const k = model.kpis[h.id].totals, r = model.reporting[h.id];
                const rag = evaluateRAG("revenue", h.id, k.revenue, thresholds);
                const hEx = ex.filter(e => e.hospital === h.id && e.status !== "CLOSED").length;
                return (
                  <tr key={h.id} style={{ cursor:"pointer" }} onClick={()=>{ setSelHospital(h.id); setModule("hospitals"); }}>
                    <td style={td}><Mono style={{ fontSize:11, color:C.inkFaint }}>{h.id}</Mono> <span style={{ marginLeft:6 }}>{h.name}</span></td>
                    <td style={tdR}>{moneyK(k.revenue)}</td>
                    <td style={tdR}>{int(k.attendance)}</td>
                    <td style={tdR}>{money(k.arpe)}</td>
                    <td style={tdR}>{int(k.admissions)}</td>
                    <td style={tdR}>{pct(k.conversion,2)}</td>
                    <td style={tdR}>{k.nps===null ? <span style={{color:C.inkFaint}}>—</span> : pct(k.nps,1)}</td>
                    <td style={tdR}>{k.daysSubmitted}</td>
                    <td style={td}>
                      {r.missing.length === 0
                        ? <span style={{ color:C.green, fontSize:12 }}>complete</span>
                        : <span style={{ color:C.amber, fontSize:12 }}>{r.missing.length} missing</span>}
                    </td>
                    <td style={td}><RagChip status={rag.status} small /></td>
                    <td style={tdR}>{hEx ? <span style={{ color:C.red }}>{hEx}</span> : <span style={{ color:C.inkFaint }}>0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Network revenue by reporting date" note="Submitted days only. Gaps in the series are missing submissions, not zero-revenue days.">
        <NetworkTrend model={model} />
      </Panel>
    </>
  );
}

function NetworkTrend({ model }) {
  const dates = [...new Set(model.canon.flatMap(h => model.kpis[h.id].perDay.filter(d=>d.submitted).map(d=>d.date)))].sort();
  const data = dates.map(d => {
    const row = { date: dayLabel(d), revenue:0, attendance:0 };
    model.canon.forEach(h => {
      const rec = model.kpis[h.id].perDay.find(x => x.date === d && x.submitted);
      if (rec) { row.revenue += rec.revenue ?? 0; row.attendance += rec.attendance ?? 0; }
    });
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top:5, right:5, left:-8, bottom:0 }}>
        <CartesianGrid stroke={C.lineSoft} vertical={false} />
        <XAxis dataKey="date" tick={{ fill:C.inkFaint, fontSize:11 }} axisLine={{ stroke:C.line }} tickLine={false} />
        <YAxis tickFormatter={v=>`${(v/1e6).toFixed(0)}m`} tick={{ fill:C.inkFaint, fontSize:11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background:C.panel2, border:`1px solid ${C.line}`, borderRadius:3, fontSize:12 }}
                 labelStyle={{ color:C.inkDim }} formatter={v=>money(v)} />
        <Bar dataKey="revenue" fill={C.info} radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const btn = { background:C.brand, color:"#fff", border:"none", borderRadius:3, padding:"7px 13px", fontSize:12.5, cursor:"pointer", fontFamily:"inherit" };
const btnGhost = { background:"transparent", color:C.ink, border:`1px solid ${C.line}`, borderRadius:3, padding:"7px 13px", fontSize:12.5, cursor:"pointer", fontFamily:"inherit" };
const inputS = { background:C.bg, color:C.ink, border:`1px solid ${C.line}`, borderRadius:3, padding:"5px 8px", fontSize:12, fontFamily:"inherit" };

/* ------------------------------------------------------- 2. hospital drill */

function Hospitals({ model, selHospital, setSelHospital, thresholds, ex }) {
  const h = model.canon.find(x => x.id === selHospital);
  const K = model.kpis[h.id], R = model.reporting[h.id];
  const hEx = ex.filter(e => e.hospital === h.id && e.status !== "CLOSED");
  const series = K.perDay.filter(d => d.submitted).map(d => ({ date:dayLabel(d.date), revenue:d.revenue, attendance:d.attendance, arpe:d.arpe }));

  return (
    <>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {model.canon.map(x => (
          <button key={x.id} onClick={()=>setSelHospital(x.id)} style={{
            ...btnGhost, padding:"6px 11px",
            background: x.id===selHospital ? C.panel2 : "transparent",
            borderColor: x.id===selHospital ? C.brand : C.line,
            color: x.id===selHospital ? C.ink : C.inkDim,
          }}>{x.name}</button>
        ))}
      </div>

      <div style={{ marginBottom:16 }}>
        <h1 style={{ margin:0, fontSize:21, fontWeight:600 }}>{h.name} <Mono style={{ fontSize:13, color:C.inkFaint }}>{h.id}</Mono></h1>
        <p style={{ margin:"5px 0 0", fontSize:12.5, color:C.inkDim }}>
          {K.totals.daysSubmitted} of {R.due.length} expected dates submitted · last submission {R.lastSubmitted || "none"}
        </p>
      </div>

      {h.naReason && (
        <div style={{ background:"rgba(75,135,184,.07)", border:`1px solid rgba(75,135,184,.3)`, borderRadius:3, padding:"11px 14px", marginBottom:16, fontSize:12.5, lineHeight:1.6, color:C.inkDim }}>
          <strong style={{ color:C.ink, fontWeight:600 }}>Declared not applicable:</strong> {h.naFields.join(", ")}. {h.naReason} These
          fields are excluded from every calculation and generate no compliance exception.
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10, marginBottom:16 }}>
        <Stat label="Revenue" value={moneyK(K.totals.revenue)} />
        <Stat label="Attendance" value={int(K.totals.attendance)} />
        <Stat label="ARPE" value={money(K.totals.arpe)} />
        <Stat label="Admissions" value={int(K.totals.admissions)} />
        <Stat label="Conversion" value={pct(K.totals.conversion,2)} />
        <Stat label="NPS" value={pct(K.totals.nps,1)} sub={`${K.totals.npsDayCount} computable days`} />
        <Stat label="Open exceptions" value={hEx.length} tone={hEx.length?C.red:C.green} />
      </div>

      <Panel title="Daily revenue and attendance">
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={series} margin={{ top:5, right:8, left:-8, bottom:0 }}>
            <CartesianGrid stroke={C.lineSoft} vertical={false} />
            <XAxis dataKey="date" tick={{ fill:C.inkFaint, fontSize:11 }} axisLine={{ stroke:C.line }} tickLine={false} />
            <YAxis yAxisId="l" tickFormatter={v=>`${(v/1e6).toFixed(1)}m`} tick={{ fill:C.inkFaint, fontSize:11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="r" orientation="right" tick={{ fill:C.inkFaint, fontSize:11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background:C.panel2, border:`1px solid ${C.line}`, borderRadius:3, fontSize:12 }} labelStyle={{ color:C.inkDim }} />
            <Line yAxisId="l" dataKey="revenue" stroke={C.info} strokeWidth={2} dot={{ r:2 }} name="Revenue" />
            <Line yAxisId="r" dataKey="attendance" stroke={C.amber} strokeWidth={2} dot={{ r:2 }} name="Attendance" />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Daily record" note="Every figure here is recomputed from payer components. Cell markers show the state of the underlying source value.">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Day</th>
              <th style={{...th,textAlign:"right"}}>Attendance</th><th style={{...th,textAlign:"right"}}>Private</th>
              <th style={{...th,textAlign:"right"}}>HMO</th><th style={{...th,textAlign:"right"}}>LASHMA</th>
              <th style={{...th,textAlign:"right"}}>NHIA</th><th style={{...th,textAlign:"right"}}>Company</th>
              <th style={{...th,textAlign:"right"}}>Adm</th><th style={{...th,textAlign:"right"}}>Conv</th>
              <th style={{...th,textAlign:"right"}}>Revenue</th><th style={{...th,textAlign:"right"}}>ARPE</th>
              <th style={{...th,textAlign:"right"}}>NPS</th>
            </tr></thead>
            <tbody>
              {R.due.map(d => {
                const rec = h.records.find(r => r.date === d);
                const k = rec ? K.perDay[h.records.indexOf(rec)] : null;
                if (!rec || !rec.submitted) return (
                  <tr key={d}>
                    <td style={{...td, color:C.amber}}>{dayLabel(d)}</td>
                    <td style={{...td, color:C.inkFaint}}>{weekday(d)}</td>
                    <td colSpan={11} style={{ ...td, color:C.amber, fontSize:12 }}>
                      No record submitted · potential reporting gap
                    </td>
                  </tr>
                );
                const c = (key) => {
                  const f = rec.f[key];
                  if (!f) return <span style={{ color:C.inkFaint }}>—</span>;
                  if (f.state === STATE.NA) return <span title={h.naReason} style={{ color:C.info, fontSize:11 }}>N/A</span>;
                  if (f.state === STATE.NOT_OBSERVED) return <span title={f.note} style={{ color:C.inkFaint, fontSize:11 }}>not obs.</span>;
                  if (f.state === STATE.INCOMPLETE) return <span title="Blank in source" style={{ color:C.amber }}>blank</span>;
                  return int(f.value);
                };
                return (
                  <tr key={d}>
                    <td style={td}>{dayLabel(d)}{!rec.complete && <span title="Incomplete submission" style={{ color:C.amber, marginLeft:5 }}>◐</span>}</td>
                    <td style={{...td, color:C.inkFaint}}>{weekday(d)}</td>
                    <td style={tdR}>{int(k.attendance)}</td>
                    <td style={tdR}>{c("priv")}</td><td style={tdR}>{c("hmo")}</td><td style={tdR}>{c("lash")}</td>
                    <td style={tdR}>{c("nhia")}</td><td style={tdR}>{c("comp")}</td>
                    <td style={tdR}>{int(k.admissions)}</td>
                    <td style={tdR}>{pct(k.conversion,1)}</td>
                    <td style={tdR}>{money(k.revenue)}</td>
                    <td style={tdR}>{money(k.arpe)}</td>
                    <td style={tdR}>{rec.f.rNPS.state===STATE.INCOMPLETE
                      ? <span title="Survey parameters not filled in for this date" style={{ color:C.inkFaint, fontSize:11 }}>not filled</span>
                      : pct(k.nps,0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {hEx.length > 0 && (
        <Panel title={`Open exceptions for ${h.name}`} accent={C.red}>
          {hEx.map(e => (
            <div key={e.id} style={{ display:"flex", gap:12, padding:"8px 0", borderBottom:`1px solid ${C.lineSoft}`, fontSize:12.5 }}>
              <Mono style={{ fontSize:11, color:C.inkFaint, width:56 }}>{e.id}</Mono>
              <span style={{ width:130, color:C.inkDim, flexShrink:0 }}>{e.category}</span>
              <span style={{ flex:1, lineHeight:1.5 }}>{e.issue}</span>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}

/* ----------------------------------------------------------- 3. exceptions */

function Exceptions({ ex, updateEx, exFilter, setExFilter, model }) {
  const [open, setOpen] = useState(null);
  const cats = ["ALL", CATEGORY.REPORTING, CATEGORY.DQ, CATEGORY.PERF, CATEGORY.RISK];
  const list = ex.filter(e => exFilter === "ALL" || e.category === exFilter);
  const byCat = Object.fromEntries(cats.slice(1).map(c => [c, ex.filter(e => e.category === c && e.status !== "CLOSED").length]));

  return (
    <>
      <div style={{ marginBottom:16 }}>
        <h1 style={{ margin:0, fontSize:21, fontWeight:600 }}>Exception register</h1>
        <p style={{ margin:"5px 0 0", fontSize:13, color:C.inkDim, maxWidth:"80ch", lineHeight:1.6 }}>
          Every exception below was produced by a deterministic rule against the source data. Severity and SLA are unset
          because neither was supplied — assign them here or configure defaults under Rules &amp; thresholds.
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:10, marginBottom:16 }}>
        {cats.slice(1).map(c => (
          <Stat key={c} label={c} value={byCat[c]}
                tone={byCat[c] ? (c===CATEGORY.REPORTING?C.red:C.amber) : C.inkFaint}
                sub={c===CATEGORY.PERF ? "No thresholds configured" : c===CATEGORY.RISK ? "No risk rules configured" : "open"} />
        ))}
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {cats.map(c => (
          <button key={c} onClick={()=>setExFilter(c)} style={{ ...btnGhost, padding:"5px 10px",
            borderColor: exFilter===c?C.brand:C.line, color: exFilter===c?C.ink:C.inkDim }}>
            {c === "ALL" ? "All" : c}
          </button>
        ))}
      </div>

      <Panel>
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>ID</th><th style={th}>Rule</th><th style={th}>Hospital</th><th style={th}>Domain</th>
              <th style={th}>Issue</th><th style={th}>Severity</th><th style={th}>Owner</th>
              <th style={th}>SLA</th><th style={th}>Status</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {list.map(e => (
                <tr key={e.id}>
                  <td style={td}><Mono style={{ fontSize:11 }}>{e.id}</Mono></td>
                  <td style={td}><Mono style={{ fontSize:11, color:C.inkFaint }}>{e.rule}</Mono></td>
                  <td style={td}><Mono style={{ fontSize:11.5 }}>{e.hospital}</Mono></td>
                  <td style={{...td, color:C.inkDim}}>{e.domain}</td>
                  <td style={{ ...td, whiteSpace:"normal", maxWidth:340, lineHeight:1.5 }}>
                    {e.issue}
                    {e.provisional && <em style={{ display:"block", color:C.amber, fontStyle:"normal", fontSize:11.5, marginTop:2 }}>Potential — expected calendar not confirmed</em>}
                  </td>
                  <td style={td}>{e.severity ? <RagChip status={e.severity} small /> : <span style={{ color:C.inkFaint, fontSize:11.5 }}>unset</span>}</td>
                  <td style={{...td, color: e.owner?C.ink:C.amber, fontSize:11.5}}>{e.owner || `${e.ownerRole}, unnamed`}</td>
                  <td style={{...td, color:C.inkFaint, fontSize:11.5}}>{e.sla || "unset"}</td>
                  <td style={td}>
                    <span style={{ fontSize:11.5, color: e.status==="CLOSED"?C.green : e.status==="ESCALATED"?C.red : C.inkDim }}>
                      {e.status.toLowerCase()}
                    </span>
                  </td>
                  <td style={td}>
                    <button onClick={()=>setOpen(open===e.id?null:e.id)} style={{ ...btnGhost, padding:"3px 9px", fontSize:11.5 }}>
                      {open===e.id?"Close":"Manage"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {open && <ExceptionDetail e={list.find(x=>x.id===open)} updateEx={updateEx} />}
    </>
  );
}

function ExceptionDetail({ e, updateEx }) {
  const [owner, setOwner] = useState(e.owner || "");
  const [sla, setSla] = useState(e.sla || "");
  const [evidence, setEvidence] = useState(e.evidence || "");
  if (!e) return null;

  return (
    <Panel title={`${e.id} — ${e.issue}`} accent={C.brand}
           note={`Rule ${e.rule} · ${e.category} · identified ${e.identified}`}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))", gap:16, marginBottom:16 }}>
        <Field label="Current value" value={e.current} />
        <Field label="Expected value / rule" value={e.expected} />
        <Field label="Action required" value={e.action} />
        <Field label="Accountable role" value={`${e.ownerRole} (name not supplied)`} />
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end", paddingTop:14, borderTop:`1px solid ${C.lineSoft}` }}>
        <label style={lbl}>Severity
          <select value={e.severity || ""} onChange={ev=>updateEx(e.id,{severity:ev.target.value||null},`Severity set to ${ev.target.value||"unset"}`)} style={inputS}>
            <option value="">unset</option>
            {["GREEN","AMBER","RED","CRITICAL"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={lbl}>Accountable owner
          <input value={owner} onChange={ev=>setOwner(ev.target.value)} placeholder="Name" style={{ ...inputS, width:170 }} />
        </label>
        <label style={lbl}>SLA
          <input value={sla} onChange={ev=>setSla(ev.target.value)} placeholder="e.g. 24 hours" style={{ ...inputS, width:110 }} />
        </label>
        <button onClick={()=>updateEx(e.id,{owner:owner||null,sla:sla||null},`Owner set to ${owner||"unassigned"}, SLA ${sla||"unset"}`)} style={btn}>Record ownership</button>
        <button onClick={()=>updateEx(e.id,{status:"ACKNOWLEDGED"},"Acknowledged")} style={btnGhost}>Acknowledge</button>
        <button onClick={()=>updateEx(e.id,{status:"ESCALATED",escalation:(e.escalation||0)+1},"Escalated one level")} style={btnGhost}>Escalate</button>
      </div>

      <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginTop:12 }}>
        <label style={{ ...lbl, flex:1 }}>Closure evidence
          <input value={evidence} onChange={ev=>setEvidence(ev.target.value)} placeholder="What was done, and how it was verified" style={{ ...inputS, width:"100%" }} />
        </label>
        <button disabled={!evidence} onClick={()=>updateEx(e.id,{status:"CLOSED",evidence,closedOn:CONFIG.asOfDate},`Closed with evidence: ${evidence}`)}
                style={{ ...btn, opacity: evidence?1:.4, cursor: evidence?"pointer":"not-allowed", background: evidence?C.green:C.line }}>
          Close exception
        </button>
      </div>
      <p style={{ fontSize:11.5, color:C.inkFaint, margin:"7px 0 0" }}>Closure requires evidence. An exception cannot be closed on assertion alone.</p>

      <div style={{ marginTop:18, paddingTop:14, borderTop:`1px solid ${C.lineSoft}` }}>
        <div style={{ fontSize:12, color:C.inkDim, marginBottom:7 }}>Audit history</div>
        {(e.history||[]).map((h,i)=>(
          <div key={i} style={{ display:"flex", gap:12, fontSize:12, padding:"4px 0", color:C.inkDim }}>
            <Mono style={{ fontSize:11, color:C.inkFaint, width:86 }}>{h.at}</Mono>
            <span style={{ flex:1 }}>{h.what}</span>
            <span style={{ color:C.inkFaint }}>{h.by}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const lbl = { display:"flex", flexDirection:"column", gap:4, fontSize:11.5, color:C.inkDim };
function Field({ label, value }) {
  return <div><div style={{ fontSize:11.5, color:C.inkDim, marginBottom:4 }}>{label}</div>
    <div style={{ fontSize:12.5, lineHeight:1.55 }}>{value}</div></div>;
}

/* ------------------------------------------------------------ 4. reporting */

function Reporting({ model, cal, setCal }) {
  return (
    <>
      <div style={{ marginBottom:16 }}>
        <h1 style={{ margin:0, fontSize:21, fontWeight:600 }}>Reporting compliance</h1>
        <p style={{ margin:"5px 0 0", fontSize:13, color:C.inkDim, maxWidth:"82ch", lineHeight:1.6 }}>
          Derived independently from expected dates and record presence. The hospitals' own "Reporting Compliance Rate"
          column is displayed for comparison but is never used as the answer.
        </p>
      </div>

      <Panel title="Expected reporting calendar" accent={C.amber}
             note="No reporting calendar was supplied, so this is a declared default, not a confirmed business rule. Until it is confirmed, every gap is reported as potential rather than as a compliance failure.">
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"flex-end" }}>
          <label style={lbl}>Cadence
            <select value={cal.cadence} onChange={e=>setCal({...cal, cadence:e.target.value})} style={inputS}>
              <option value="DAILY">Every day</option>
              <option value="WEEKDAYS">Weekdays only</option>
            </select>
          </label>
          <label style={lbl}>Current day due?
            <select value={String(cal.countCurrentDayAsDue)} onChange={e=>setCal({...cal, countCurrentDayAsDue:e.target.value==="true"})} style={inputS}>
              <option value="false">Not yet due</option><option value="true">Due</option>
            </select>
          </label>
          <label style={lbl}>Calendar confirmed by business?
            <select value={String(cal.cadenceConfirmed)} onChange={e=>setCal({...cal, cadenceConfirmed:e.target.value==="true"})} style={inputS}>
              <option value="false">Not confirmed</option><option value="true">Confirmed</option>
            </select>
          </label>
          <div style={{ fontSize:12, color:C.inkDim, paddingBottom:6 }}>
            {expectedDates(cal).length} expected dates to {CONFIG.asOfDate}
          </div>
        </div>
      </Panel>

      <Panel title="Submission status by hospital">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Hospital</th><th style={{...th,textAlign:"right"}}>Submitted</th>
              <th style={{...th,textAlign:"right"}}>Expected</th><th style={{...th,textAlign:"right"}}>Observed rate</th>
              <th style={th}>Last submitted</th><th style={th}>Missing dates</th>
              <th style={th}>Incomplete</th><th style={{...th,textAlign:"right"}}>Sheet's own figure</th>
            </tr></thead>
            <tbody>
              {model.canon.map(h => {
                const r = model.reporting[h.id];
                const last = h.records.filter(x=>x.submitted).slice(-1)[0];
                const sheetOwn = last?.ops?.rep;
                return (
                  <tr key={h.id}>
                    <td style={td}><Mono style={{ fontSize:11, color:C.inkFaint }}>{h.id}</Mono> <span style={{marginLeft:6}}>{h.name}</span></td>
                    <td style={tdR}>{r.due.length - r.missing.length}</td>
                    <td style={tdR}>{r.due.length}</td>
                    <td style={{ ...tdR, color: r.submissionRate===1?C.green:C.amber }}>{pct(r.submissionRate,0)}</td>
                    <td style={td}><Mono style={{ fontSize:11.5 }}>{r.lastSubmitted || "—"}</Mono></td>
                    <td style={{ ...td, whiteSpace:"normal", maxWidth:230, color: r.missing.length?C.amber:C.green, fontSize:12 }}>
                      {r.missing.length ? r.missing.map(dayLabel).join(", ") : "none"}
                    </td>
                    <td style={{ ...td, color: r.incomplete.length?C.amber:C.inkFaint, fontSize:12 }}>
                      {r.incomplete.length ? r.incomplete.map(dayLabel).join(", ") : "none"}
                    </td>
                    <td style={{ ...tdR, color:C.inkFaint }}>{sheetOwn !== undefined ? sheetOwn : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize:12, color:C.inkDim, margin:"12px 0 0", lineHeight:1.6, maxWidth:"82ch" }}>
          The right-hand column is what each hospital typed into its own compliance field. Where it disagrees with the
          observed rate, the observed rate is what the Control Tower reports — and the disagreement is itself worth raising
          with the Business Manager.
        </p>
      </Panel>

      <Panel title="Submission grid" note="One column per expected date. Filled = record present, hollow = incomplete, empty = no record.">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Hospital</th>
              {expectedDates(cal).map(d => <th key={d} style={{ ...th, textAlign:"center", padding:"7px 4px", fontWeight:400 }}>
                <div style={{ fontSize:10.5 }}>{new Date(d+"T00:00:00").getDate()}</div>
                <div style={{ fontSize:9, color:C.inkFaint }}>{weekday(d).slice(0,1)}</div>
              </th>)}
            </tr></thead>
            <tbody>
              {model.canon.map(h => (
                <tr key={h.id}>
                  <td style={td}><Mono style={{ fontSize:11.5 }}>{h.id}</Mono></td>
                  {expectedDates(cal).map(d => {
                    const rec = h.records.find(r => r.date === d);
                    const ok = rec && rec.submitted, full = rec && rec.complete;
                    return (
                      <td key={d} style={{ textAlign:"center", padding:"6px 4px", borderBottom:`1px solid ${C.lineSoft}` }}>
                        <span title={`${h.name} · ${d} · ${ok ? (full?"submitted":"incomplete") : "no record"}`}
                              style={{ display:"inline-block", width:11, height:11, borderRadius:2,
                                       background: ok ? (full?C.green:"transparent") : "transparent",
                                       border: ok && !full ? `1.5px solid ${C.amber}` : ok ? "none" : `1px solid ${C.line}` }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* -------------------------------------------------------------- 5. revenue */

function Revenue({ model }) {
  return (
    <>
      <h1 style={{ margin:"0 0 5px", fontSize:21, fontWeight:600 }}>Revenue &amp; finance</h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:C.inkDim, maxWidth:"80ch", lineHeight:1.6 }}>
        Revenue is summed from payer components for the submitted days in {CONFIG.period.label}.
      </p>

      <Panel title="Revenue by payer">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Hospital</th><th style={{...th,textAlign:"right"}}>Private</th><th style={{...th,textAlign:"right"}}>HMO</th>
              <th style={{...th,textAlign:"right"}}>NHIA</th><th style={{...th,textAlign:"right"}}>Company</th>
              <th style={{...th,textAlign:"right"}}>Total</th><th style={{...th,textAlign:"right"}}>ARPE</th>
              <th style={{...th,textAlign:"right"}}>Revenue MTD</th>
            </tr></thead>
            <tbody>
              {model.canon.map(h => {
                const sub = h.records.filter(r=>r.submitted);
                const s = k => { let t=null; sub.forEach(r=>{ const v=num(r.f[k]?.value); if(v!==null) t=(t??0)+v; }); return t; };
                const naf = new Set(h.naFields);
                const mtd = model.kpis[h.id].mtdSeries.slice(-1)[0]?.mtd;
                return (
                  <tr key={h.id}>
                    <td style={td}>{h.name}</td>
                    <td style={tdR}>{naf.has("privRev") ? <span style={{color:C.info,fontSize:11}}>N/A</span> : moneyK(s("privRev"))}</td>
                    <td style={tdR}>{moneyK(s("hmoRev"))}</td>
                    <td style={tdR}>{s("nhiaRev")===null ? <span style={{color:C.inkFaint,fontSize:11}}>not obs.</span> : moneyK(s("nhiaRev"))}</td>
                    <td style={tdR}>{s("compRev")===null ? <span style={{color:C.inkFaint,fontSize:11}}>not obs.</span> : moneyK(s("compRev"))}</td>
                    <td style={{...tdR, color:C.ink}}>{moneyK(model.kpis[h.id].totals.revenue)}</td>
                    <td style={tdR}>{money(model.kpis[h.id].totals.arpe)}</td>
                    <td style={tdR}>{moneyK(mtd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Collections (cash received)">
        <Unavailable
          title="Partially available — not safe to report at network level"
          reason="Collections is blank for Ultimate, First Health, Mainframe, Neolife Babies and Roding across the whole period. Talent and Hosanna populate it. Aggregating a network collections figure from two of seven hospitals would be misleading, so no network figure is shown."
          needs={["Confirm whether Collections is expected from all seven hospitals", "Backfill or formally mark as not-applicable per hospital"]} />
      </Panel>

      <Panel title="Revenue achievement rate">
        <Unavailable
          title="Displayed per hospital only — denominator unknown"
          reason="Every hospital populates a Revenue Achievement Rate, but no revenue target was supplied, so the engine cannot verify how the figure is derived or recompute it. It is carried as a source-reported value and excluded from ranking."
          needs={["Monthly revenue target per hospital", "Confirmation of the achievement-rate formula"]} />
      </Panel>

      <Panel title="HMO revenue cycle">
        <Unavailable
          title="Integration pending"
          reason="The hospital sheets carry HMO attendance and HMO revenue only. Claims submitted, claims rejected, outstanding receivables, aging, DSO and recovery rate do not exist in any of the seven sources."
          needs={["A claims/receivables source", "Payer-level claim status feed"]} />
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------- 6. activity */

function Activity({ model }) {
  return (
    <>
      <h1 style={{ margin:"0 0 5px", fontSize:21, fontWeight:600 }}>Patient activity</h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:C.inkDim, maxWidth:"80ch", lineHeight:1.6 }}>
        Attendance by payer, admissions, discharges and conversion for submitted days.
      </p>
      <Panel title="Attendance and flow">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Hospital</th><th style={{...th,textAlign:"right"}}>Attendance</th>
              <th style={{...th,textAlign:"right"}}>New reg.</th><th style={{...th,textAlign:"right"}}>Private</th>
              <th style={{...th,textAlign:"right"}}>HMO</th><th style={{...th,textAlign:"right"}}>LASHMA</th>
              <th style={{...th,textAlign:"right"}}>NHIA</th><th style={{...th,textAlign:"right"}}>Company</th>
              <th style={{...th,textAlign:"right"}}>Admissions</th><th style={{...th,textAlign:"right"}}>Discharges</th>
              <th style={{...th,textAlign:"right"}}>Conversion</th>
            </tr></thead>
            <tbody>
              {model.canon.map(h => {
                const sub = h.records.filter(r=>r.submitted);
                const s = k => { let t=null; sub.forEach(r=>{ const v=num(r.f[k]?.value); if(v!==null) t=(t??0)+v; }); return t; };
                const naf = new Set(h.naFields);
                const K = model.kpis[h.id].totals;
                const cellv = (key) => naf.has(key) ? <span style={{color:C.info,fontSize:11}}>N/A</span>
                  : s(key)===null ? <span style={{color:C.inkFaint,fontSize:11}}>not obs.</span> : int(s(key));
                return (
                  <tr key={h.id}>
                    <td style={td}>{h.name}</td>
                    <td style={{...tdR,color:C.ink}}>{int(K.attendance)}</td>
                    <td style={tdR}>{int(K.newReg)}</td>
                    <td style={tdR}>{cellv("priv")}</td><td style={tdR}>{cellv("hmo")}</td>
                    <td style={tdR}>{cellv("lash")}</td><td style={tdR}>{cellv("nhia")}</td><td style={tdR}>{cellv("comp")}</td>
                    <td style={tdR}>{int(K.admissions)}</td><td style={tdR}>{int(K.discharges)}</td>
                    <td style={tdR}>{pct(K.conversion,2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize:12, color:C.inkDim, margin:"12px 0 0", lineHeight:1.6 }}>
          "not obs." means the column exists in the hospital's sheet but carried no value on any submitted day this period.
          That is a question for the Business Manager, not an assumed zero.
        </p>
      </Panel>
    </>
  );
}

/* ----------------------------------------------------------- 7. experience */

function Experience({ model, ex }) {
  const npsIssues = ex.filter(e => e.domain === "Patient experience" && e.status !== "CLOSED");
  return (
    <>
      <h1 style={{ margin:"0 0 5px", fontSize:21, fontWeight:600 }}>Patient experience</h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:C.inkDim, maxWidth:"80ch", lineHeight:1.6 }}>
        NPS recomputed from promoter, detractor and indifferent counts.
      </p>
      <Panel title="Net promoter score">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Hospital</th><th style={{...th,textAlign:"right"}}>NPS</th>
              <th style={{...th,textAlign:"right"}}>Computable days</th><th style={{...th,textAlign:"right"}}>Respondents</th>
              <th style={th}>Integrity</th>
            </tr></thead>
            <tbody>
              {model.canon.map(h => {
                const K = model.kpis[h.id];
                const resp = K.perDay.filter(d=>d.submitted).reduce((a,d)=>a+(d.npsRespondents??0),0);
                const issue = npsIssues.find(e=>e.hospital===h.id);
                const unfilledDays = h.records.filter(r=>r.submitted && r.f.rNPS.state===STATE.INCOMPLETE).length;
                return (
                  <tr key={h.id}>
                    <td style={td}>{h.name}</td>
                    <td style={{...tdR,color:C.ink}}>{K.totals.nps===null?"—":pct(K.totals.nps,1)}</td>
                    <td style={tdR}>{K.totals.npsDayCount}/{K.totals.daysSubmitted}</td>
                    <td style={tdR}>{int(resp)}</td>
                    <td style={{ ...td, whiteSpace:"normal", maxWidth:380, fontSize:12, lineHeight:1.5,
                                 color: issue ? C.amber : unfilledDays ? C.inkFaint : C.green }}>
                      {issue ? "Respondent counts exceed attendance on some days — not safe to rank"
                        : unfilledDays ? `Survey parameters not filled in on ${unfilledDays} day${unfilledDays>1?"s":""} — not an error, just not yet collected`
                        : "Recomputed value matches source"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Average waiting time">
        <Unavailable title="Excluded from network ranking"
          reason="Waiting time is recorded inconsistently: some hospitals hold an identical value on every submitted day, which suggests a standing figure rather than a daily measurement. Per the product specification it is not used as a ranking KPI until the underlying capture is reliable."
          needs={["Confirmation of how waiting time is measured and how often"]} />
      </Panel>
    </>
  );
}

/* ------------------------------------- 8-11. operations / clinical / etc. */

function UnvalidatedDomain({ domain, fields, model, ex }) {
  const rel = ex.filter(e => e.domain === "Unvalidated domains" && fields.some(f => (e.issue||"").startsWith(OPS_LABEL[f]||"~")) && e.status !== "CLOSED");
  return (
    <>
      <h1 style={{ margin:"0 0 5px", fontSize:21, fontWeight:600 }}>{domain}</h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:C.inkDim, maxWidth:"82ch", lineHeight:1.6 }}>
        These fields exist in the standardised schema but are not yet reliable enough to rank hospitals on. Values are shown
        exactly as submitted, including their original formatting, so that inconsistencies stay visible.
      </p>

      <Panel title="Latest submitted values" note="Read across, not down: these are not comparable between hospitals until units and capture method are confirmed.">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Hospital</th>
              {fields.map(f => <th key={f} style={{...th,textAlign:"right"}}>{OPS_LABEL[f]}</th>)}
              <th style={th}>Last submitted</th>
            </tr></thead>
            <tbody>
              {model.canon.map(h => {
                const last = h.records.filter(r=>r.submitted).slice(-1)[0];
                return (
                  <tr key={h.id}>
                    <td style={td}>{h.name}</td>
                    {fields.map(f => {
                      const v = last?.ops?.[f];
                      return <td key={f} style={tdR}>
                        {v === undefined || v === "" ? <span style={{ color:C.inkFaint, fontSize:11 }}>not submitted</span> : v}
                      </td>;
                    })}
                    <td style={{...td, color:C.inkFaint}}><Mono style={{fontSize:11.5}}>{last?.date || "—"}</Mono></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {rel.length > 0 && (
        <Panel title="Data-quality observations in this domain" accent={C.amber}>
          {rel.map(e => (
            <div key={e.id} style={{ display:"flex", gap:12, padding:"8px 0", borderBottom:`1px solid ${C.lineSoft}`, fontSize:12.5 }}>
              <Mono style={{ fontSize:11, color:C.inkFaint, width:56 }}>{e.id}</Mono>
              <Mono style={{ fontSize:11.5, width:38 }}>{e.hospital}</Mono>
              <span style={{ flex:1, lineHeight:1.5 }}>{e.issue} <span style={{ color:C.inkFaint }}>— {e.current}</span></span>
            </div>
          ))}
        </Panel>
      )}
      {rel.length === 0 && (
        <Panel><p style={{ fontSize:12.5, color:C.inkDim, margin:0 }}>No automated observations raised for this domain in the current period.</p></Panel>
      )}
    </>
  );
}

/* ------------------------------------------------------------- 12. followup */

function FollowUp() {
  const stages = ["Eligible","Due","Contacted","Reached","Booked","Completed","High-risk overdue","Escalated","Closed","Retained","Revenue attributable"];
  return (
    <>
      <h1 style={{ margin:"0 0 5px", fontSize:21, fontWeight:600 }}>Follow-Up</h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:C.inkDim, maxWidth:"80ch", lineHeight:1.6 }}>
        The highest-priority control area under the CEO mandate. Not yet connected.
      </p>
      <Panel accent={C.info}>
        <Unavailable title="Integration pending — no source connected"
          reason="None of the seven hospital sheets contains Follow-Up fields. No Follow-Up figures are shown, estimated or inferred. The data model and exception engine already accept a Follow-Up domain, so connecting a source will not require the application to be rebuilt."
          needs={["A Follow-Up register per hospital, or the equivalent Network EMR feed", "Definition of eligibility and the due window", "Definition of high-risk overdue"]} />
        <div style={{ marginTop:18 }}>
          <div style={{ fontSize:12, color:C.inkDim, marginBottom:9 }}>Stages the module is built to track once a source exists</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {stages.map(s => (
              <span key={s} style={{ fontSize:11.5, color:C.inkFaint, border:`1px dashed ${C.line}`, borderRadius:2, padding:"4px 9px" }}>{s}</span>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}

/* --------------------------------------------------------------- 13. config */

function ConfigModule({ thresholds, setThresholds, cal, setCal }) {
  const [draft, setDraft] = useState({ kpi:"revenue", hospital:"ALL", target:"", amber:"", red:"", critical:"", direction:"LOWER_IS_WORSE" });
  const add = () => {
    if (draft.amber === "" && draft.red === "" && draft.critical === "") return;
    setThresholds([...thresholds, {
      ...draft, id:`T${thresholds.length+1}`,
      target: draft.target===""?null:Number(draft.target), amber: draft.amber===""?null:Number(draft.amber),
      red: draft.red===""?null:Number(draft.red), critical: draft.critical===""?null:Number(draft.critical),
      effective: CONFIG.asOfDate, owner:"Control Tower Lead",
    }]);
  };
  return (
    <>
      <h1 style={{ margin:"0 0 5px", fontSize:21, fontWeight:600 }}>Rules &amp; thresholds</h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:C.inkDim, maxWidth:"82ch", lineHeight:1.6 }}>
        V0.1 ships with an empty threshold table on purpose. Nothing here was invented. Until a threshold is entered,
        performance RAG stays unrated and no performance exception can fire.
      </p>

      <Panel title="KPI thresholds" note={thresholds.length ? undefined : "None configured. Add one below to activate RAG rating and performance exceptions."}>
        {thresholds.length > 0 && (
          <table style={{ marginBottom:14 }}>
            <thead><tr>
              <th style={th}>KPI</th><th style={th}>Hospital</th><th style={{...th,textAlign:"right"}}>Target</th>
              <th style={{...th,textAlign:"right"}}>Amber</th><th style={{...th,textAlign:"right"}}>Red</th>
              <th style={{...th,textAlign:"right"}}>Critical</th><th style={th}>Effective</th>
            </tr></thead>
            <tbody>{thresholds.map(t => (
              <tr key={t.id}>
                <td style={td}>{KPI_DEFS[t.kpi]?.label || t.kpi}</td><td style={td}>{t.hospital}</td>
                <td style={tdR}>{t.target ?? "—"}</td><td style={tdR}>{t.amber ?? "—"}</td>
                <td style={tdR}>{t.red ?? "—"}</td><td style={tdR}>{t.critical ?? "—"}</td>
                <td style={{...td,color:C.inkFaint}}>{t.effective}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <div style={{ display:"flex", gap:9, flexWrap:"wrap", alignItems:"flex-end" }}>
          <label style={lbl}>KPI
            <select value={draft.kpi} onChange={e=>setDraft({...draft,kpi:e.target.value})} style={inputS}>
              {Object.entries(KPI_DEFS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select></label>
          <label style={lbl}>Hospital
            <select value={draft.hospital} onChange={e=>setDraft({...draft,hospital:e.target.value})} style={inputS}>
              <option value="ALL">All hospitals</option>
              {CONFIG.hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
            </select></label>
          {["target","amber","red","critical"].map(f => (
            <label key={f} style={lbl}>{f[0].toUpperCase()+f.slice(1)}
              <input value={draft[f]} onChange={e=>setDraft({...draft,[f]:e.target.value})} placeholder="—" style={{ ...inputS, width:88 }} /></label>
          ))}
          <label style={lbl}>Direction
            <select value={draft.direction} onChange={e=>setDraft({...draft,direction:e.target.value})} style={inputS}>
              <option value="LOWER_IS_WORSE">Lower is worse</option><option value="HIGHER_IS_WORSE">Higher is worse</option>
            </select></label>
          <button onClick={add} style={btn}>Add threshold</button>
        </div>
        <p style={{ fontSize:11.5, color:C.inkFaint, margin:"10px 0 0" }}>Thresholds held in session only in V0.1; persistence arrives with the backend.</p>
      </Panel>

      <Panel title="Exception rules in force" note="Each rule is deterministic and testable. None depends on a threshold that was not supplied.">
        <table>
          <thead><tr><th style={th}>Rule</th><th style={th}>Category</th><th style={th}>Fires when</th></tr></thead>
          <tbody>{RULES.map(r => (
            <tr key={r.id}>
              <td style={td}><Mono style={{fontSize:11.5}}>{r.id}</Mono></td>
              <td style={{...td,color:C.inkDim}}>{r.cat}</td>
              <td style={{...td,whiteSpace:"normal",lineHeight:1.5}}>{r.name}</td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>

      <Panel title="Accountability model" note="Taken from the CEO mandate, not inferred.">
        <p style={{ fontSize:12.5, color:C.inkDim, lineHeight:1.7, maxWidth:"80ch", margin:0 }}>
          Business Managers own hospital data submission, Follow-Up execution and corrective action. The Control Tower owns
          monitoring, validation, exception identification, ownership recording, escalation and closure tracking. Exception
          owners default to the Business Manager role for the hospital concerned; individual names were not supplied and are
          entered by the Control Tower Lead when an exception is worked.
        </p>
      </Panel>
    </>
  );
}

/* -------------------------------------------------------------- 14. lineage */

function Lineage({ model }) {
  const [sel, setSel] = useState("attendance");
  const def = KPI_DEFS[sel];
  return (
    <>
      <h1 style={{ margin:"0 0 5px", fontSize:21, fontWeight:600 }}>Data lineage</h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:C.inkDim, maxWidth:"80ch", lineHeight:1.6 }}>
        Every KPI traces back to the fields, hospital, sheet and reporting date it came from.
      </p>

      <Panel title="Source connections">
        <table>
          <thead><tr><th style={th}>Hospital</th><th style={th}>Source</th><th style={th}>Sheet ID</th><th style={th}>Rows read</th><th style={th}>Status</th></tr></thead>
          <tbody>{model.canon.map(h => (
            <tr key={h.id}>
              <td style={td}>{h.name}</td><td style={{...td,color:C.inkDim}}>Google Sheets</td>
              <td style={td}><Mono style={{ fontSize:10.5, color:C.inkFaint }}>{h.sheetId.slice(0,22)}…</Mono></td>
              <td style={tdR}>{h.records.length}</td>
              <td style={td}><span style={{ color:C.amber, fontSize:12 }}>snapshot</span></td>
            </tr>
          ))}</tbody>
        </table>
        <p style={{ fontSize:12, color:C.inkDim, margin:"12px 0 0", lineHeight:1.6, maxWidth:"80ch" }}>
          {model.source.meta.note} A live connector replaces this adapter without any change to the KPI, data-quality or
          exception layers.
        </p>
      </Panel>

      <Panel title="KPI derivation">
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          {Object.entries(KPI_DEFS).map(([k,v]) => (
            <button key={k} onClick={()=>setSel(k)} style={{ ...btnGhost, padding:"5px 10px",
              borderColor: sel===k?C.brand:C.line, color: sel===k?C.ink:C.inkDim }}>{v.label}</button>
          ))}
        </div>
        <div style={{ background:C.panel2, border:`1px solid ${C.lineSoft}`, borderRadius:3, padding:"14px 16px" }}>
          <div style={{ fontSize:12, color:C.inkDim, marginBottom:5 }}>Formula</div>
          <Mono style={{ fontSize:13, display:"block", marginBottom:14 }}>{def.formula}</Mono>
          <div style={{ fontSize:12, color:C.inkDim, marginBottom:7 }}>Source fields</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
            {def.sources.map(s => <Mono key={s} style={{ fontSize:11.5, border:`1px solid ${C.line}`, borderRadius:2, padding:"3px 8px", color:C.inkDim }}>{s}</Mono>)}
          </div>
          <div style={{ fontSize:12.5, color:C.inkDim, lineHeight:1.7 }}>
            KPI → recomputed from the fields above → per hospital → per reporting date → hospital Google Sheet, September tab.
            The sheet's own calculated column for this KPI is retained and compared; where the two disagree beyond tolerance,
            rule R5 raises an exception rather than either value being silently preferred.
          </div>
        </div>
      </Panel>
    </>
  );
}
