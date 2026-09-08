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
- Firestore collections: `generators`, `readings`, `maintenance`, `corrective`, `servicelog`, `settings` (single doc `labels` for label overrides + single doc `billing` for rates/currency/bank accounts), `customfields` (user-defined extra fields), `pricelist` (goods catalogue), `invoices`
- **CRITICAL:** every collection must be listed in Firestore security rules or writes silently fail with "Could not save — check connection". The current rules are in `firestore-rules.txt`. Whenever you add a new collection, you MUST update those rules and the user must publish them in the Firebase console.

### Live URLs
- App (primary/custom domain): https://environmsafe.com
- App (branch URL, always works): https://main--environmsafe-generators-daily.netlify.app
- NOTE: the bare `https://environmsafe-generators-daily.netlify.app/` is **no longer a usable address**. Once `environmsafe.com` was made the primary domain, Netlify stopped serving that subdomain directly and redirects it to the primary domain — the project's own `urls` list only contains the primary domain and the `main--` branch URL. Give people `environmsafe.com`.
- Netlify deploys: app.netlify.com → site `environmsafe-generators-daily` → Deploys
- Firestore rules: https://console.firebase.google.com/project/generators-readings/firestore/rules
- The Netlify site is Git-connected to this repo's `main` branch (via `netlify.toml`'s build command, which copies `generator-readings.html` → `index.html`). Pushing to `main` auto-deploys — no manual drag-and-drop needed anymore.

## Tabs / features (8 tabs)
1. **New** — reading entry (grouped: core / voltage / current / engine-fluids / notes). Out-of-range values flagged.
2. **History** — past readings, filterable, out-of-range highlighting.
3. **Reports** — six report types, each exportable to branded A4 **PDF** (print-window), **Excel** (SheetJS) and **CSV**:
   readings, scheduled maintenance, service history, correctives & repairs, fleet summary, invoices. Plus a **full data backup** button (all collections → one xlsx, 8 sheets).
   - **Several generators at once.** `STATE.reportGenIds` is a ticked list; `selectedReportGenIds()` falls back to the older single `STATE.reportGenId` (which may still be `'__all__'`) when it is empty, so nothing that predates the multi-select breaks. `genSelMatch(sel, id)` accepts an array, a single id, or `'__all__'`. When `reportIsMultiGen()` a generator column is added to the readings / maintenance / service / corrective tables, and the header uses `reportSubjectLabel()` / `reportClientLabel()`.
   - **Corrective pack:** the corrective report also offers **Full reports PDF / Word** — one file containing `faultReportBody()` for every record in the period, oldest first, each on its own page (`printCorrectivePack()` / `exportCorrectivePackWord()`, sharing `correctivePackHtml()` + `CORR_PACK_CSS`). It is deliberately the *identical* form the Corrective tab prints for one record — if that form changes, the pack follows automatically. The pack opens with a **cover sheet** (`correctivePackCover()`): client, generators, period, counts of reports/open/closed, total downtime and total billable, an index table of every report inside (no severity column), and one EnvironmSafe signature block for the submission as a whole.
4. **Service (maintenance)** — two schedules per generator, kept SEPARATE:
   - Time-based: Weekly / 3-Monthly / 6-Monthly / Yearly (7/90/180/365 days).
   - Hours-based: 125/250/500/1000/4000/8000/12000 running hours, driven by the latest running-hours reading.
   - Each interval has "Log service done" + "✎ Edit" (manual baseline: last date AND last hours).
   - **Nesting:** logging a larger hours service auto-resets all smaller ones (500 → also 250,125).
   - **Due-date rule (important, was a real bug):** hours-based due DATE is anchored to the **last service date**, not today: `dueDate = lastServiceDate + round(intervalHrs / hrsPerDay)`. Default `hrsPerDay = 24` unless set per generator. A service is "overdue" if EITHER the date passed OR the hours were reached (a stale reading must never hide an overdue service).
   - Every logged/back-filled service also writes a permanent record to `servicelog` (the audit trail).
