# CLAUDE.md — EnvironmSafe Generator Management App

This file is read by Claude Code at the start of every session. It explains the project so you can continue development. Read it fully before making changes.

## WHY — what this project is
A bilingual (Arabic-default / English) web app for **EnvironmSafe — Engineering, Trading & Services Ltd.** (a Yemeni engineering company) to manage generator fleets it maintains for **UNHCR** (5 gensets) and **FAO** (2–3 gensets). It lets field technicians record generator readings, track scheduled + corrective maintenance, and produce professional reports. The primary user is non-technical and works from an **Android phone**, so simplicity and reliability matter more than cleverness.

## WHAT — the app
- **Single file:** `generator-readings.html` (~185 KB). Everything — HTML, CSS, JS — is inline in that one file. There is no build step.
- **Backend:** Firebase Firestore (email/password auth with two roles, offline persistence, real-time multi-device sync).
- **Hosting:** Netlify (drag-and-drop deploy of the single HTML file as `index.html`).
- **Libraries** (all via CDN, no npm): Chart.js, Firebase 10.14.1 compat SDKs, SheetJS (xlsx) 0.18.5.

### Auth & roles
- The app requires a real sign-in (Firebase email/password) — there is no anonymous access anymore. `renderLoginScreen()`/`bindLoginScreen()` handle the login form; `startAuthListener()` (in place of the old `authReady()`) drives everything off `auth.onAuthStateChanged`.
- Two roles, stored in the `users` collection (doc id = the account's Firebase Auth UID): `{ email, role: 'admin'|'viewer' }`. `STATE.isAdmin` (`STATE.userRole === 'admin'`) gates every write-capable UI element — see `viewonly_notice` usage throughout the render functions. **The real security boundary is `firestore-rules.txt`, not the UI** — the UI hiding is just good UX; rules use a `get()` lookup on the caller's own `users/{uid}` doc to decide `isAdmin()`.
- Setup → **Manage users** (admin-only) creates new accounts via `createUserWithEmailAndPassword` on a **secondary Firebase app instance** (`secondaryAuth()`) — calling that on the default app instance would silently sign the current admin out and in as the new user, which is a well-known Firebase client-SDK gotcha. Passwords are typed directly into that form and are never stored, logged, or seen by anyone but Firebase Auth itself.
- **Bootstrapping the very first admin is a one-time MANUAL step** (documented below) — there is deliberately no self-service "become admin" path in the rules, since that would be a privilege-escalation hole.

### Firebase project
- Project id: `generators-readings`
- Firestore collections: `generators`, `readings`, `maintenance`, `corrective`, `servicelog`, `settings` (label overrides, single doc `labels`), `customfields` (user-defined extra fields), `users` (`{email, role}` per Firebase Auth UID — role source of truth)
- **CRITICAL:** every collection must be listed in Firestore security rules or writes silently fail with "Could not save — check connection". The current rules are in `firestore-rules.txt`. Whenever you add a new collection, you MUST update those rules and the user must publish them in the Firebase console.
- **Two manual, one-time Firebase Console steps the user (not you) must do** — you cannot do either remotely:
  1. **Enable the Email/Password sign-in provider**: Firebase Console → Authentication → Sign-in method → enable "Email/Password". Without this, every login attempt fails with `auth/operation-not-allowed`.
  2. **Create the first admin account**: (a) In Authentication → Users, add a user with the email/password of your choice. (b) Copy that user's UID. (c) In Firestore Database, create a document at `users/<that UID>` with fields `email` (string, matching) and `role` (string, exactly `admin`). After that, log into the app with those credentials and use Setup → Manage users to create every other account (including any future admins) — no more manual Firestore document creation needed after this one time.

### Live URLs
- App (primary/custom domain): https://environmsafe.com
- App (Netlify subdomain): https://environmsafe-generators-daily.netlify.app/
- Netlify deploys: app.netlify.com → site `environmsafe-generators-daily` → Deploys
- Firestore rules: https://console.firebase.google.com/project/generators-readings/firestore/rules
- The Netlify site is Git-connected to this repo's `main` branch (via `netlify.toml`'s build command, which copies `generator-readings.html` → `index.html`). Pushing to `main` auto-deploys — no manual drag-and-drop needed anymore.

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
5. **Faults (corrective)** — every fault gets an auto-assigned serial **Fault ID** (`Cor-813`, `Cor-814`, ...; see `nextFaultSeq()` — derived from the highest `faultSeq` already in `STATE.corrective`, no separate counter doc needed). Also logs: short description, full description, type, severity, status, hours-at-event, causes of fault, action, parts, downtime, recommendations (optional), by, up to 4 photos (client-side compressed, stored as base64 in the doc). Status cycles open→in_progress→closed. Colour-coded severity. **Every field can be edited at any status** via the ✎ Edit button on each fault card (not just status) — editing never changes the Fault ID. Each fault also has **🖨️ Print PDF** and **📄 Word** buttons that generate an official single-fault report (logo header, Fault ID, all fields, photos appended at the end, and signature blocks for the EnvironmSafe engineer + client supervisor).
6. **Dashboard** — per-generator latest-status cards, trend charts, and a service+faults summary card.
7. **Setup** — account card (current user + role + logout); add/rename/remove generators (admin only); **Manage users** panel (admin only — create new admin/viewer accounts, promote/demote); **Custom fields** panel (add new fields — text/long text/number/date/dropdown — to the New Reading, Faults, Log Service, or Add Generator forms; deactivate/delete without losing historical data); **Labels** panel (rename any text/tab/label in the app, per-language, grouped by section with search). The Custom fields, Labels, and Manage users panels are admin-only; viewers see only the account card + read-only generator list.

