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
  asOfDate: "2026-09-18",

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
    { id: "GRV", name: "Grovers",        sheetId: "1W27hMPKY-P50aYTU8v7dsQQa3wf-PNOzT0sLUYd6yzc" },
    { id: "MTP", name: "Mt. Pisgah",     sheetId: "1PatPT5uhvmfcTM-e53RVXaYfBQyomIxmLKzV7g3ZWq4" },
  ],

  // Only N/A the specification explicitly authorises (spec §9, prompt §5).
  declaredNotApplicable: {
    NLB: {
      fields: ["priv", "privRev"],
      reason: "Product Specification §9 — Neolife payer mix is HMO-based; private fields are genuinely N/A.",
    },
  },

  // CEO-approved revenue thresholds, effective 2026-09-21. Hardcoded here (not entered via
  // the Rules & Thresholds screen) so they persist across sessions instead of living only in
  // session state.
  thresholds: [
    { id:"T1", kpi:"revenue", hospital:"ULT", target:200000000, amber:180000000, red:150000000, critical:100000000, direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
    { id:"T2", kpi:"revenue", hospital:"FHM", target:10000000,  amber:9000000,   red:7500000,   critical:5000000,   direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
    { id:"T3", kpi:"revenue", hospital:"ROD", target:20000000,  amber:18000000,  red:15000000,  critical:10000000,  direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
    { id:"T4", kpi:"revenue", hospital:"TAL", target:40000000,  amber:36000000,  red:30000000,  critical:20000000,  direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
    { id:"T5", kpi:"revenue", hospital:"HOS", target:45000000,  amber:40500000,  red:33750000,  critical:22500000,  direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
    { id:"T6", kpi:"revenue", hospital:"NLB", target:150000000, amber:135000000, red:112500000, critical:75000000,  direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
    { id:"T7", kpi:"revenue", hospital:"GRV", target:300000000, amber:270000000, red:225000000, critical:150000000, direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
    { id:"T8", kpi:"revenue", hospital:"MTP", target:40000000,  amber:36000000,  red:30000000,  critical:20000000,  direction:"LOWER_IS_WORSE", effective:"2026-09-21", owner:"CEO" },
  ],

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
  readAt: "2026-09-18T22:30:00+01:00",
  note: "Read directly from the nine live hospital sheets via the connected Drive account. Values are a point-in-time snapshot, not a live feed.",
};

// Raw rows exactly as submitted: all 44 standardised columns on every row. `null` = blank cell
// (not reported - never coerced to 0). Strings preserved where the sheet stores text
// (so unit inconsistencies stay visible instead of being silently cast).
const RAW = {
  ULT: [
    { d:"2026-09-01", att:85, nreg:7, priv:8, hmo:58, lash:null, nhia:null, comp:19, adm:13, rConv:0.1529, onadm:21, disch:4, yld:null, rPctY:null, tat:null, det:null, prom:88, indiff:null, rNPS:null, privRev:731000, hmoRev:1033840, nhiaRev:null, compRev:null, rTotRev:1764840, rARPE:20762.82, rMTD:1764840, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"0.88%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-02", att:63, nreg:3, priv:8, hmo:48, lash:null, nhia:null, comp:7, adm:4, rConv:0.0635, onadm:22, disch:4, yld:null, rPctY:null, tat:null, det:null, prom:68, indiff:null, rNPS:null, privRev:723300, hmoRev:920010, nhiaRev:null, compRev:null, rTotRev:1643310, rARPE:26084.29, rMTD:3408150, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"1.70%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-03", att:89, nreg:5, priv:6, hmo:70, lash:null, nhia:null, comp:13, adm:7, rConv:0.0787, onadm:16, disch:12, yld:null, rPctY:null, tat:null, det:null, prom:88, indiff:null, rNPS:null, privRev:619546, hmoRev:1157849, nhiaRev:null, compRev:null, rTotRev:1777395, rARPE:19970.73, rMTD:5185545, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"2.59%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-04", att:61, nreg:4, priv:8, hmo:46, lash:null, nhia:null, comp:7, adm:12, rConv:0.1967, onadm:18, disch:10, yld:null, rPctY:null, tat:null, det:null, prom:70, indiff:null, rNPS:null, privRev:4559000, hmoRev:1050085, nhiaRev:null, compRev:null, rTotRev:5609085, rARPE:91952.21, rMTD:10794630, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"5.40%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-05", att:33, nreg:4, priv:5, hmo:27, lash:null, nhia:null, comp:1, adm:5, rConv:0.1515, onadm:17, disch:7, yld:null, rPctY:null, tat:null, det:null, prom:65, indiff:null, rNPS:null, privRev:519872, hmoRev:682090, nhiaRev:null, compRev:null, rTotRev:1201962, rARPE:36423.09, rMTD:11996592, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"6.00%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-06", att:35, nreg:5, priv:4, hmo:31, lash:null, nhia:null, comp:0, adm:5, rConv:0.1429, onadm:15, disch:6, yld:null, rPctY:null, tat:null, det:null, prom:30, indiff:null, rNPS:null, privRev:241000, hmoRev:881538.25, nhiaRev:null, compRev:null, rTotRev:1122538.25, rARPE:32072.52, rMTD:13119130.25, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"6.56%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-07", att:58, nreg:8, priv:10, hmo:43, lash:null, nhia:null, comp:5, adm:6, rConv:0.1034, onadm:16, disch:6, yld:null, rPctY:null, tat:null, det:null, prom:50, indiff:null, rNPS:null, privRev:820818, hmoRev:1553951, nhiaRev:null, compRev:null, rTotRev:2374769, rARPE:40944.29, rMTD:15493899.25, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"7.75%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-08", att:64, nreg:8, priv:7, hmo:46, lash:null, nhia:null, comp:11, adm:10, rConv:0.1563, onadm:21, disch:5, yld:null, rPctY:null, tat:null, det:null, prom:50, indiff:null, rNPS:null, privRev:467000, hmoRev:2098539.98, nhiaRev:null, compRev:null, rTotRev:2565539.98, rARPE:40086.56, rMTD:18059439.23, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"9.03%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-09", att:49, nreg:4, priv:6, hmo:37, lash:null, nhia:null, comp:6, adm:4, rConv:0.0816, onadm:15, disch:6, yld:null, rPctY:null, tat:null, det:null, prom:50, indiff:null, rNPS:null, privRev:784518, hmoRev:296881, nhiaRev:null, compRev:null, rTotRev:1081399, rARPE:22069.37, rMTD:19140838.23, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"9.57%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-10", att:65, nreg:2, priv:9, hmo:50, lash:null, nhia:null, comp:6, adm:6, rConv:0.0923, onadm:17, disch:4, yld:null, rPctY:null, tat:null, det:null, prom:60, indiff:null, rNPS:null, privRev:927978, hmoRev:3100111, nhiaRev:null, compRev:null, rTotRev:4028089, rARPE:61970.6, rMTD:23168927.23, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"11.58%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-11", att:59, nreg:7, priv:5, hmo:41, lash:null, nhia:null, comp:13, adm:4, rConv:0.0678, onadm:13, disch:7, yld:null, rPctY:null, tat:null, det:null, prom:62, indiff:null, rNPS:null, privRev:1075000, hmoRev:523670, nhiaRev:null, compRev:null, rTotRev:1598670, rARPE:27096.1, rMTD:24767597.23, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"12.38%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-12", att:57, nreg:8, priv:5, hmo:44, lash:null, nhia:null, comp:8, adm:6, rConv:0.1053, onadm:14, disch:6, yld:null, rPctY:null, tat:null, det:null, prom:54, indiff:null, rNPS:null, privRev:819000, hmoRev:572149.77, nhiaRev:null, compRev:null, rTotRev:1391149.77, rARPE:24406.14, rMTD:26158747, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"13.08%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-13", att:46, nreg:4, priv:2, hmo:43, lash:null, nhia:null, comp:1, adm:1, rConv:0.0217, onadm:8, disch:7, yld:null, rPctY:null, tat:null, det:null, prom:42, indiff:null, rNPS:null, privRev:156327, hmoRev:1142521, nhiaRev:null, compRev:null, rTotRev:1298848, rARPE:28235.83, rMTD:27457595, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"13.73%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-14", att:76, nreg:15, priv:8, hmo:55, lash:null, nhia:null, comp:13, adm:15, rConv:0.1974, onadm:21, disch:3, yld:null, rPctY:null, tat:null, det:null, prom:82, indiff:null, rNPS:null, privRev:665000, hmoRev:976350, nhiaRev:null, compRev:null, rTotRev:1641350, rARPE:21596.71, rMTD:29098945, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"14.55%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-15", att:84, nreg:5, priv:13, hmo:65, lash:null, nhia:null, comp:6, adm:11, rConv:0.131, onadm:22, disch:8, yld:null, rPctY:null, tat:null, det:null, prom:60, indiff:null, rNPS:null, privRev:1186750, hmoRev:991271, nhiaRev:null, compRev:null, rTotRev:2178021, rARPE:25928.82, rMTD:31276966, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"15.64%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-16", att:66, nreg:8, priv:4, hmo:58, lash:null, nhia:null, comp:4, adm:8, rConv:0.1212, onadm:21, disch:8, yld:null, rPctY:null, tat:null, det:null, prom:59, indiff:null, rNPS:null, privRev:184000, hmoRev:1047894, nhiaRev:null, compRev:null, rTotRev:1231894, rARPE:18665.06, rMTD:32508860, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"16.25%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-17", att:88, nreg:7, priv:7, hmo:69, lash:null, nhia:null, comp:12, adm:12, rConv:null, onadm:27, disch:6, yld:null, rPctY:null, tat:null, det:null, prom:67, indiff:null, rNPS:null, privRev:409000, hmoRev:5225744, nhiaRev:null, compRev:null, rTotRev:5634744, rARPE:64031.18, rMTD:38143604, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"19.07%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-18", att:79, nreg:9, priv:7, hmo:69, lash:null, nhia:null, comp:3, adm:9, rConv:0.1139, onadm:21, disch:13, yld:null, rPctY:null, tat:null, det:null, prom:67, indiff:null, rNPS:null, privRev:963360, hmoRev:1536550, nhiaRev:null, compRev:null, rTotRev:2499910, rARPE:31644.43, rMTD:40643514, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"20.32%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-19", att:60, nreg:10, priv:7, hmo:51, lash:null, nhia:null, comp:2, adm:8, rConv:0.1333, onadm:21, disch:8, yld:null, rPctY:null, tat:null, det:null, prom:61, indiff:null, rNPS:null, privRev:705413, hmoRev:2051057, nhiaRev:null, compRev:null, rTotRev:2756470, rARPE:45941.17, rMTD:43399984, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"21.70%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-20", att:51, nreg:3, priv:2, hmo:42, lash:null, nhia:null, comp:7, adm:7, rConv:0.1373, onadm:18, disch:9, yld:null, rPctY:null, tat:null, det:null, prom:55, indiff:null, rNPS:null, privRev:166000, hmoRev:1680191, nhiaRev:null, compRev:null, rTotRev:1846191, rARPE:36199.82, rMTD:45246175, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"22.62%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-21", att:75, nreg:12, priv:8, hmo:61, lash:null, nhia:null, comp:6, adm:7, rConv:0.0933, onadm:18, disch:9, yld:null, rPctY:null, tat:null, det:null, prom:79, indiff:null, rNPS:null, privRev:860157, hmoRev:1095884, nhiaRev:null, compRev:null, rTotRev:1956041, rARPE:26080.55, rMTD:47202216, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"23.60%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-22", att:67, nreg:4, priv:4, hmo:54, lash:null, nhia:null, comp:9, adm:10, rConv:0.1493, onadm:19, disch:8, yld:null, rPctY:null, tat:null, det:null, prom:62, indiff:null, rNPS:null, privRev:558260, hmoRev:1633949, nhiaRev:null, compRev:null, rTotRev:2192209, rARPE:32719.54, rMTD:49394425, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"24.70%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
  ],
  FHM: [
    { d:"2026-09-01", att:2, nreg:0, priv:2, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:0, yld:2, rPctY:1, tat:15, det:0, prom:1, indiff:1, rNPS:0.5, privRev:769000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:769000, rARPE:384500, rMTD:769000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"7.69%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-02", att:2, nreg:0, priv:2, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:0, yld:2, rPctY:1, tat:11.5, det:0, prom:2, indiff:0, rNPS:1, privRev:235000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:235000, rARPE:117500, rMTD:1004000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"10.04%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-03", att:1, nreg:0, priv:1, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:0, yld:1, rPctY:1, tat:60, det:0, prom:1, indiff:0, rNPS:1, privRev:150000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:150000, rARPE:150000, rMTD:1154000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"11.54%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-04", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:null, onadm:3, disch:0, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:null, rNPS:null, privRev:0, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:0, rARPE:null, rMTD:1154000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"11.54%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-05", att:1, nreg:1, priv:1, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:0, yld:1, rPctY:1, tat:97, det:0, prom:1, indiff:0, rNPS:1, privRev:0, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:0, rARPE:0, rMTD:1154000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"11.54%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-06", att:7, nreg:1, priv:6, hmo:1, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:0, yld:7, rPctY:1, tat:132, det:0, prom:7, indiff:0, rNPS:1, privRev:680000, hmoRev:31312.5, nhiaRev:null, compRev:null, rTotRev:711312.5, rARPE:101616.07, rMTD:1865312.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"18.65%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-07", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:null, onadm:3, disch:0, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:null, rNPS:null, privRev:0, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:0, rARPE:null, rMTD:1865312.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"18.65%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-08", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:null, rConv:null, onadm:2, disch:1, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:null, rNPS:null, privRev:50000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:50000, rARPE:null, rMTD:1915312.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"19.15%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-09", att:6, nreg:3, priv:3, hmo:3, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:2, disch:0, yld:6, rPctY:1, tat:80, det:0, prom:5, indiff:0, rNPS:1, privRev:120000, hmoRev:148800, nhiaRev:null, compRev:null, rTotRev:268800, rARPE:44800, rMTD:2184112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"21.84%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-10", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:null, onadm:2, disch:0, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:null, rNPS:null, privRev:0, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:0, rARPE:null, rMTD:2184112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"21.84%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-11", att:2, nreg:1, priv:1, hmo:1, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:2, disch:0, yld:2, rPctY:1, tat:117.5, det:0, prom:2, indiff:0, rNPS:1, privRev:500000, hmoRev:65000, nhiaRev:null, compRev:null, rTotRev:565000, rARPE:282500, rMTD:2749112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"27.49%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-12", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:null, onadm:2, disch:0, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:null, rNPS:null, privRev:0, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:0, rARPE:null, rMTD:2749112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"27.49%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-13", att:4, nreg:0, priv:4, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:2, disch:0, yld:4, rPctY:1, tat:63.5, det:0, prom:4, indiff:0, rNPS:1, privRev:80000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:80000, rARPE:20000, rMTD:2829112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"28.29%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-14", att:3, nreg:1, priv:2, hmo:1, lash:null, nhia:null, comp:null, adm:1, rConv:0.3333, onadm:3, disch:0, yld:2, rPctY:0.6667, tat:63.3, det:0, prom:2, indiff:0, rNPS:1, privRev:370000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:370000, rARPE:123333.33, rMTD:3199112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"31.99%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-15", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:null, onadm:3, disch:0, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:null, rNPS:null, privRev:100000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:100000, rARPE:null, rMTD:3299112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"32.99%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-16", att:4, nreg:1, priv:3, hmo:1, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:0, yld:4, rPctY:1, tat:17, det:0, prom:4, indiff:0, rNPS:1, privRev:80000, hmoRev:30000, nhiaRev:null, compRev:null, rTotRev:110000, rARPE:27500, rMTD:3409112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"34.09%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-17", att:1, nreg:0, priv:1, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:0, yld:1, rPctY:1, tat:3, det:0, prom:1, indiff:0, rNPS:1, privRev:50000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:50000, rARPE:50000, rMTD:3459112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"34.59%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-18", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:null, onadm:3, disch:0, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:0, rNPS:null, privRev:0, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:0, rARPE:null, rMTD:3459112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"34.59%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-19", att:1, nreg:0, priv:1, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:1, yld:1, rPctY:1, tat:258, det:0, prom:1, indiff:0, rNPS:1, privRev:260000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:260000, rARPE:260000, rMTD:3719112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"37.19%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-20", att:3, nreg:0, priv:3, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:2, disch:0, yld:3, rPctY:1, tat:52, det:0, prom:3, indiff:0, rNPS:1, privRev:136000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:136000, rARPE:45333.33, rMTD:3855112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"38.55%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-21", att:1, nreg:0, priv:1, hmo:0, lash:null, nhia:null, comp:null, adm:1, rConv:1, onadm:3, disch:0, yld:0, rPctY:0, tat:0, det:0, prom:0, indiff:0, rNPS:0, privRev:310000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:310000, rARPE:310000, rMTD:4165112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"41.65%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-22", att:0, nreg:0, priv:0, hmo:0, lash:null, nhia:null, comp:null, adm:0, rConv:null, onadm:3, disch:0, yld:0, rPctY:null, tat:0, det:0, prom:0, indiff:0, rNPS:0, privRev:440000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:440000, rARPE:null, rMTD:4605112.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"46.05%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
  ],
  MFM: [
    { d:"2026-09-01", att:5, nreg:1, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:99500, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:99500, rARPE:19900, rMTD:99500, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"0.22%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-02", att:5, nreg:2, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.2, onadm:1, disch:1, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:255500, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:255500, rARPE:51100, rMTD:355000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"0.79%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-03", att:5, nreg:0, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.2, onadm:1, disch:1, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:150000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:150000, rARPE:30000, rMTD:505000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"1.12%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-04", att:4, nreg:1, priv:4, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:94000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:94000, rARPE:23500, rMTD:599000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"1.33%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-05", att:5, nreg:3, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:112000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:112000, rARPE:22400, rMTD:711000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"1.58%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-06", att:1, nreg:0, priv:1, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:34000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:34000, rARPE:34000, rMTD:745000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"1.66%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-07", att:9, nreg:7, priv:9, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.1111, onadm:1, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:308000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:308000, rARPE:34222.22, rMTD:1053000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"2.34%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-08", att:17, nreg:2, priv:17, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:1, disch:1, yld:null, rPctY:null, tat:null, det:0, prom:2, indiff:0, rNPS:1, privRev:327000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:327000, rARPE:19235.29, rMTD:1380000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"3.07%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-09", att:5, nreg:1, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.2, onadm:1, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:84000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:84000, rARPE:16800, rMTD:1464000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"3.25%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-10", att:3, nreg:0, priv:3, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:1, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:21000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:21000, rARPE:7000, rMTD:1485000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"3.30%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-11", att:5, nreg:3, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.2, onadm:1, disch:1, yld:null, rPctY:null, tat:null, det:0, prom:1, indiff:0, rNPS:1, privRev:273000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:273000, rARPE:54600, rMTD:1758000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"3.91%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-12", att:6, nreg:2, priv:6, hmo:null, lash:null, nhia:null, comp:null, adm:2, rConv:0.3333, onadm:2, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:249000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:249000, rARPE:41500, rMTD:2007000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"4.46%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-13", att:3, nreg:3, priv:3, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.3333, onadm:3, disch:2, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:226000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:226000, rARPE:75333.33, rMTD:2233000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"4.96%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-14", att:5, nreg:2, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:1, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:81500, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:81500, rARPE:16300, rMTD:2314500, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"5.14%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-15", att:3, nreg:1, priv:3, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:1, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:139000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:139000, rARPE:46333.33, rMTD:2453500, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"5.45%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-16", att:4, nreg:0, priv:4, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.25, onadm:1, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:284000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:284000, rARPE:71000, rMTD:2737500, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"6.08%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-17", att:1, nreg:0, priv:1, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:1, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:56000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:56000, rARPE:56000, rMTD:2793500, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"6.21%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-18", att:2, nreg:1, priv:2, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:1, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:214000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:214000, rARPE:107000, rMTD:3007500, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"6.68%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-19", att:4, nreg:3, priv:4, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:315000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:315000, rARPE:78750, rMTD:3322500, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"7.38%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-20", att:4, nreg:2, priv:4, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.25, onadm:1, disch:0, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:176500, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:176500, rARPE:44125, rMTD:3499000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"7.78%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-21", att:5, nreg:4, priv:5, hmo:null, lash:null, nhia:null, comp:null, adm:1, rConv:0.2, onadm:2, disch:1, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:332000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:332000, rARPE:66400, rMTD:3831000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"8.51%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-22", att:9, nreg:0, priv:9, hmo:null, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:1, yld:null, rPctY:null, tat:null, det:null, prom:null, indiff:null, rNPS:null, privRev:105000, hmoRev:null, nhiaRev:null, compRev:null, rTotRev:105000, rARPE:11666.67, rMTD:3936000, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:"8.75%", refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
  ],
  NLB: [
    { d:"2026-09-01", att:23, nreg:19, priv:null, hmo:23, lash:null, nhia:null, comp:null, adm:15, rConv:0.6522, onadm:69, disch:23, yld:15, rPctY:0.6522, tat:40, det:0, prom:23, indiff:0, rNPS:1, privRev:null, hmoRev:4170405.7, nhiaRev:null, compRev:null, rTotRev:4170405.7, rARPE:181321.99, rMTD:4170405.7, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-02", att:30, nreg:30, priv:null, hmo:30, lash:null, nhia:null, comp:null, adm:26, rConv:0.8667, onadm:77, disch:16, yld:26, rPctY:0.8667, tat:40, det:0, prom:16, indiff:0, rNPS:1, privRev:null, hmoRev:1882251.2, nhiaRev:null, compRev:null, rTotRev:1882251.2, rARPE:62741.71, rMTD:6052656.9, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-03", att:22, nreg:22, priv:null, hmo:22, lash:null, nhia:null, comp:null, adm:16, rConv:0.7273, onadm:81, disch:13, yld:16, rPctY:0.7273, tat:40, det:0, prom:13, indiff:0, rNPS:1, privRev:null, hmoRev:4579794.4, nhiaRev:null, compRev:null, rTotRev:4579794.4, rARPE:208172.47, rMTD:10632451.3, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-04", att:35, nreg:34, priv:null, hmo:35, lash:null, nhia:null, comp:null, adm:20, rConv:0.5714, onadm:81, disch:24, yld:20, rPctY:0.5714, tat:40, det:0, prom:24, indiff:0, rNPS:1, privRev:null, hmoRev:4367035.8, nhiaRev:null, compRev:null, rTotRev:4367035.8, rARPE:124772.45, rMTD:14999487.1, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-05", att:25, nreg:20, priv:null, hmo:25, lash:null, nhia:null, comp:null, adm:18, rConv:0.72, onadm:85, disch:13, yld:18, rPctY:0.72, tat:40, det:0, prom:13, indiff:0, rNPS:1, privRev:null, hmoRev:3158845.5, nhiaRev:null, compRev:null, rTotRev:3158845.5, rARPE:126353.82, rMTD:18158332.6, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-06", att:19, nreg:16, priv:null, hmo:19, lash:null, nhia:null, comp:null, adm:18, rConv:0.9474, onadm:76, disch:22, yld:18, rPctY:0.9474, tat:40, det:0, prom:22, indiff:0, rNPS:1, privRev:null, hmoRev:4651743.4, nhiaRev:null, compRev:null, rTotRev:4651743.4, rARPE:244828.6, rMTD:22810076, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-07", att:23, nreg:21, priv:null, hmo:23, lash:null, nhia:null, comp:null, adm:19, rConv:0.8261, onadm:80, disch:15, yld:19, rPctY:0.8261, tat:40, det:0, prom:15, indiff:0, rNPS:1, privRev:null, hmoRev:5555012.9, nhiaRev:null, compRev:null, rTotRev:5555012.9, rARPE:241522.3, rMTD:28365088.9, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-08", att:22, nreg:22, priv:null, hmo:22, lash:null, nhia:null, comp:null, adm:18, rConv:0.8182, onadm:74, disch:20, yld:18, rPctY:0.8182, tat:40, det:0, prom:20, indiff:0, rNPS:1, privRev:null, hmoRev:4538906.2, nhiaRev:null, compRev:null, rTotRev:4538906.2, rARPE:206313.92, rMTD:32903995.1, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-09", att:27, nreg:27, priv:null, hmo:27, lash:null, nhia:null, comp:null, adm:19, rConv:0.7037, onadm:74, disch:27, yld:19, rPctY:0.7037, tat:40, det:0, prom:27, indiff:0, rNPS:1, privRev:null, hmoRev:3962001.9, nhiaRev:null, compRev:null, rTotRev:3962001.9, rARPE:146740.81, rMTD:36865997, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-10", att:27, nreg:24, priv:null, hmo:27, lash:null, nhia:null, comp:null, adm:23, rConv:0.8519, onadm:84, disch:12, yld:23, rPctY:0.8519, tat:40, det:0, prom:12, indiff:0, rNPS:1, privRev:null, hmoRev:5424356.5, nhiaRev:null, compRev:null, rTotRev:5424356.5, rARPE:200902.09, rMTD:42290353.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-11", att:18, nreg:18, priv:null, hmo:18, lash:null, nhia:null, comp:null, adm:18, rConv:1, onadm:85, disch:15, yld:18, rPctY:1, tat:40, det:0, prom:15, indiff:0, rNPS:1, privRev:null, hmoRev:3547786.4, nhiaRev:null, compRev:null, rTotRev:3547786.4, rARPE:197099.24, rMTD:45838139.9, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-12", att:20, nreg:20, priv:null, hmo:20, lash:null, nhia:null, comp:null, adm:11, rConv:0.55, onadm:84, disch:16, yld:11, rPctY:0.55, tat:40, det:0, prom:16, indiff:0, rNPS:1, privRev:null, hmoRev:2618423, nhiaRev:null, compRev:null, rTotRev:2618423, rARPE:130921.15, rMTD:48456562.9, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-13", att:26, nreg:26, priv:null, hmo:26, lash:null, nhia:null, comp:null, adm:25, rConv:0.9615, onadm:83, disch:25, yld:25, rPctY:0.9615, tat:40, det:0, prom:25, indiff:0, rNPS:1, privRev:null, hmoRev:7733259.5, nhiaRev:null, compRev:null, rTotRev:7733259.5, rARPE:297433.06, rMTD:56189822.4, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-14", att:19, nreg:19, priv:null, hmo:19, lash:null, nhia:null, comp:null, adm:9, rConv:0.4737, onadm:83, disch:10, yld:9, rPctY:0.4737, tat:40, det:0, prom:10, indiff:0, rNPS:1, privRev:null, hmoRev:5280626.5, nhiaRev:null, compRev:null, rTotRev:5280626.5, rARPE:277927.71, rMTD:61470448.9, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-15", att:33, nreg:34, priv:null, hmo:33, lash:null, nhia:null, comp:null, adm:19, rConv:0.5758, onadm:75, disch:7, yld:19, rPctY:0.5758, tat:40, det:0, prom:7, indiff:0, rNPS:1, privRev:null, hmoRev:5328796.6, nhiaRev:null, compRev:null, rTotRev:5328796.6, rARPE:161478.68, rMTD:66799245.5, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-16", att:34, nreg:32, priv:null, hmo:34, lash:null, nhia:null, comp:null, adm:31, rConv:0.9118, onadm:83, disch:21, yld:31, rPctY:0.9118, tat:40, det:0, prom:21, indiff:0, rNPS:1, privRev:null, hmoRev:4650032.4, nhiaRev:null, compRev:null, rTotRev:4650032.4, rARPE:136765.66, rMTD:71449277.9, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-17", att:21, nreg:21, priv:null, hmo:21, lash:null, nhia:null, comp:null, adm:15, rConv:0.7143, onadm:84, disch:16, yld:15, rPctY:0.7143, tat:40, det:0, prom:16, indiff:0, rNPS:1, privRev:null, hmoRev:5429831.7, nhiaRev:null, compRev:null, rTotRev:5429831.7, rARPE:258563.41, rMTD:76879109.6, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-18", att:32, nreg:32, priv:null, hmo:32, lash:null, nhia:null, comp:null, adm:20, rConv:0.625, onadm:86, disch:20, yld:20, rPctY:0.625, tat:40, det:0, prom:20, indiff:0, rNPS:1, privRev:null, hmoRev:3551890.2, nhiaRev:null, compRev:null, rTotRev:3551890.2, rARPE:110996.57, rMTD:80430999.8, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-19", att:23, nreg:21, priv:null, hmo:23, lash:null, nhia:null, comp:null, adm:18, rConv:0.7826, onadm:78, disch:25, yld:18, rPctY:0.7826, tat:40, det:0, prom:25, indiff:0, rNPS:1, privRev:null, hmoRev:5048800.9, nhiaRev:null, compRev:null, rTotRev:5048800.9, rARPE:219513.08, rMTD:85479800.7, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-20", att:19, nreg:19, priv:null, hmo:19, lash:null, nhia:null, comp:null, adm:14, rConv:0.7368, onadm:79, disch:14, yld:14, rPctY:0.7368, tat:40, det:0, prom:14, indiff:0, rNPS:1, privRev:null, hmoRev:4609607.6, nhiaRev:null, compRev:null, rTotRev:4609607.6, rARPE:242610.93, rMTD:90089408.3, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-21", att:30, nreg:29, priv:null, hmo:30, lash:null, nhia:null, comp:null, adm:20, rConv:0.6667, onadm:81, disch:15, yld:20, rPctY:0.6667, tat:40, det:0, prom:15, indiff:0, rNPS:1, privRev:null, hmoRev:7529056.9, nhiaRev:null, compRev:null, rTotRev:7529056.9, rARPE:250968.56, rMTD:97618465.2, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
    { d:"2026-09-22", att:25, nreg:25, priv:null, hmo:25, lash:null, nhia:null, comp:null, adm:21, rConv:0.84, onadm:80, disch:25, yld:21, rPctY:0.84, tat:40, det:0, prom:25, indiff:0, rNPS:1, privRev:null, hmoRev:5245979.1, nhiaRev:null, compRev:null, rTotRev:5245979.1, rARPE:209839.16, rMTD:102864444.3, ops:{mort:null, ipc:null, medErr:null, esc:null, wait:null, coll:null, revAch:null, refund:null, bed:null, crit:null, pwr:null, amb:null, staff:null, vac:null, wfs:null, emr:null, out:null, rep:null} },
  ],
  ROD: [
    { d:"2026-09-01", att:8, nreg:0, priv:0, hmo:8, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:2, yld:8, rPctY:1, tat:25, det:0, prom:7, indiff:0, rNPS:1, privRev:0, hmoRev:369687.24, nhiaRev:null, compRev:null, rTotRev:369687.24, rARPE:46210.91, rMTD:369687.24, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"0.82%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-02", att:7, nreg:1, priv:0, hmo:7, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:6, rPctY:0.8571, tat:25, det:0, prom:6, indiff:0, rNPS:1, privRev:5000, hmoRev:147709.17, nhiaRev:null, compRev:null, rTotRev:152709.17, rARPE:21815.6, rMTD:522396.41, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"1.16%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-03", att:11, nreg:2, priv:1, hmo:10, lash:null, nhia:null, comp:null, adm:2, rConv:0.1818, onadm:2, disch:0, yld:8, rPctY:0.7273, tat:25, det:0, prom:8, indiff:0, rNPS:1, privRev:5000, hmoRev:177792.1, nhiaRev:null, compRev:null, rTotRev:182792.1, rARPE:16617.46, rMTD:705188.51, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"1.57%", refund:"0", bed:"2", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-04", att:10, nreg:3, priv:1, hmo:9, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:2, yld:9, rPctY:0.9, tat:25, det:0, prom:9, indiff:0, rNPS:1, privRev:50500, hmoRev:340768.46, nhiaRev:null, compRev:null, rTotRev:391268.46, rARPE:39126.85, rMTD:1096456.97, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"2.44%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-05", att:5, nreg:0, priv:1, hmo:4, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:5, rPctY:1, tat:25, det:0, prom:4, indiff:0, rNPS:1, privRev:22000, hmoRev:89760.3, nhiaRev:null, compRev:null, rTotRev:111760.3, rARPE:22352.06, rMTD:1208217.27, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"2.68%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-06", att:4, nreg:0, priv:0, hmo:4, lash:null, nhia:null, comp:null, adm:3, rConv:0.75, onadm:3, disch:0, yld:1, rPctY:0.25, tat:25, det:0, prom:1, indiff:0, rNPS:1, privRev:0, hmoRev:120000, nhiaRev:null, compRev:null, rTotRev:120000, rARPE:30000, rMTD:1328217.27, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"2.95%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-07", att:10, nreg:3, priv:1, hmo:9, lash:null, nhia:null, comp:null, adm:4, rConv:0.4, onadm:4, disch:3, yld:10, rPctY:1, tat:25, det:0, prom:10, indiff:0, rNPS:1, privRev:200000, hmoRev:347194.24, nhiaRev:null, compRev:null, rTotRev:547194.24, rARPE:54719.42, rMTD:1875411.51, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"4.17%", refund:"0", bed:"4", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"1", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-08", att:11, nreg:3, priv:1, hmo:10, lash:null, nhia:null, comp:null, adm:5, rConv:0.4545, onadm:5, disch:4, yld:9, rPctY:0.8182, tat:25, det:0, prom:9, indiff:0, rNPS:1, privRev:70000, hmoRev:526083.74, nhiaRev:null, compRev:null, rTotRev:596083.74, rARPE:54189.43, rMTD:2471495.25, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"5.49%", refund:"0", bed:"5", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"1", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-09", att:9, nreg:3, priv:1, hmo:8, lash:null, nhia:null, comp:null, adm:3, rConv:0.3333, onadm:3, disch:5, yld:9, rPctY:1, tat:25, det:0, prom:9, indiff:0, rNPS:1, privRev:55360, hmoRev:486761.37, nhiaRev:null, compRev:null, rTotRev:542121.37, rARPE:60235.71, rMTD:3013616.62, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"6.70%", refund:"0", bed:"3", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"1", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-10", att:10, nreg:2, priv:2, hmo:8, lash:null, nhia:null, comp:null, adm:1, rConv:0.1, onadm:1, disch:2, yld:10, rPctY:1, tat:25, det:0, prom:10, indiff:0, rNPS:1, privRev:51250, hmoRev:178985.65, nhiaRev:null, compRev:null, rTotRev:230235.65, rARPE:23023.57, rMTD:3243852.27, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"7.21%", refund:"0", bed:"1", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"1", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-11", att:9, nreg:1, priv:1, hmo:8, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:1, yld:9, rPctY:1, tat:25, det:0, prom:9, indiff:0, rNPS:1, privRev:63190, hmoRev:468632.29, nhiaRev:null, compRev:null, rTotRev:531822.29, rARPE:59091.37, rMTD:3775674.56, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"8.39%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"1", vac:"1", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-12", att:2, nreg:0, priv:1, hmo:1, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:2, rPctY:1, tat:20, det:0, prom:2, indiff:0, rNPS:1, privRev:31163, hmoRev:27258, nhiaRev:null, compRev:null, rTotRev:58421, rARPE:29210.5, rMTD:3834095.56, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"20", coll:"0", revAch:"8.52%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-13", att:3, nreg:0, priv:0, hmo:3, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:3, rPctY:1, tat:20, det:0, prom:2, indiff:0, rNPS:1, privRev:0, hmoRev:79725, nhiaRev:null, compRev:null, rTotRev:79725, rARPE:26575, rMTD:3913820.56, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"20", coll:"0", revAch:"8.70%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-14", att:4, nreg:1, priv:0, hmo:4, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:0, disch:0, yld:4, rPctY:1, tat:20, det:0, prom:4, indiff:0, rNPS:1, privRev:0, hmoRev:59438.51, nhiaRev:null, compRev:null, rTotRev:59438.51, rARPE:14859.63, rMTD:3973259.07, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"20", coll:"0", revAch:"8.83%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-15", att:5, nreg:2, priv:0, hmo:5, lash:null, nhia:null, comp:null, adm:3, rConv:0.6, onadm:3, disch:0, yld:5, rPctY:1, tat:20, det:0, prom:4, indiff:0, rNPS:1, privRev:0, hmoRev:208362.1, nhiaRev:null, compRev:null, rTotRev:208362.1, rARPE:41672.42, rMTD:4181621.17, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"20", coll:"0", revAch:"9.29%", refund:"0", bed:"3", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-16", att:14, nreg:5, priv:1, hmo:13, lash:null, nhia:null, comp:null, adm:8, rConv:0.5714, onadm:8, disch:2, yld:9, rPctY:1, tat:25, det:0, prom:5, indiff:0, rNPS:1, privRev:120000, hmoRev:402340.93, nhiaRev:null, compRev:null, rTotRev:522340.93, rARPE:37310.07, rMTD:4703962.1, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"10.45%", refund:"0", bed:"8", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-17", att:10, nreg:2, priv:2, hmo:8, lash:null, nhia:null, comp:null, adm:1, rConv:0.1, onadm:6, disch:3, yld:10, rPctY:1, tat:25, det:0, prom:10, indiff:0, rNPS:1, privRev:50000, hmoRev:311108.47, nhiaRev:null, compRev:null, rTotRev:361108.47, rARPE:36110.85, rMTD:5065070.57, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"11.26%", refund:"0", bed:"6", crit:"0", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-18", att:5, nreg:0, priv:2, hmo:3, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:1, disch:6, yld:5, rPctY:1, tat:25, det:0, prom:5, indiff:0, rNPS:1, privRev:145360, hmoRev:604034.48, nhiaRev:null, compRev:null, rTotRev:749394.48, rARPE:149878.9, rMTD:5814465.05, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"20", coll:"0", revAch:"12.92%", refund:"0", bed:"1", crit:"6", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-19", att:3, nreg:0, priv:0, hmo:3, lash:null, nhia:null, comp:null, adm:1, rConv:0.3333, onadm:1, disch:1, yld:3, rPctY:1, tat:20, det:0, prom:3, indiff:0, rNPS:1, privRev:0, hmoRev:43191.08, nhiaRev:null, compRev:null, rTotRev:43191.08, rARPE:14397.03, rMTD:5857656.13, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"20", coll:"0", revAch:"13.02%", refund:"0", bed:"2", crit:"6", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-20", att:4, nreg:1, priv:0, hmo:4, lash:null, nhia:null, comp:null, adm:1, rConv:0.25, onadm:2, disch:0, yld:4, rPctY:1, tat:20, det:0, prom:4, indiff:0, rNPS:1, privRev:0, hmoRev:32819.36, nhiaRev:null, compRev:null, rTotRev:32819.36, rARPE:8204.84, rMTD:5890475.49, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"20", coll:"0", revAch:"13.09%", refund:"0", bed:"2", crit:"6", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
    { d:"2026-09-21", att:10, nreg:1, priv:1, hmo:9, lash:null, nhia:null, comp:null, adm:3, rConv:0.3, onadm:2, disch:3, yld:9, rPctY:0.9, tat:20, det:0, prom:9, indiff:0, rNPS:1, privRev:5000, hmoRev:357851.99, nhiaRev:null, compRev:null, rTotRev:362851.99, rARPE:36285.2, rMTD:6253327.48, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"0", revAch:"13.90%", refund:"0", bed:"2", crit:"6", pwr:"0", amb:"0", staff:"0", vac:"0", wfs:"95", emr:"90", out:"0", rep:"95"} },
  ],
  TAL: [
    { d:"2026-09-01", att:19, nreg:0, priv:5, hmo:12, lash:0, nhia:2, comp:0, adm:1, rConv:0.0526, onadm:2, disch:1, yld:1, rPctY:0.0526, tat:50, det:0, prom:1, indiff:0, rNPS:1, privRev:187850, hmoRev:278956.26, nhiaRev:3350, compRev:0, rTotRev:470156.26, rARPE:24745.07, rMTD:470156.26, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"191200", revAch:"1.18%", refund:"0", bed:"2", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"2", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-02", att:19, nreg:2, priv:4, hmo:13, lash:0, nhia:2, comp:0, adm:2, rConv:0.1053, onadm:4, disch:2, yld:1, rPctY:0.0526, tat:50, det:0, prom:1, indiff:0, rNPS:1, privRev:228500, hmoRev:159335.3, nhiaRev:14100, compRev:0, rTotRev:401935.3, rARPE:21154.49, rMTD:872091.56, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"242600", revAch:"2.18%", refund:"0", bed:"2", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"2", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-03", att:20, nreg:0, priv:7, hmo:9, lash:2, nhia:1, comp:1, adm:1, rConv:0.05, onadm:3, disch:1, yld:1, rPctY:0.05, tat:50, det:1, prom:0, indiff:0, rNPS:-1, privRev:94100, hmoRev:191531.41, nhiaRev:700, compRev:27700, rTotRev:314031.41, rARPE:15701.57, rMTD:1186122.97, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"94800", revAch:"2.97%", refund:"0", bed:"2", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"2", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-04", att:26, nreg:0, priv:3, hmo:18, lash:1, nhia:2, comp:2, adm:1, rConv:0.0385, onadm:2, disch:1, yld:4, rPctY:0.1538, tat:50, det:0, prom:3, indiff:1, rNPS:0.75, privRev:137300, hmoRev:386473.5, nhiaRev:1200, compRev:170800, rTotRev:695773.5, rARPE:26760.52, rMTD:1881896.47, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"138500", revAch:"4.70%", refund:"0", bed:"2", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"2", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-05", att:28, nreg:2, priv:5, hmo:23, lash:0, nhia:0, comp:0, adm:1, rConv:0.0357, onadm:2, disch:0, yld:4, rPctY:0.1429, tat:50, det:0, prom:4, indiff:0, rNPS:1, privRev:157100, hmoRev:377118.62, nhiaRev:500, compRev:0, rTotRev:534718.62, rARPE:19097.09, rMTD:2416615.09, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"157600", revAch:"6.04%", refund:"0", bed:"2", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"2", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-06", att:14, nreg:0, priv:0, hmo:11, lash:2, nhia:1, comp:0, adm:1, rConv:0.0714, onadm:1, disch:1, yld:3, rPctY:0.2143, tat:50, det:0, prom:3, indiff:0, rNPS:1, privRev:131300, hmoRev:179641.74, nhiaRev:0, compRev:0, rTotRev:310941.74, rARPE:22210.12, rMTD:2727556.83, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"131300", revAch:"6.82%", refund:"0", bed:"2", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"2", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-07", att:31, nreg:2, priv:10, hmo:17, lash:3, nhia:0, comp:1, adm:2, rConv:0.0645, onadm:1, disch:2, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:260000, hmoRev:367996.28, nhiaRev:2950, compRev:25700, rTotRev:656646.28, rARPE:21182.14, rMTD:3384203.11, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"262950", revAch:"8.46%", refund:"0", bed:"1", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"2", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-08", att:21, nreg:0, priv:1, hmo:17, lash:0, nhia:3, comp:0, adm:1, rConv:0.0476, onadm:1, disch:1, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:88000, hmoRev:275148.7, nhiaRev:2700, compRev:0, rTotRev:365848.7, rARPE:17421.37, rMTD:3750051.81, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"90700", revAch:"9.38%", refund:"0", bed:"1", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"1", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-09", att:15, nreg:0, priv:1, hmo:11, lash:0, nhia:2, comp:1, adm:0, rConv:0, onadm:0, disch:0, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:58000, hmoRev:178850, nhiaRev:8100, compRev:26300, rTotRev:271250, rARPE:18083.33, rMTD:4021301.81, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"66100", revAch:"10.05%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-10", att:27, nreg:1, priv:2, hmo:14, lash:7, nhia:4, comp:0, adm:2, rConv:0.0741, onadm:1, disch:0, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:86000, hmoRev:220491.31, nhiaRev:10600, compRev:0, rTotRev:317091.31, rARPE:11744.12, rMTD:4338393.12, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"96600", revAch:"10.85%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-11", att:23, nreg:1, priv:4, hmo:15, lash:2, nhia:2, comp:0, adm:1, rConv:0.0435, onadm:1, disch:1, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:88400, hmoRev:147581.5, nhiaRev:4250, compRev:0, rTotRev:240231.5, rARPE:10444.85, rMTD:4578624.62, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"92650", revAch:"11.45%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-12", att:30, nreg:0, priv:1, hmo:27, lash:0, nhia:2, comp:0, adm:0, rConv:0, onadm:2, disch:2, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:15500, hmoRev:375595.69, nhiaRev:0, compRev:0, rTotRev:391095.69, rARPE:13036.52, rMTD:4969720.31, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"15500", revAch:"12.42%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-13", att:21, nreg:4, priv:6, hmo:11, lash:0, nhia:4, comp:0, adm:1, rConv:0.0476, onadm:1, disch:0, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:327700, hmoRev:177974.54, nhiaRev:5900, compRev:0, rTotRev:511574.54, rARPE:24360.69, rMTD:5481294.85, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"333600", revAch:"13.70%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-14", att:21, nreg:1, priv:2, hmo:14, lash:4, nhia:1, comp:0, adm:2, rConv:0.0952, onadm:2, disch:0, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:61500, hmoRev:265579.7, nhiaRev:1700, compRev:0, rTotRev:328779.7, rARPE:15656.18, rMTD:5810074.55, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"63200", revAch:"14.53%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-15", att:21, nreg:0, priv:4, hmo:8, lash:4, nhia:5, comp:0, adm:0, rConv:0, onadm:1, disch:1, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:219000, hmoRev:169334.13, nhiaRev:14400, compRev:0, rTotRev:402734.13, rARPE:19177.82, rMTD:6212808.68, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"233400", revAch:"15.53%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-16", att:19, nreg:0, priv:4, hmo:12, lash:0, nhia:3, comp:0, adm:1, rConv:0.0526, onadm:2, disch:2, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:359500, hmoRev:254177.4, nhiaRev:7800, compRev:0, rTotRev:621477.4, rARPE:32709.34, rMTD:6834286.08, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"367300", revAch:"17.09%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-17", att:20, nreg:0, priv:6, hmo:8, lash:1, nhia:5, comp:0, adm:1, rConv:0.05, onadm:2, disch:1, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:164200, hmoRev:221739.2, nhiaRev:3700, compRev:0, rTotRev:389639.2, rARPE:19481.96, rMTD:7223925.28, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"167900", revAch:"18.06%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-18", att:16, nreg:0, priv:3, hmo:10, lash:2, nhia:1, comp:0, adm:1, rConv:0.0625, onadm:2, disch:0, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:489500, hmoRev:213544.1, nhiaRev:0, compRev:0, rTotRev:703044.1, rARPE:43940.26, rMTD:7926969.38, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"489500", revAch:"19.82%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-19", att:22, nreg:0, priv:3, hmo:16, lash:0, nhia:3, comp:0, adm:2, rConv:0.0909, onadm:3, disch:1, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:96000, hmoRev:279558.62, nhiaRev:8250, compRev:0, rTotRev:383808.62, rARPE:17445.85, rMTD:8310778, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"104250", revAch:"20.78%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-20", att:23, nreg:0, priv:3, hmo:15, lash:2, nhia:1, comp:2, adm:0, rConv:0, onadm:3, disch:2, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:33700, hmoRev:302116.84, nhiaRev:2600, compRev:50000, rTotRev:388416.84, rARPE:16887.69, rMTD:8699194.84, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"36300", revAch:"21.75%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-21", att:23, nreg:0, priv:1, hmo:18, lash:2, nhia:2, comp:0, adm:1, rConv:0.0435, onadm:2, disch:1, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:93000, hmoRev:164977.54, nhiaRev:1300, compRev:0, rTotRev:259277.54, rARPE:11272.94, rMTD:8958472.38, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"94300", revAch:"22.40%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
    { d:"2026-09-22", att:25, nreg:1, priv:2, hmo:17, lash:0, nhia:5, comp:1, adm:2, rConv:0.08, onadm:2, disch:1, yld:0, rPctY:0, tat:50, det:0, prom:0, indiff:0, rNPS:"#DIV/0!", privRev:200000, hmoRev:811987.44, nhiaRev:10800, compRev:25000, rTotRev:1047787.44, rARPE:41911.5, rMTD:10006259.82, ops:{mort:"0", ipc:"0", medErr:"0", esc:"0", wait:"50", coll:"210800", revAch:"25.02%", refund:"0", bed:"0", crit:"0", pwr:"0", amb:"100%", staff:"0", vac:"0", wfs:"0", emr:"0", out:"0", rep:"90"} },
  ],
  HOS: [
    { d:"2026-09-01", att:33, nreg:5, priv:9, hmo:24, lash:null, nhia:null, comp:null, adm:3, rConv:0.0909, onadm:9, disch:0, yld:29, rPctY:0.8788, tat:40, det:0, prom:20, indiff:9, rNPS:0.6897, privRev:170250, hmoRev:361851.06, nhiaRev:null, compRev:null, rTotRev:532101.06, rARPE:16124.27, rMTD:532101.06, ops:{mort:"1", ipc:"90%", medErr:"0", esc:"0", wait:"40", coll:"0", revAch:"1.18%", refund:"0", bed:"30.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"10%", out:"0", rep:"0"} },
    { d:"2026-09-02", att:16, nreg:8, priv:7, hmo:9, lash:null, nhia:null, comp:null, adm:5, rConv:0.3125, onadm:8, disch:2, yld:11, rPctY:0.6875, tat:30, det:0, prom:8, indiff:3, rNPS:0.7273, privRev:199900, hmoRev:225847.48, nhiaRev:null, compRev:null, rTotRev:425747.48, rARPE:26609.22, rMTD:957848.54, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"30", coll:"184000", revAch:"2.13%", refund:"0", bed:"27.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"10%", out:"0", rep:"0"} },
    { d:"2026-09-03", att:28, nreg:6, priv:4, hmo:24, lash:null, nhia:null, comp:null, adm:2, rConv:0.0714, onadm:10, disch:0, yld:23, rPctY:0.8214, tat:35, det:0, prom:20, indiff:3, rNPS:0.8696, privRev:93700, hmoRev:314617.06, nhiaRev:null, compRev:null, rTotRev:408317.06, rARPE:14582.75, rMTD:1366165.6, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"35", coll:"46000", revAch:"3.04%", refund:"0", bed:"33.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"10%", out:"0", rep:"0"} },
    { d:"2026-09-04", att:24, nreg:4, priv:3, hmo:21, lash:null, nhia:null, comp:null, adm:0, rConv:0, onadm:3, disch:6, yld:18, rPctY:0.75, tat:25, det:0, prom:13, indiff:5, rNPS:0.7222, privRev:165800, hmoRev:1125478.92, nhiaRev:null, compRev:null, rTotRev:1291278.92, rARPE:53803.29, rMTD:2657444.52, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"25", coll:"592800", revAch:"5.91%", refund:"0", bed:"10.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"70%", out:"0", rep:"0"} },
    { d:"2026-09-05", att:21, nreg:5, priv:3, hmo:18, lash:null, nhia:null, comp:null, adm:5, rConv:0.2381, onadm:5, disch:3, yld:15, rPctY:0.7143, tat:25, det:0, prom:12, indiff:3, rNPS:0.8, privRev:154000, hmoRev:364383.17, nhiaRev:null, compRev:null, rTotRev:518383.17, rARPE:24684.91, rMTD:3175827.69, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"25", coll:"144000", revAch:"7.06%", refund:"0", bed:"17.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"60%", out:"0", rep:"0"} },
    { d:"2026-09-06", att:23, nreg:2, priv:1, hmo:22, lash:null, nhia:null, comp:null, adm:3, rConv:0.1304, onadm:6, disch:2, yld:19, rPctY:0.8261, tat:30, det:0, prom:14, indiff:5, rNPS:0.7368, privRev:212000, hmoRev:271340.27, nhiaRev:null, compRev:null, rTotRev:483340.27, rARPE:21014.79, rMTD:3659167.96, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"30", coll:"43000", revAch:"8.13%", refund:"0", bed:"20.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"50%", out:"0", rep:"0"} },
    { d:"2026-09-07", att:16, nreg:2, priv:4, hmo:12, lash:null, nhia:null, comp:null, adm:2, rConv:0.125, onadm:8, disch:2, yld:11, rPctY:0.6875, tat:30, det:0, prom:9, indiff:2, rNPS:0.8182, privRev:213000, hmoRev:222345.72, nhiaRev:null, compRev:null, rTotRev:435345.72, rARPE:27209.11, rMTD:4094513.68, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"30", coll:"243000", revAch:"9.10%", refund:"0", bed:"27.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"60%", out:"0", rep:"0"} },
    { d:"2026-09-08", att:33, nreg:5, priv:7, hmo:26, lash:null, nhia:null, comp:null, adm:2, rConv:0.0606, onadm:6, disch:2, yld:28, rPctY:0.8485, tat:40, det:0, prom:23, indiff:5, rNPS:0.8214, privRev:466000, hmoRev:214691.81, nhiaRev:null, compRev:null, rTotRev:680691.81, rARPE:20627.02, rMTD:4775205.49, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"40", coll:"484000", revAch:"10.61%", refund:"0", bed:"20.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"70%", out:"0", rep:"0"} },
    { d:"2026-09-09", att:16, nreg:5, priv:5, hmo:11, lash:null, nhia:null, comp:null, adm:4, rConv:0.25, onadm:5, disch:4, yld:12, rPctY:0.75, tat:25, det:0, prom:10, indiff:2, rNPS:0.8333, privRev:118000, hmoRev:404766.39, nhiaRev:null, compRev:null, rTotRev:522766.39, rARPE:32672.9, rMTD:5297971.88, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"25", coll:"256000", revAch:"11.77%", refund:"0", bed:"33.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"75%", out:"0", rep:"0"} },
    { d:"2026-09-10", att:16, nreg:2, priv:4, hmo:12, lash:null, nhia:null, comp:null, adm:2, rConv:0.125, onadm:4, disch:3, yld:14, rPctY:0.875, tat:25, det:0, prom:12, indiff:2, rNPS:0.8571, privRev:184500, hmoRev:289873.37, nhiaRev:null, compRev:null, rTotRev:474373.37, rARPE:29648.34, rMTD:5772345.25, ops:{mort:"0", ipc:"90", medErr:"0", esc:"0", wait:"25", coll:"143500", revAch:"12.83%", refund:"0", bed:"13.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"70%", out:"0", rep:"0"} },
    { d:"2026-09-11", att:13, nreg:3, priv:3, hmo:8, lash:null, nhia:2, comp:null, adm:2, rConv:0.1538, onadm:3, disch:2, yld:9, rPctY:0.6923, tat:25, det:1, prom:8, indiff:0, rNPS:0.7778, privRev:53500, hmoRev:228967.5, nhiaRev:20700, compRev:null, rTotRev:303167.5, rARPE:23320.58, rMTD:6075512.75, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"25", coll:"74200", revAch:"13.50%", refund:"0", bed:"10.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"70%", out:"0", rep:"0"} },
    { d:"2026-09-12", att:13, nreg:5, priv:2, hmo:11, lash:null, nhia:null, comp:null, adm:3, rConv:0.2308, onadm:2, disch:1, yld:10, rPctY:0.7692, tat:30, det:0, prom:7, indiff:3, rNPS:0.7, privRev:68000, hmoRev:165953.93, nhiaRev:null, compRev:null, rTotRev:233953.93, rARPE:17996.46, rMTD:6309466.68, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"30", coll:"68000", revAch:"14.02%", refund:"0", bed:"17%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
    { d:"2026-09-13", att:12, nreg:1, priv:2, hmo:10, lash:null, nhia:null, comp:null, adm:2, rConv:0.1667, onadm:4, disch:5, yld:7, rPctY:0.5833, tat:25, det:0, prom:6, indiff:1, rNPS:0.8571, privRev:93000, hmoRev:333519.69, nhiaRev:null, compRev:null, rTotRev:426519.69, rARPE:35543.31, rMTD:6735986.37, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"25", coll:"93000", revAch:"14.97%", refund:"0", bed:"13.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
    { d:"2026-09-14", att:22, nreg:2, priv:7, hmo:13, lash:null, nhia:2, comp:null, adm:5, rConv:0.2273, onadm:8, disch:0, yld:18, rPctY:0.8182, tat:35, det:0, prom:13, indiff:5, rNPS:0.7222, privRev:114500, hmoRev:78624.77, nhiaRev:3500, compRev:null, rTotRev:196624.77, rARPE:8937.49, rMTD:6932611.14, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"35", coll:"118000", revAch:"15.41%", refund:"0", bed:"27.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
    { d:"2026-09-15", att:38, nreg:5, priv:15, hmo:22, lash:null, nhia:1, comp:null, adm:3, rConv:0.0789, onadm:7, disch:3, yld:32, rPctY:0.8421, tat:40, det:1, prom:27, indiff:4, rNPS:0.8125, privRev:311600, hmoRev:506261.75, nhiaRev:1500, compRev:null, rTotRev:819361.75, rARPE:21562.15, rMTD:7751972.89, ops:{mort:"0", ipc:"905", medErr:"0", esc:"0", wait:"40", coll:"313100", revAch:"17.23%", refund:"0", bed:"23%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"75%", out:"0", rep:"0"} },
    { d:"2026-09-16", att:21, nreg:5, priv:4, hmo:17, lash:null, nhia:0, comp:null, adm:6, rConv:0.2857, onadm:11, disch:3, yld:18, rPctY:0.8571, tat:18, det:0, prom:16, indiff:2, rNPS:0.8889, privRev:202400, hmoRev:284565.24, nhiaRev:0, compRev:null, rTotRev:486965.24, rARPE:23188.82, rMTD:8238938.13, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"30", coll:"168000", revAch:"18.31%", refund:"0", bed:"37%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
    { d:"2026-09-17", att:29, nreg:5, priv:3, hmo:21, lash:null, nhia:5, comp:null, adm:6, rConv:0.2069, onadm:13, disch:3, yld:24, rPctY:0.8276, tat:30, det:0, prom:21, indiff:3, rNPS:0.875, privRev:215100, hmoRev:427928.08, nhiaRev:3000, compRev:null, rTotRev:646028.08, rARPE:22276.83, rMTD:8884966.21, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"30", coll:"236000", revAch:"19.74%", refund:"0", bed:"43.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
    { d:"2026-09-18", att:27, nreg:4, priv:4, hmo:21, lash:null, nhia:2, comp:null, adm:5, rConv:0.1852, onadm:10, disch:8, yld:22, rPctY:0.8148, tat:30, det:0, prom:19, indiff:3, rNPS:0.8636363636, privRev:194200, hmoRev:1095307.32, nhiaRev:3000, compRev:null, rTotRev:1292507.32, rARPE:47870.64, rMTD:10177473.53, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"30", coll:"292000", revAch:"22.62%", refund:"0", bed:"33.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"85%", out:"0", rep:"0"} },
    { d:"2026-09-19", att:20, nreg:2, priv:0, hmo:18, lash:null, nhia:2, comp:null, adm:6, rConv:0.3, onadm:9, disch:7, yld:15, rPctY:0.75, tat:35, det:0, prom:12, indiff:3, rNPS:0.8, privRev:63650, hmoRev:413979.11, nhiaRev:5000, compRev:null, rTotRev:482629.11, rARPE:24131.46, rMTD:10660102.64, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"35", coll:"61000", revAch:"23.69%", refund:"0", bed:"30.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
    { d:"2026-09-20", att:27, nreg:6, priv:7, hmo:20, lash:null, nhia:null, comp:null, adm:10, rConv:0.3704, onadm:13, disch:7, yld:21, rPctY:0.7778, tat:35, det:0, prom:16, indiff:5, rNPS:0.7619047619, privRev:291000, hmoRev:714073.31, nhiaRev:null, compRev:null, rTotRev:1005073.31, rARPE:37224.94, rMTD:11665175.95, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"35", coll:"192000", revAch:"25.92%", refund:"0", bed:"43.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"85%", out:"0", rep:"0"} },
    { d:"2026-09-21", att:33, nreg:1, priv:2, hmo:28, lash:null, nhia:3, comp:null, adm:8, rConv:0.2424, onadm:14, disch:5, yld:28, rPctY:0.8485, tat:40, det:0, prom:20, indiff:8, rNPS:0.7142857143, privRev:146600, hmoRev:393258.64, nhiaRev:8000, compRev:null, rTotRev:547858.64, rARPE:16601.78, rMTD:12213034.59, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"40", coll:"89100", revAch:"27.14%", refund:"0", bed:"46.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
    { d:"2026-09-22", att:48, nreg:3, priv:8, hmo:34, lash:null, nhia:6, comp:null, adm:7, rConv:0.1458, onadm:14, disch:6, yld:41, rPctY:0.8542, tat:40, det:1, prom:35, indiff:5, rNPS:0.8292682927, privRev:119900, hmoRev:693036.37, nhiaRev:58500, compRev:null, rTotRev:871436.37, rARPE:18154.92, rMTD:13084470.96, ops:{mort:"0", ipc:"90%", medErr:"0", esc:"0", wait:"40", coll:"168500", revAch:"29.08%", refund:"0", bed:"46.00%", crit:"0", pwr:"0", amb:"90%", staff:"0", vac:"3", wfs:"90%", emr:"80%", out:"0", rep:"0"} },
  ],
  GRV: [],   // Sep-2026+ tab has no data reported yet; intentionally no rows
  MTP: [],   // Sep-2026+ tab has no data reported yet; intentionally no rows
};

// Reporting periods are never hardcoded: every distinct YYYY-MM prefix found across every
// hospital's submitted dates in RAW becomes a selectable period (spec "no month is assumed").
function getAvailableMonths() {
  const months = new Set();
  Object.values(RAW).forEach(rows => rows.forEach(r => months.add(r.d.slice(0, 7))));
  return [...months].sort();
}

// Derives period.start / period.end from the calendar month, and period.asOfDate from the
// latest date actually present in that month's data (one day past it) — never from the
// system clock, since this is a point-in-time snapshot with no independent "today".
function derivePeriod(periodId) {
  // Dates here are calendar dates, not instants — every construction and read-back must stay
  // in UTC. Parsing "...T00:00:00" (no Z) builds a LOCAL-time Date, and toISOString() always
  // reads back in UTC; in any zone ahead of UTC (e.g. Africa/Lagos, UTC+1) that silently shifts
  // the result back a day. Using Date.UTC()/setUTCDate()/getUTCDate() throughout keeps this
  // timezone-independent, so the browser's local timezone can never change the answer.
  const [y, m] = periodId.split("-").map(Number);
  const start = `${periodId}-01`;
  const end = `${periodId}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  let maxDate = start;
  Object.values(RAW).forEach(rows => rows.forEach(r => { if (r.d.startsWith(periodId) && r.d > maxDate) maxDate = r.d; }));
  const asOfObj = new Date(maxDate + "T00:00:00Z");
  asOfObj.setUTCDate(asOfObj.getUTCDate() + 1);
  const asOfDate = asOfObj.toISOString().slice(0, 10);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { id: periodId, label, start, end, asOfDate };
}

function loadFromSource(periodId) {
  return {
    meta: SOURCE_META,
    hospitals: CONFIG.hospitals.map(h => ({ ...h, rows: (RAW[h.id] || []).filter(r => r.d.startsWith(periodId)) })),
  };
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
  if (raw === undefined || raw === null || raw === "") return { value:null, state:STATE.INCOMPLETE };
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

    // Same treatment for the operational/clinical/workforce/digital-systems columns nested
    // under `ops` — they get the identical N/A / not-observed / blank / value state machine.
    const opsEverSeen = new Set();
    h.rows.forEach(r => { const o = r.ops || {}; OPS_KEYS.forEach(k => { if (o[k] !== null && o[k] !== undefined && o[k] !== "") opsEverSeen.add(k); }); });

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

      const opsF = {};
      OPS_KEYS.forEach(k => {
        const raw = (r.ops || {})[k];
        if (naFields.has(k)) { opsF[k] = cell(raw, { na:true }); return; }
        if (!opsEverSeen.has(k)) { opsF[k] = { value:null, state:STATE.NOT_OBSERVED, note:"No value submitted on any day this period — confirm whether this field applies." }; return; }
        opsF[k] = cell(raw, { na:false });
      });

      const submitted = CORE_FIELDS.some(k => r[k] !== null && r[k] !== undefined);
      const complete = ["att","adm","rTotRev"].every(k => r[k] !== null && r[k] !== undefined);

      return { hospitalId:h.id, date:r.d, f, opsF, ops:r.ops || {}, submitted, complete, _raw:r };
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

function expectedDates(cal, period) {
  // Same UTC-safe requirement as derivePeriod: local-time parsing + toISOString() read-back
  // shifts every date back a day in zones ahead of UTC, which both invents a phantom date
  // before period.start and mis-tags every date in the loop. Stay in UTC end to end.
  const out = [];
  const start = new Date(period.start + "T00:00:00Z");
  const asOf  = new Date(period.asOfDate + "T00:00:00Z");
  for (let t = new Date(start); t <= asOf; t.setUTCDate(t.getUTCDate() + 1)) {
    const iso = t.toISOString().slice(0,10);
    if (iso === period.asOfDate && !cal.countCurrentDayAsDue) continue;
    if (cal.cadence === "WEEKDAYS" && (t.getUTCDay() === 0 || t.getUTCDay() === 6)) continue;
    out.push(iso);
  }
  return out;
}

function computeReporting(hosp, cal, period) {
  const due = expectedDates(cal, period);
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

function generateExceptions(canon, kpis, reporting, period) {
  const asOfDate = period.asOfDate;
  const mk = (o) => ({ id:`EX-${String(++SEQ).padStart(3,"0")}`, status:"OPEN", severity:null, owner:null,
    ownerRole: CONFIG.ownership[o.categoryKey]?.role ?? null, sla:null, escalation:0,
    identified: asOfDate, closedOn:null, evidence:null,
    history:[{ at:asOfDate, what:"Created by rule " + o.rule, by:"Exception engine" }], ...o });
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

const OPS_KEYS = Object.keys(OPS_LABEL);

/* ===========================================================================
   SECTION 6B — FULL SCHEMA REGISTRY  (prompt "literally every one of the 44
   standardised schema columns")
   One entry per raw column — payer attendance, payer revenue and every
   clinical/operational/workforce/digital-systems field — so any screen can
   render the complete schema instead of a curated subset.
   =========================================================================== */

const TOP_LABEL = {
  att:"Total attendance", nreg:"New registrations", priv:"Private attendance", hmo:"HMO attendance",
  lash:"LASHMA attendance", nhia:"NHIA attendance", comp:"Company attendance", adm:"Admissions",
  rConv:"Conversion rate (reported)", onadm:"On-admission census", disch:"Discharges", yld:"Yield",
  rPctY:"Percentage yield (reported)", tat:"Turnaround time (mins)", det:"NPS detractors",
  prom:"NPS promoters", indiff:"NPS indifferent", rNPS:"NPS (reported)",
  privRev:"Private revenue", hmoRev:"HMO revenue", nhiaRev:"NHIA revenue", compRev:"Company revenue",
  rTotRev:"Total revenue (reported)", rARPE:"ARPE (reported)", rMTD:"Revenue MTD (reported)",
};

const FIELD_LABEL = { ...TOP_LABEL, ...OPS_LABEL };

const FIELD_FORMAT = {
  att:"int", nreg:"int", priv:"int", hmo:"int", lash:"int", nhia:"int", comp:"int", adm:"int",
  onadm:"int", disch:"int", yld:"int", det:"int", prom:"int", indiff:"int",
  rConv:"pct", rPctY:"pct", rNPS:"pct", tat:"num",
  privRev:"money", hmoRev:"money", nhiaRev:"money", compRev:"money", rTotRev:"money", rARPE:"money", rMTD:"money",
};

// Exact order of the 44 standardised columns: date, then every payer attendance and revenue
// field, then every clinical/operational/workforce/digital-systems field.
const ALL_FIELD_KEYS = [
  "att","nreg","priv","hmo","lash","nhia","comp","adm","rConv","onadm","disch","yld","rPctY","tat",
  "det","prom","indiff","rNPS","privRev","hmoRev","nhiaRev","compRev","rTotRev","rARPE","rMTD",
  ...OPS_KEYS,
];

const fieldSource = key => OPS_KEYS.includes(key) ? "opsF" : "f";
const fieldCell = (rec, key) => (fieldSource(key) === "opsF" ? rec.opsF : rec.f)[key];

function formatFieldValue(key, value) {
  const kind = FIELD_FORMAT[key] || "raw";
  if (kind === "int") return int(value);
  if (kind === "money") return money(value);
  if (kind === "pct") return pct(value, 1);
  if (kind === "num") return typeof value === "number" ? value.toLocaleString(undefined,{ maximumFractionDigits:2 }) : String(value);
  return value === null || value === undefined ? "—" : String(value);
}

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

// Renders one field's cell exactly the same way everywhere: N/A vs not-reported vs blank
// vs a real value. Used by every daily table in the app, including the operational
// fields that used to be shown as plain, unstated strings.
function StateCell({ cellObj, naReason, format }) {
  if (!cellObj) return <span style={{ color:C.inkFaint }}>—</span>;
  if (cellObj.state === STATE.NA) return <span title={naReason || "Declared not applicable"} style={{ color:C.info, fontSize:11 }}>N/A</span>;
  if (cellObj.state === STATE.NOT_OBSERVED) return <span title={cellObj.note} style={{ color:C.inkFaint, fontSize:11 }}>not obs.</span>;
  if (cellObj.state === STATE.INCOMPLETE) return <span title="Blank in source" style={{ color:C.amber }}>blank</span>;
  if (cellObj.state === STATE.EXCEPTION) return <span title={cellObj.note} style={{ color:C.red, fontSize:11 }}>error</span>;
  return <>{format(cellObj.value)}</>;
}

// Full daily history for a set of schema fields: every hospital, every submitted date in
// the selected period. Used in place of "latest value only" tables and "unavailable"
// placeholders wherever the underlying field actually exists in the schema.
function DailyHistoryTable({ model, fields }) {
  const rows = [];
  model.canon.forEach(h => h.records.forEach(r => { if (r.submitted) rows.push({ h, r }); }));
  return (
    <div style={{ overflowX:"auto" }}>
      <table>
        <thead><tr>
          <th style={th}>Hospital</th><th style={th}>Date</th>
          {fields.map(f => <th key={f} style={{...th,textAlign:"right"}}>{FIELD_LABEL[f] || f}</th>)}
        </tr></thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td style={td} colSpan={2 + fields.length}>No submitted records for this period.</td></tr>
          )}
          {rows.map(({ h, r }) => (
            <tr key={`${h.id}-${r.date}`}>
              <td style={td}><Mono style={{ fontSize:11, color:C.inkFaint }}>{h.id}</Mono> <span style={{ marginLeft:6 }}>{h.name}</span></td>
              <td style={td}><Mono style={{ fontSize:11.5 }}>{r.date}</Mono></td>
              {fields.map(f => (
                <td key={f} style={tdR}>
                  <StateCell cellObj={fieldCell(r, f)} naReason={h.naReason} format={v => formatFieldValue(f, v)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- app root */

export default function ControlTower() {
  const availableMonths = useMemo(() => getAvailableMonths(), []);
  const [module, setModule] = useState("overview");
  const [cal, setCal] = useState(CONFIG.reportingCalendar);
  const [thresholds, setThresholds] = useState(CONFIG.thresholds);
  const [selHospital, setSelHospital] = useState("ULT");
  const [selectedPeriod, setSelectedPeriod] = useState(() => availableMonths[availableMonths.length - 1]);
  const [exState, setExState] = useState({});           // id -> {status, owner, severity, sla, evidence, history}
  const [exFilter, setExFilter] = useState("ALL");

  // Switching the reporting period must leave nothing behind from the previous one: the
  // exception register is regenerated per period below, and any open/closed/owner overrides
  // recorded against the old period's exception IDs are cleared rather than silently reapplied
  // to a different period's exceptions that happen to reuse the same ID.
  const changePeriod = (id) => { setSelectedPeriod(id); setExState({}); };

  const model = useMemo(() => {
    SEQ = 0;
    const period = derivePeriod(selectedPeriod);
    const source = loadFromSource(period.id);
    const canon = buildCanonical(source);
    const kpis = Object.fromEntries(canon.map(h => [h.id, computeHospitalKPIs(h)]));
    const reporting = Object.fromEntries(canon.map(h => [h.id, computeReporting(h, cal, period)]));
    const exceptions = generateExceptions(canon, kpis, reporting, period);
    return { source, canon, kpis, reporting, exceptions, period };
  }, [cal, selectedPeriod]);

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
    const history = [...(cur.history || base.history), { at:model.period.asOfDate, what:note, by:"Control Tower Lead" }];
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
          <Mono style={{ fontSize:10, color:C.inkFaint, marginTop:5, display:"block" }}>v0.1 · {model.period.label}</Mono>
        </div>

        <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.line}` }}>
          <label style={{ display:"flex", flexDirection:"column", gap:4, fontSize:10.5, color:C.inkFaint }}>
            Reporting period
            <select value={selectedPeriod} onChange={e=>changePeriod(e.target.value)} style={{ ...inputS, width:"100%" }}>
              {availableMonths.map(m => <option key={m} value={m}>{derivePeriod(m).label}</option>)}
            </select>
          </label>
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
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Reporting date </span><Mono style={{ fontSize:12 }}>{model.period.asOfDate}</Mono></div>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Source </span>
            <Mono style={{ fontSize:12, color:C.amber }}>Google Sheets · snapshot</Mono></div>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Read at </span><Mono style={{ fontSize:12 }}>{model.source.meta.readAt.slice(11,16)}</Mono></div>
          <div><span style={{ color:C.inkFaint, fontSize:11 }}>Hospitals reporting </span>
            <Mono style={{ fontSize:12, color: network.reportingToday === CONFIG.hospitals.length ? C.green : C.amber }}>{network.reportingToday}/{CONFIG.hospitals.length}</Mono></div>
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
          {module === "config"     && <ConfigModule {...{thresholds, setThresholds, cal, setCal, period: model.period}} />}
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
          {CONFIG.hospitals.length} hospitals, {model.period.label}, computed from payer-level components rather than the sheets' own
          calculated columns. Figures cover submitted days only.
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(168px,1fr))", gap:10, marginBottom:18 }}>
        <Stat label="Total network revenue" value={moneyK(network.revenue)} sub={`${model.period.label}, submitted days`} />
        <Stat label="Total patient attendance" value={int(network.attendance)} sub={`${int(network.newReg)} new registrations`} />
        <Stat label="Total admissions" value={int(network.admissions)} sub={`${int(network.discharges)} discharges`} />
        <Stat label="Network ARPE" value={money(network.arpe)} sub="Revenue ÷ attendance" />
        <Stat label="Conversion rate" value={pct(network.conversion,2)} sub="Admissions ÷ attendance" />
        <Stat label="Average NPS" value={pct(network.nps,1)} sub={`${network.npsHospitals} of ${CONFIG.hospitals.length} hospitals computable`} tone={C.ink} />
        <Stat label="Hospitals with no gap" value={`${network.reportingToday}/${CONFIG.hospitals.length}`} tone={network.reportingToday===CONFIG.hospitals.length?C.green:C.amber} sub={`across ${network.dueDates} expected dates`} />
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

      <Panel title="Daily record" note="Every one of the 44 standardised schema columns, for every expected reporting date this period. Cell markers show the state of the underlying source value.">
        <div style={{ overflowX:"auto" }}>
          <table>
            <thead><tr>
              <th style={th}>Date</th><th style={th}>Day</th>
              {ALL_FIELD_KEYS.map(f => <th key={f} style={{...th,textAlign:"right"}}>{FIELD_LABEL[f] || f}</th>)}
            </tr></thead>
            <tbody>
              {R.due.map(d => {
                const rec = h.records.find(r => r.date === d);
                if (!rec || !rec.submitted) return (
                  <tr key={d}>
                    <td style={{...td, color:C.amber}}>{dayLabel(d)}</td>
                    <td style={{...td, color:C.inkFaint}}>{weekday(d)}</td>
                    <td colSpan={ALL_FIELD_KEYS.length} style={{ ...td, color:C.amber, fontSize:12 }}>
                      No record submitted · potential reporting gap
                    </td>
                  </tr>
                );
                return (
                  <tr key={d}>
                    <td style={td}>{dayLabel(d)}{!rec.complete && <span title="Incomplete submission" style={{ color:C.amber, marginLeft:5 }}>◐</span>}</td>
                    <td style={{...td, color:C.inkFaint}}>{weekday(d)}</td>
                    {ALL_FIELD_KEYS.map(f => (
                      <td key={f} style={tdR}>
                        <StateCell cellObj={fieldCell(rec, f)} naReason={h.naReason} format={v => formatFieldValue(f, v)} />
                      </td>
                    ))}
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

      {open && <ExceptionDetail e={list.find(x=>x.id===open)} updateEx={updateEx} asOfDate={model.period.asOfDate} />}
    </>
  );
}

function ExceptionDetail({ e, updateEx, asOfDate }) {
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
        <button disabled={!evidence} onClick={()=>updateEx(e.id,{status:"CLOSED",evidence,closedOn:asOfDate},`Closed with evidence: ${evidence}`)}
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
            {expectedDates(cal, model.period).length} expected dates to {model.period.asOfDate}
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
                    <td style={{ ...tdR, color:C.inkFaint }}>{sheetOwn !== undefined && sheetOwn !== null ? sheetOwn : "—"}</td>
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
              {expectedDates(cal, model.period).map(d => <th key={d} style={{ ...th, textAlign:"center", padding:"7px 4px", fontWeight:400 }}>
                <div style={{ fontSize:10.5 }}>{new Date(d+"T00:00:00").getDate()}</div>
                <div style={{ fontSize:9, color:C.inkFaint }}>{weekday(d).slice(0,1)}</div>
              </th>)}
            </tr></thead>
            <tbody>
              {model.canon.map(h => (
                <tr key={h.id}>
                  <td style={td}><Mono style={{ fontSize:11.5 }}>{h.id}</Mono></td>
                  {expectedDates(cal, model.period).map(d => {
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
        Revenue is summed from payer components for the submitted days in {model.period.label}.
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

      <Panel title="Revenue — daily history" note="Every hospital, every submitted date this period, every payer-revenue and revenue-total field. Cell markers show the state of the underlying source value.">
        <DailyHistoryTable model={model} fields={["privRev","hmoRev","nhiaRev","compRev","rTotRev","rARPE","rMTD"]} />
      </Panel>

      <Panel title="Collections (cash received)"
             note="Populated inconsistently across hospitals — not aggregated to a network figure, since that would misrepresent hospitals that never populate the field as zero. Shown here exactly as submitted, per hospital and date, so the gaps stay visible rather than being smoothed over.">
        <DailyHistoryTable model={model} fields={["coll"]} />
      </Panel>

      <Panel title="Revenue achievement rate"
             note="No revenue target was supplied, so the engine cannot verify how this figure is derived or recompute it. Carried exactly as each hospital entered it and excluded from network ranking.">
        <DailyHistoryTable model={model} fields={["revAch"]} />
      </Panel>

      <Panel title="HMO revenue cycle">
        <Unavailable
          title="Integration pending"
          reason="The hospital sheets carry HMO attendance and HMO revenue only. Claims submitted, claims rejected, outstanding receivables, aging, DSO and recovery rate do not exist in any of the nine sources."
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
      <Panel title="Patient experience — daily history" note="Every hospital, every submitted date this period, every patient-experience field. Cell markers show the state of the underlying source value.">
        <DailyHistoryTable model={model} fields={["tat","det","prom","indiff","rNPS","wait"]} />
      </Panel>

      <Panel title="Average waiting time"
             note="Excluded from network ranking: some hospitals hold an identical value on every submitted day, which suggests a standing figure rather than a daily measurement, so per the product specification it is not used as a ranking KPI until the underlying capture is confirmed reliable. Shown here exactly as submitted so the pattern stays visible rather than being hidden.">
        <DailyHistoryTable model={model} fields={["wait"]} />
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

      <Panel title="Daily history" note="Every hospital, every submitted date this period, not comparable between hospitals until units and capture method are confirmed. Cell markers show the state of the underlying source value.">
        <DailyHistoryTable model={model} fields={fields} />
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
          reason="None of the nine hospital sheets contains Follow-Up fields. No Follow-Up figures are shown, estimated or inferred. The data model and exception engine already accept a Follow-Up domain, so connecting a source will not require the application to be rebuilt."
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

function ConfigModule({ thresholds, setThresholds, cal, setCal, period }) {
  const [draft, setDraft] = useState({ kpi:"revenue", hospital:"ALL", target:"", amber:"", red:"", critical:"", direction:"LOWER_IS_WORSE" });
  const add = () => {
    if (draft.amber === "" && draft.red === "" && draft.critical === "") return;
    setThresholds([...thresholds, {
      ...draft, id:`T${thresholds.length+1}`,
      target: draft.target===""?null:Number(draft.target), amber: draft.amber===""?null:Number(draft.amber),
      red: draft.red===""?null:Number(draft.red), critical: draft.critical===""?null:Number(draft.critical),
      effective: period.asOfDate, owner:"Control Tower Lead",
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