5. **Corrective** — the user-facing wording is **"corrective"**, never "fault" (renamed Aug 2026); the code, the `corrective` collection and the `faultId`/`faultSeq`/`partsLines` field names are unchanged, so records stay readable. Every record gets an auto-assigned serial **Corrective ID** (`Cor-813`, `Cor-814`, ...; see `nextFaultSeq()` — derived from the highest `faultSeq` already in `STATE.corrective`, no separate counter doc needed). Also logs: short description, full description, type, severity, status, hours-at-event, causes of fault, action, parts, downtime, recommendations (optional), by, up to 4 photos (client-side compressed, stored as base64 in the doc). Status cycles open→in_progress→closed. Colour-coded severity. **Every field can be edited at any status** via the ✎ Edit button on each fault card (not just status) — editing never changes the Fault ID. Each fault also has **🖨️ Print PDF** and **📄 Word** buttons that generate an official single-fault report (logo header, Fault ID, all fields, photos appended at the end, and a single signature block for the EnvironmSafe engineer). **Severity is recorded and shown in the app (card colour + form) but is deliberately NOT printed** — it appears in no report, table or export; only the full data backup still carries it. The **client-supervisor signature was removed** from the corrective report and the pack cover (Sept 2026); the invoice/delivery note keeps its "Received by client" block, which is a different thing.
6. **Invoices (billing)** — see the Billing section below.
7. **Dashboard** — per-generator latest-status cards, trend charts, and a service+faults summary card.
8. **Setup** — add/rename/remove generators; contact card; **Billing settings** (corrective + routine visit rates, currency, the two bank accounts); **Goods price list** (add/edit/deactivate/delete items); **Custom fields** panel (add new fields — text/long text/number/date/dropdown — to the New Reading, Faults, Log Service, or Add Generator forms; deactivate/delete without losing historical data); **Labels** panel (rename any text/tab/label in the app, per-language, grouped by section with search).

## Billing / invoicing (added Aug 2026)
Three pieces, deliberately kept loosely coupled:
- **Price list** (`pricelist` collection, Setup tab) — the goods catalogue: `{nameAr, nameEn, unit, unitPrice, active}`. It is only a convenience: **any item can always be typed in free-hand with its own price**, both on a fault and on an invoice. Never force a user through the catalogue.
- **Two contract rates, not one.** `serviceRate()` is the **corrective** (fault) visit fee, default **180 USD**; `routineRate()` is the **routine/preventive** visit fee, default **23 USD**. Both come from `settings/billing` and are editable in Setup. These are the FAO financial proposal's Option 2 figures (ANNEX C-1: routine every 250 h at 23 USD/visit, corrective at 180 USD/visit). Option 1 (125 h) quotes 22 for both — do not silently switch the defaults if a different option is signed; change them in Setup.
- **Billable work.** Every fault carries `serviceFee` (defaults to the corrective rate) plus `partsLines: [{itemId, name, qty, unitPrice, total}]`, edited in the Faults form via `renderFaultBillingBlock()` / `bindFaultBillingBlock()`. Every **service VISIT** carries one routine fee — note `serviceVisits()` groups `servicelog` rows by `genId|date`, because nesting writes several rows for one visit and it must be billed **once**, not three times. Quantities and unit prices are editable inline on every line (`renderLineEditor(..., {editable:true})`).
- **Invoices** (`invoices` collection). An invoice is a header plus a flat `lines[]` array; each line is `{kind:'service'|'good', sourceType:'fault'|'service'|'manual', sourceId, ref, desc, qty, unitPrice, total}`. Numbers are serial (`INV-1001`, ...) via `nextInvoiceSeq()`, derived from the highest `invoiceSeq` — same trick as `nextFaultSeq()`, no counter doc. Status follow-up: draft → sent → partly_paid → paid → cancelled, with `paidAmount`, `balance`, overdue detection off `dueDate`, and a receivables summary card (invoiced / collected / outstanding).

**Double-billing protection is derived, never written back.** `invoicedSourceKeys()` scans the invoices for `sourceType:sourceId` pairs, so a fault knows it has been billed without any field being set on it, and the two can never drift. Cancelled invoices release their work again. When *editing* an invoice, pass its own id as `exceptInvoiceId` so its own lines don't read as "already invoiced".

`sourceType:'manual'` lines are goods added straight onto the invoice with no job behind them — this is how **stock supply** (parts handed over but not fitted during a repair) is billed. Manual lines never mark anything as invoiced.