## HOW — conventions you MUST follow
- **Keep it one single HTML file.** Do not split into modules or add a build system unless the user explicitly asks. The whole workflow depends on drag-and-drop of one file.
- **Bilingual everything.** All user-facing strings live in the `I18N` dict with `ar` and `en` keys. Arabic is default and RTL. Never hard-code a visible string; add an i18n key for both languages.
- **Brand:** navy `#1B2A4A`, gold `#C49A2A`, light grey bg `#F5F6F8`. Status colours: green=OK, amber=due soon, red=overdue/out-of-range. Logo is embedded as base64 in the report code (`REPORT_LOGO_B64`).
- **Mobile-first.** Target a 412px-wide phone. Test that no tab overflows horizontally. Tap targets ≥ ~40px.
- **Out-of-range thresholds:** Voltage 360–420 V, Frequency 49–51 Hz, Oil pressure 2–7 bar, Coolant ≤98 °C, Oil temp ≤110 °C, Battery 23–29 V, Fuel ≥15 %. Blank fields are never flagged.
- **Never break the schedule math.** The maintenance/due-date/nesting logic is covered by tests — run them after any change (see below).
- **Firestore: add collection → update rules.** If you introduce a new collection, update `firestore-rules.txt` and tell the user to publish it, or writes will fail.
- **i18n `t()` function:** there is a global `t(key, params)`. Never shadow it with a local variable named `t`. `t()` checks `STATE.labelOverrides[key][lang]` first (user-set via the Setup → Labels panel) before falling back to `I18N[lang][key]` — a blank override means "use the default". If you add a NEW visible string, add it to `I18N` as normal; it automatically becomes editable in the Labels panel (no extra wiring needed) via `allLabelKeys()`, and gets auto-categorized by `categoryForLabelKey()` off its prefix (add a new prefix to `LABEL_CATEGORY_PREFIXES` if it doesn't fit an existing category — otherwise it lands in "General", which is fine).
- **Custom fields:** user-defined extra fields (Setup → Custom fields) attach to one of four sections: `reading`, `corrective`, `service`, `generator`. Definitions live in the `customfields` collection; values are saved as a `customFields: {key: value}` map on the record. Use `renderCustomFieldInputs(section, existingValues, idPrefix)` + `collectCustomFieldValues(section, idPrefix)` in form-based sections (reading/corrective/generator), or `promptCustomFieldValues(section)` where the flow is a one-tap action with no form (service log). Display saved values with `renderCustomFieldValues()` (HTML) or `customFieldsSummary()` (flat "key: value" string for table-style report exports). A full page re-render (e.g. after a photo upload) will wipe unsaved text in any input/textarea/select under `#app` unless you go through `rerenderPreservingCorrForm()` (or an equivalent save/restore) instead of calling `render()` directly — this bit us once already for the Faults form.

## Testing (run after every change)
Node test suites live alongside the HTML (they extract the inline `<script>` and run it against a mock Firestore):
- `test_maint.js` — time + hours maintenance status, nesting, forecasting
- `test_duedate.js` — due-date anchoring to last service date (the real-world FAO case)
- `test_reports.js` — report period filtering, CSV format
- `test_corrective.js` — corrective events + the four report builders
- `test_svclog.js` — service history log, all-generators reports, backup
- `test_labels_customfields.js` — label-override precedence in `t()`, label categorization, custom-field definitions/filtering/rendering/collection, and their flow into report exports
- `simulate_firestore.js` — auth, two-device sync, permission-denied diagnostics

Run all: `for f in simulate_firestore test_reports test_maint test_duedate test_corrective test_svclog test_labels_customfields; do node $f.js; done`
All suites must print `0 failed`. If you add a feature, add tests for it.

For UI changes, a Playwright headless check at 412×892 (mock Firebase, since the real one is network-gated in CI) catches overflow/console errors. See `firebase_mock_init.js` for the seed/mock — it pre-seeds two accounts for exercising both roles: `admin@test.local` / `admin123` (role `admin`) and `viewer@test.local` / `viewer123` (role `viewer`), plus supports named secondary app instances (`firebase.initializeApp(config, 'secondary')`) so the Manage Users create-account flow can be tested without logging the test session out. The Node test suites' own inline mocks (in each `test_*.js`) always simulate an already-authenticated `{uid:'x'}` user via `onAuthStateChanged` — app start-up is deliberately NOT gated on role resolution (any signed-in user reaches the main app; `STATE.isAdmin` only gates write UI, resolved asynchronously), so none of those suites needed to change for the auth rework, other than seeding a `users` collection where a test cares about `STATE.isAdmin`-gated behavior specifically.

## Deploy
1. Commit the updated `generator-readings.html` (and `netlify.toml` if it changes) to `main` and push.
2. Netlify is Git-connected and auto-deploys from `main` within seconds — no manual step needed. Verify via the Netlify MCP tools (`get-project` / `get-deploy-for-site`) that the new deploy's `commit_ref` matches your latest push and `state` is `ready`.
3. If Firestore collections/rules changed, the user still must publish `firestore-rules.txt` in the Firebase console — that step cannot be automated.

## Known real-world data (do not invent; confirm on site if unsure)
- FAO Genset 1: engine Perkins 1106A-70T (serial PP82576U084151H, 7.0 L 6-cyl), alternator Stamford UC.I274E14 (S/N X24B063436), 140 kVA, runs 17 h/day.
- FAO Genset 2: engine Perkins 1104A-44T (serial RS51276U676942E, 4.4 L 4-cyl), alternator Stamford UCI224F1 (S/N C19C097357), 65 kVA prime, runs 7 h/day.
- UNHCR-PER-03: engine Perkins 1106A-70TA (serial PR83526U079702G), alternator Stamford UCI274F (S/N 0213538/150), 150 kVA confirmed from nameplate.
- Other UNHCR units and full specs are in the equipment-register build scripts / outputs.

## Style of working the user expects
Explain things simply (the user is non-technical). Be honest about limitations. Verify facts against sources; never guess on official documents — mark unconfirmed items "confirm on site". Test before declaring done. Keep changes minimal and focused.
