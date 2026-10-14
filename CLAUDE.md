# CareOne Control Tower — standing instructions

## Data refresh protocol (daily Google Sheets → `RAW` in `src/ControlTower.jsx`)
Data lives inline as `const RAW = {…}` (not in `src/data/raw-data.json`). Only September 2026 onward tabs are in scope.

1. Pre-flight: main clean, no open PRs or stuck workflow runs; report anything half-finished and stop.
2. Capture all 44 standardised columns per date row; blank cells are recorded as not reported (null), never zero.
3. Reconcile every touched row: payer attendance components = total attendance; payer revenue components = total revenue. On any failure, do not commit — report the exact row and mismatch, and stop.
4. **Outlier scan (standing requirement from the owner, Zion).** Run `node scripts/outlier-scan.mjs` on every refresh, plus judgement against each hospital's own past data and trends. Reconciliation only proves components add up; it cannot catch a plausible-looking wrong number (e.g. Outreach Festac 4 Oct 2026: a cumulative 1–4 Oct total entered as one day's revenue — ₦9.27M instead of ₦1.59M; it inflated Festac to 122% "On Track" until corrected at source).
   - Escalate to the owner, in the refresh report, every HIGH flag and a summary of MED flags, with the row, the figures, the hospital's normal range and why it looks off. Never silently "fix" a figure and never commit assumed corrections: the sheet is the source of truth, the owner follows up with the hospital.
   - Also look for: revenue ≈ sum of preceding days (cumulative entry), revenue with zero attendance or attendance with no revenue, a partial day (e.g. only one payer filled), copy-pasted figures from the previous day, unit/format slips (percent cells, extra digits), and sudden trend breaks vs the hospital's recent weeks.
   - Flagging does not block the commit when reconciliation passes, unless the owner says so; the flag must still appear in the report. Say how an outlier moves a hospital's achievement % / status.
5. Production build (`npm run build`), commit and push to main, report the computed network totals as proof of a live-data run.

## Email reports (`dsr-pipeline/`)
Hospitals that missed the report date show a "Last report: <date>" line under their name in the achievement table.