### Issuing a document (scope + detail)
An invoice **always stores every line**, so its own total never changes and no record is lost. What varies is only the printed document, chosen per print from two dropdowns on the invoice card:
- **scope** — `all` / `services` / `routine` / `corrective` / `goods`, via `scopeLines()`. `routine` is a scheduled service VISIT (`sourceType==='service'`); `corrective` is deliberately *not routine* (`kind==='service' && sourceType!=='service'`) rather than `sourceType==='fault'`, so a hand-added service line can never fall outside both and vanish from every partial issue. The split matches the FAO contract, which prices preventive and corrective visits separately (ANNEX C-1) and parts separately again (ANNEX G2); `routine + corrective + goods` always sums to the whole invoice, and there are tests for exactly that. A partial scope prints its own subtotal, is stamped "partial issue", and deliberately does **not** carry the discount or the payment (those belong to the whole invoice).
- **detail** — `detailed` / `summary`, via `summariseLines()`. Summary gives each generator **two lines — one for corrective visits, one for routine visits** — carrying the total quantity for the period, with no per-fault references. Grouping keys include the unit price, so a mixed rate splits into separate lines and the summary total always equals the detailed total (there is a test for exactly this).
Both flow through `documentLines()` / `documentTotals()` into `invoiceReportBody(inv, scope, detail, prices)`.

### Printing with or without prices
Every printed document takes a `prices` mode (`DOC_PRICE_MODES`, `showPrices(mode)`), offered as a **Prices** dropdown on the invoice card, on each corrective card, and once in the Reports tab (where `reportPricesMode()` reads the selector from the DOM so `buildReportTable()` keeps its signature — absent selector, as in the tests, means "with prices"). Every entry point defaults to `'with'`, so existing calls and saved data are unaffected.
- **Corrective report / pack:** `faultBillingReportBlock(c, prices)` swaps the four-column costed table for an items-and-quantities table headed "Items and materials used", drops the service-fee row (a money concept), and omits the block entirely when the record has no parts. The pack cover hides its billable total.
- **Invoice:** the money columns, the totals box, the bank block, the currency field and the payment terms all drop out, and the document is **retitled "Delivery / Work Note"** — an unpriced page headed "Invoice" would be misread by a client — while keeping the same document number, the items, the quantities and both signature blocks.
- **Reports tab corrective table:** the billable-total and invoice-number columns drop from the PDF/Excel/CSV export.

Invoice header carries `orderNo`, `contractNo` (FRA/contract), `serialNo` and `ref` alongside the serial `invoiceNo`. Bank details for payment print at the foot of every document from `bankAccounts()` (`settings/billing.bank1Name/bank1Acct/bank2Name/bank2Acct`).

Lines also carry `genId`/`genName` — that is what lets a summary invoice group by genset. Old lines without them still summarise (they fall into an unnamed group); never assume the field is present.

Money: always go through `round2()` / `moneyNum()` / `money()`; never print a raw float. Currency comes from `billingCurrency()`.

**Backward compatibility is a hard requirement here.** Faults saved before billing existed have no `serviceFee` and no `partsLines`; they must keep working and fall back to the configured rate. `test_billing.js` has an "Existing records keep working" section — keep it passing.

`seed_pricelist.js` loads the 39-item catalogue from the FAO financial proposal into `pricelist` (idempotent, matched on English name; `--update` also corrects prices). It needs the published rules.

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
- `test_billing.js` — price list, corrective vs routine rates, fault/service billable totals, service-visit grouping (nesting billed once), editable quantities, scope (services/goods/both) and summary grouping, invoice numbering/totals/discount/balance, payment status transitions, overdue detection, double-billing protection, receivables summary, bank + header fields on the document, backward compatibility with pre-billing records, and the report/backup exports
- `simulate_firestore.js` — auth, two-device sync, permission-denied diagnostics

Run all: `for f in simulate_firestore test_reports test_maint test_duedate test_corrective test_svclog test_labels_customfields test_billing; do node $f.js; done`
(The suites read `/home/claude/generator-readings.html`; symlink it there if your checkout lives elsewhere.)
All suites must print `0 failed`. If you add a feature, add tests for it.

For UI changes, a Playwright headless check at 412×892 (mock Firebase, since the real one is network-gated in CI) catches overflow/console errors. See `firebase_mock_init.js` for the seed/mock.

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
