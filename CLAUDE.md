# CareOne Control Tower — standing instructions

## Data refresh protocol (daily Google Sheets → `RAW` in `src/ControlTower.jsx`)
Data lives inline as `const RAW = {…}` (not in `src/data/raw-data.json`). Only September 2026 onward tabs are in scope.

1. Pre-flight: main clean, no open PRs or stuck workflow runs; report anything half-finished and stop.
   **Freshness (lesson from 14 Oct 2026):** the dashboard and the daily/weekly emails read the data committed on main, never the live sheets. A report sent after a sheet was edited, but before the refresh was re-run, shows stale figures (Grovers showed ₦32.7M instead of ₦36.6M because Oct 13 was completed after the download).
   - Always re-read **all 11** sheets on a refresh, not just the one the owner mentions, unless the owner explicitly says "only X". If only some sheets are re-read, say so in the report and state that the others are not refreshed.
   - Before reporting "current", call Drive `get_file_metadata` on every sheet and compare `modifiedTime` with the time of the downloads; re-pull any sheet edited since.
   - Set `SOURCE_META.readAt` (Lagos, +01:00) to the **real** time of the oldest sheet download in the data, taken from `TZ=Africa/Lagos date` — never an estimate. The emails print it as "Data as of …" in the footer. Commit timestamps are UTC; use Lagos time when quoting times to the owner.
   - End every refresh report with: "Data current as of HH:MM WAT; sheets re-read: …; any edited since: …".
2. Capture all 44 standardised columns per date row; blank cells are recorded as not reported (null), never zero.
3. Reconcile every touched row: payer attendance components = total attendance; payer revenue components = total revenue. On any failure, do not commit — report the exact row and mismatch, and stop.
4. **Outlier scan (standing requirement from the owner, Zion).** Run `node scripts/outlier-scan.mjs` on every refresh, plus judgement against each hospital's own past data and trends. Reconciliation only proves components add up; it cannot catch a plausible-looking wrong number (e.g. Outreach Festac 4 Oct 2026: a cumulative 1–4 Oct total entered as one day's revenue — ₦9.27M instead of ₦1.59M; it inflated Festac to 122% "On Track" until corrected at source).
   - Escalate to the owner, in the refresh report, every HIGH flag and a summary of MED flags, with the row, the figures, the hospital's normal range and why it looks off. Never silently "fix" a figure and never commit assumed corrections: the sheet is the source of truth, the owner follows up with the hospital.
   - Also look for: revenue ≈ sum of preceding days (cumulative entry), revenue with zero attendance or attendance with no revenue, a partial day (e.g. only one payer filled), copy-pasted figures from the previous day, unit/format slips (percent cells, extra digits), and sudden trend breaks vs the hospital's recent weeks.
   - Before escalating a revenue spike, check discharges that day: inpatients settle bills on discharge, so a discharge spike can explain it (Outreach Festac 14 Oct 2026: 16 discharges vs usual 3–6, ₦8.73M confirmed accurate by the business manager). Say so in the flag instead of calling it an error.
   - Flagging does not block the commit when reconciliation passes, unless the owner says so; the flag must still appear in the report. Say how an outlier moves a hospital's achievement % / status.
5. Production build (`npm run build`), commit and push to main, report the computed network totals as proof of a live-data run.

## Email reports (`dsr-pipeline/`)
The exception tables include "Unusual figure" rows from `scripts/outlier-rules.mjs` (DSR: 7 days ending on the report date; WSR: the week). When the owner confirms a flagged row is accurate, add it to `CONFIRMED_ACCURATE` in that file so it stops appearing in the emails. The footer shows "Data as of <readAt>" so readers can see how old the figures are. Hospitals that missed the report date show a "Last report: <date>" line under their name in the achievement table.
