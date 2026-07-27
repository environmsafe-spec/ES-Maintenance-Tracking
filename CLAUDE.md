# CLAUDE.md — EnvironmSafe Generator Management App

This file is read by Claude Code at the start of every session. It explains the project so you can continue development. Read it fully before making changes.

## WHY — what this project is
A bilingual (Arabic-default / English) web app for **EnvironmSafe — Engineering, Trading & Services Ltd.** (a Yemeni engineering company) to manage generator fleets it maintains for **UNHCR** (5 gensets) and **FAO** (2–3 gensets). It lets field technicians record generator readings, track scheduled + corrective maintenance, and produce professional reports. The primary user is non-technical and works from an **Android phone**, so simplicity and reliability matter more than cleverness.

## WHAT — the app
- **Single file:** `generator-readings.html` (~185 KB). Everything — HTML, CSS, JS — is inline in that one file. There is no build step.
- **Backend:** Firebase Firestore (anonymous auth, offline persistence, real-time multi-device sync).
- **Hosting:** Netlify (drag-and-drop deploy of the single HTML file as `index.html`).
- **Libraries** (all via CDN, no npm): Chart.js, Firebase 10.14.1 compat SDKs, SheetJS (xlsx) 0.18.5.

### Firebase project
- Project id: `generators-readings`
- Firestore collections: `generators`, `readings`, `maintenance`, `corrective`, `servicelog`
- **CRITICAL:** every collection must be listed in Firestore security rules or writes silently fail with "Could not save — check connection". The current rules are in `firestore-rules.txt`. Whenever you add a new collection, you MUST update those rules and the user must publish them in the Firebase console.

### Live URLs
- App: https://environmsafe-generators-daily.netlify.app/
- Netlify deploys: app.netlify.com → site `environmsafe-generators-daily` → Deploys
- Firestore rules: https://console.firebase.google.com/project/generators-readings/firestore/rules

## Tabs / features (7 tabs)
1. **New** — reading entry (grouped: core / voltage / current / engine-fluids / notes). Out-of-range values flagged.
2. **History** — past readings, filterable, out-of-range highlighting.
3. **Reports** — five report types, each exportable to branded A4 **PDF** (print-window), **Excel** (SheetJS) and **CSV**:
   readings, scheduled maintenance, service history, faults & repairs, fleet summary. Plus a **full data backup** button (all collections → one xlsx).
4. **Service (maintenance)** — two schedules per generator, kept SEPARATE:
   - Time-based: Weekly / 3-Monthly / 6-Monthly / Yearly (7/90/180/365 days).
   - Hours-based: 125/250/500/1000/4000/8000/12000 running hours, driven by the latest running-hours reading.
   - Each interval has "Log service done" + "✎ Edit" (manual baseline: last date AND last hours).
   - **Nesting:** logging a larger hours service auto-resets all smaller ones (500 → also 250,125).
   - **Due-date rule (important, was a real bug):** hours-based due DATE is anchored to the **last service date**, not today: `dueDate = lastServiceDate + round(intervalHrs / hrsPerDay)`. Default `hrsPerDay = 24` unless set per generator. A service is "overdue" if EITHER the date passed OR the hours were reached (a stale reading must never hide an overdue service).
   - Every logged/back-filled service also writes a permanent record to `servicelog` (the audit trail).
5. **Faults (corrective)** — log failures/breakdowns/repairs: type, severity, status, hours-at-event, description, action, parts, downtime, by. Status cycles open→in_progress→closed. Colour-coded severity.
6. **Dashboard** — per-generator latest-status cards, trend charts, and a service+faults summary card.
7. **Setup** — add/rename/remove generators; contact card.

## HOW — conventions you MUST follow
- **Keep it one single HTML file.** Do not split into modules or add a build system unless the user explicitly asks. The whole workflow depends on drag-and-drop of one file.
- **Bilingual everything.** All user-facing strings live in the `I18N` dict with `ar` and `en` keys. Arabic is default and RTL. Never hard-code a visible string; add an i18n key for both languages.
- **Brand:** navy `#1B2A4A`, gold `#C49A2A`, light grey bg `#F5F6F8`. Status colours: green=OK, amber=due soon, red=overdue/out-of-range. Logo is embedded as base64 in the report code (`REPORT_LOGO_B64`).
- **Mobile-first.** Target a 412px-wide phone. Test that no tab overflows horizontally. Tap targets ≥ ~40px.
- **Out-of-range thresholds:** Voltage 360–420 V, Frequency 49–51 Hz, Oil pressure 2–7 bar, Coolant ≤98 °C, Oil temp ≤110 °C, Battery 23–29 V, Fuel ≥15 %. Blank fields are never flagged.
- **Never break the schedule math.** The maintenance/due-date/nesting logic is covered by tests — run them after any change (see below).
- **Firestore: add collection → update rules.** If you introduce a new collection, update `firestore-rules.txt` and tell the user to publish it, or writes will fail.
- **i18n `t()` function:** there is a global `t(key, params)`. Never shadow it with a local variable named `t`.

## Testing (run after every change)
Node test suites live alongside the HTML (they extract the inline `<script>` and run it against a mock Firestore):
- `test_maint.js` — time + hours maintenance status, nesting, forecasting
- `test_duedate.js` — due-date anchoring to last service date (the real-world FAO case)
- `test_reports.js` — report period filtering, CSV format
- `test_corrective.js` — corrective events + the four report builders
- `test_svclog.js` — service history log, all-generators reports, backup
- `simulate_firestore.js` — auth, two-device sync, permission-denied diagnostics

Run all: `for f in simulate_firestore test_reports test_maint test_duedate test_corrective test_svclog; do node $f.js; done`
All suites must print `0 failed`. If you add a feature, add tests for it.

For UI changes, a Playwright headless check at 412×892 (mock Firebase, since the real one is network-gated in CI) catches overflow/console errors. See `firebase_mock_init.js` for the seed/mock.

## Deploy (the user does this from their phone)
1. You commit the updated `generator-readings.html` to the repo.
2. If GitHub→Netlify auto-deploy is connected, it goes live automatically. Otherwise the user drag-drops the file on the Netlify Deploys page and taps "Rename and deploy" (renames to `index.html`).
3. If rules changed, the user publishes `firestore-rules.txt` in the Firebase console.

## Known real-world data (do not invent; confirm on site if unsure)
- FAO Genset 1: engine Perkins 1106A-70T (serial PP82576U084151H, 7.0 L 6-cyl), alternator Stamford UC.I274E14 (S/N X24B063436), 140 kVA, runs 17 h/day.
- FAO Genset 2: engine Perkins 1104A-44T (serial RS51276U676942E, 4.4 L 4-cyl), alternator Stamford UCI224F1 (S/N C19C097357), 65 kVA prime, runs 7 h/day.
- UNHCR-PER-03: engine Perkins 1106A-70TA (serial PR83526U079702G), alternator Stamford UCI274F (S/N 0213538/150), 150 kVA confirmed from nameplate.
- Other UNHCR units and full specs are in the equipment-register build scripts / outputs.

## Style of working the user expects
Explain things simply (the user is non-technical). Be honest about limitations. Verify facts against sources; never guess on official documents — mark unconfirmed items "confirm on site". Test before declaring done. Keep changes minimal and focused.
