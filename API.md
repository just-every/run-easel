# Easel HTTP API

## Committed spend

Spend routes require a native company-wide finance session with the connections capability. API tokens and agents are refused. `GET /api/easel/connections/spend/:provider` reads masked status for `ramp`, `brex`, `purse` or `coaster`; POST its `connect` action with `{key,consent:true}` or `disconnect` with `{}`. Remote revocation is unsupported and the response supplies the explicit provider owner step.

`POST /api/easel/spend/sources` takes `{month,providers,orders:["Purse PO ID"],reports:["Coaster report ID"]}` and reads only the selected providers. Card reads select the accounting month; `allPeriods:true` reads the bounded source response for explicit recurring allocation. Purse and Coaster require scoped record IDs. `POST /api/easel/spend/preview` takes `{scenario,revision,driver,month,orders,mapping}`. Each mapping is `{source:"ramp:ID"|"purse:ID",line,department,month,order?:"linked Purse PO ID"}`. Choose a dedicated one-off expense in an open working company forecast, or a recurring expense with a complete monthly allocation. Every source maps explicitly to its line, department and month. Preview returns exact minor-unit `budget`, `committed`, `actual`, `remaining`, `forecast`, the reviewed rows and `fingerprint`, without changing the forecast.

A provider mapping may mark an explicit overlap with `duplicateOf` and a decimal `duplicateAmount`. Without an amount, both actuals must have equal whole values. The target must be an independent actual from another provider with the same PO. To split one representation across several payments, use `duplicateMatches:[{source,amount}]` instead. Each source retains its unmatched remainder as actual. Combined matches cannot exceed either representation, and a source that declares duplicates cannot receive them. Matching a ledger row to a provider actual is limited to that provider row's remainder after these duplicates are removed.

For recurring reviews, pass ordered `months` and give every source an `allocations` object of decimal amounts for every selected month. Duplicate parts use `duplicateAmounts` with `duplicateOf`, or `amounts` within each `duplicateMatches` item. Every matched period must be named; matches never move an amount into another period. Changed allocations, match amounts, source evidence or forecast revision require a fresh preview. The response retains `duplicateMatches`, `duplicateAmount` and `countedAmount` in integer minor units for each reviewed row and cell.

`POST /api/easel/spend/accept` repeats the exact reviewed body plus `fingerprint`. It re-reads providers, fences source and model changes, replaces only the reviewed expense months and records the review. `GET /api/easel/spend` lists accepted reviews with `forecastChanged` when the forecast has moved since acceptance. See [committed spend](./docs/committed-spend.md) for boundaries and source qualification still owed.

The same routes serve the app and integrations acting under a person's authority.
Use a native session cookie (and a same-origin `Origin` header for writes), or
a scoped personal/service bearer token as documented below. Responses are JSON; refusals are
`{ "error": "..." }` with 400, 401, 403, 404, 409, 413, 425 or 429. A 409 means the plan
or the person's access changed (reload and decide again) or a reviewed
revision or fingerprint no longer matches.

## Reads

| Route | Returns |
|---|---|
| `GET /api/easel/state` | The person and role, workspace, lines, departments, scenarios they may see, submissions, comments, and (finance) people, mappings, imports and activity-free lists of snapshots and packs |
| `GET /api/easel/scenario/:id` | The scenario, its inputs the person may see, and its calculation: every cell (line, department, month, amount, basis, sources with traces), line totals, profit, cash and warnings |
| `GET /api/easel/compare?a=&b=` | Monthly profit and cash of both, changed inputs, changed cells |
| `GET /api/easel/snapshot/:id` | An approved budget, named reforecast, kept forecast or published pack exactly as stored, with its SHA-256 (filtered by role) |
| `GET /api/easel/variance/:month` | For a closed month: actual, budget, kept forecast, variance, accepted rows, budget sources, hypotheses, draft and saved explanation per line and department; `versions` metadata and each row's `comparisons` include budget, every named reforecast and current forecast |
| `GET /api/easel/actuals` | Finance: month-by-month reconciliation and unmapped accounts |
| `GET /api/easel/activity` | Finance: filtered activity events, up to 300 per page, with before/after values and attribution |
| `GET /api/easel/pack/:id/document.html` · `.csv` · `.xlsx` · `.pdf` · `.pptx` | A published pack, rendered from its snapshot (the PDF's bytes depend only on the snapshot) |
| `GET /api/easel/pack/:id/preview` | A draft pack's live numbers and whether they moved since it was generated |
| `GET /api/easel/forecast-learning/:scenario` | Finance: every kept forecast against what closed (timing, driver, permanent), measured close-date, hire and collection-lag misses and their backtests (AGENT-004) |
| `GET /api/easel/dataset/:dashboard?format=json\|csv\|parquet\|xlsx` | A saved report as a flat, read-only dataset for BI tools, under the reader's own access (REPORT-007) |

`state` and `variance` include `actorNames`, a contextual email-to-name map from
the installation's native directory, limited to emails already visible in that
response. Like `me`, it is not portable state: restore retains historical
attribution and snapshot names, but does not import native identities, sessions
or credentials. A missing directory entry is omitted from the map.

## Commands: `POST /api/easel/command/:op`

Amounts are decimal strings ("12000.50"), percentages decimal percent ("12.5"),
months `YYYY-MM`.

- Setup (finance): `workspace` {name, currency, fiscalYearStart, planStart, horizon?:12..60, calendar?:calendar-month|4-4-5|5-4-4, retailStartDate?:YYYY-MM-DD}; `department` {id?, name, shared}; `department-delete` {id}; `line` {id?, name, type: revenue | cost-of-sales | operating-expense, payroll}; `line-delete` {id}; `member` {email, name, role: finance | contributor | viewer, departments, active}; `account-map` {account, target: lineId | excluded | cash | bs:receivables | bs:prepaid | bs:fixed-assets | bs:payables | bs:accrued-liabilities | bs:deferred-revenue | bs:debt | bs:equity}; `department-map` {source, department}; `account-rule` {id?, match: range | prefix | type, from, to? (range), target: lineId | excluded | cash | bs:receivables | bs:prepaid | bs:fixed-assets | bs:payables | bs:accrued-liabilities | bs:deferred-revenue | bs:debt | bs:equity}; `account-rule-delete` {id}.
- Inputs (finance, or a contributor in scope): `revenue` {scenario, id?, name, kind: volume | customers | seats | usage | services | milestones | backlog | contract, line, department, start, collectionLag, startVolume, growthPercent, rate | startCustomers, newPerMonth, newPerRep, repDepartment, rampMonths, churnPercent, arpa}; `position` {scenario, id?, title, holder, department, line, start, end, annualSalary, onCostPercent}; `expense` {scenario, id?, name, line, department, kind: recurring | one-off, amount, start, end}; `schedule` {scenario, id?, name, line, department, values: {month: amount}}; `allocation` {scenario, name, sourceDepartment, basis: headcount | fixed, targets: [{department, percent}]}; `input-delete` {kind, id}; `scenario-cash` (finance) {scenario, basis: estimate | imported, opening, receivables, payables, collectionLag, paymentLag, note}.
- Scenarios: `branch` (finance) {from, name}; `scenario-adopt` (finance) {from, into, revision}; `scenario-delete` (finance) {id}; `proposal-create` {from, name, request}; `proposal-submit` {id, summary}; `proposal-promote` (finance) {id, revision}; `proposal-decline` (finance) {id, reason}.
- Private scenarios (CYCLE-004): `sandbox-create` (planner) {from, name}; `scenario-share` (creator) {scenario, revision, email, mode: read | edit | remove}; `sandbox-submit` (creator) {scenario, revision, request, into?, targetRevision?}; `scenario-official` (finance) {scenario, revision, official: budget | forecast | board-case | ""}. A sandbox has no implicit finance bypass. Named shares retain current role/department/pay limits; viewers cannot receive edit. Submission copies into an exact-revision proposal and preserves the sandbox. Official designations are metadata on company-visible plans, never approval. Private definitions are omitted from unseen Activity and open-file export records; owner CLI backups keep full installation custody. Group shares arrive with ACCESS-001.
- Reporting currency (finance, ENTITY-002): `fx-rate` {month, budget?, average?, monthEnd?, reporting?}: decimal strings above zero with at most six places (reporting-currency amount per one plan-currency unit); an empty string clears one rate; reporting defaults to USD and cannot equal the plan currency. `GET /api/easel/translation/:scenario` reads that scenario's profit and loss at average rates, balance sheet at month-end rates and translation adjustment with each unavailable month named; `GET /api/easel/translation-variance/:month` reads a closed month's budget, actual, actual at the budget rate, variance, constant-currency variance and currency effect (integer minor units of the reporting currency).
- Cash health (finance): `cash-constraints` {floor, runwayMinimum}; both are nonnegative decimal strings (currency units and months). The agreement records currency, person and time on the workspace. Scenario reads return `cashHealth`, and comparisons return it on each side; the current agreement checks saved cash without rewriting frozen snapshots. Burn is in cents, runway is in hundredths of months, and null runway means nonpositive average net burn, with its basis distinguishing not-burning from cash-exhausted. A negative finite runway is the signed cash/burn ratio and means cash is exhausted. The trailing window is the current and up to two preceding available months; checks use the exact ratio before rounding and equality meets a minimum. Cross-currency checks are not assessed. Scenario and comparison XLSX downloads include Cash health sheets.
- Cycle: `forecast-window` (finance) {scenario, revision, months: 12..60}; `request-submissions` (finance) {scenario, departments, due}; `comment` {scenario, department, text}; `submit` {scenario, department}; `return-submission` (finance) {scenario, department, reason}; `approve-budget` (finance) {scenario, revision, note}; `close-month` (finance) {scenario, month}.
- Imported subledger openings (finance): `ledger-allocation` {scenario, revision, month, target: bs:prepaid | bs:accrued-liabilities | bs:deferred-revenue | bs:fixed-assets, allocations: [{originId, amount, remainingLifeMonths?}]}. Month must be the last closed month; allocation amounts must equal the accepted target balance to the cent. Payroll/bonus allocations require existing Pay detail authority. Prepaid origins need remaining service on an already paid schedule; accruals need an entered future settlement; deferred revenue needs a contract with remaining service; assets need explicit remaining life. Source changes invalidate the review. Unallocated balances are disclosed as incomplete. Allocation inputs remain in owner archives and are omitted from member responses; role-filtered schedules retain their source traces. See CONNECT-007 for exact recognition and cent rules.
- Review: `explanation` and `explanation-confirm` {month, line, department, text}; `pack-create` (finance) {month}; `pack-decision` (finance) {pack, text, owner, due}; `pack-publish` (finance) {pack}; `action-status` (finance) {pack, decision, status, note}. `pack-decision` also takes `proposal`, a proposal promoted into the pack's forecast after effect capture (AGENT-006).
- Commentary citations (AGENT-007): `explanation` optionally takes `citationIds`, an array of at most 100 accepted-row IDs from that variance row’s `citations[].id`. IDs must be visible to the writer in the same month/line/department; duplicates are stored once. Confirmation and pack publication recheck saved IDs against current source visibility; changed references refuse publication with 409. Omitting the field saves human commentary without structured citations. MCP exposes the same optional field and validation. These checks validate source membership, not narrative truth. New published packs include confirmed non-pay commentary only; confirming later leaves earlier packs unchanged.
- Board packs (REPORT-003): `pack-template-save` {id?, name, sections: [statements | kpis | charts | commentary | decisions | appendix]}; `pack-create` {month} or {period: "quarter", month, template?}; `pack-refresh` {pack}; `pack-publish` {pack, fingerprint?} refuses 409 when `fingerprint` (from `preview`) no longer matches. `POST /api/easel/pack/:id/save` {store: chest | drive | sharepoint} uploads the published PDF once per store from a signed-in finance session; stores are connected with `POST /api/easel/connections/pack-stores/:store/connect|disconnect` (credentials are sealed and never returned).
- Forecast learning (AGENT-004): `deal-outcomes-save` {rows: [{deal, name, plannedClose, actualClose, contract?, invoiceDate?, paidDate?, amount?}]} and `deal-outcome-delete` {deal} (finance); `learning-propose` {scenario, measure: close-slippage | hire-slippage | collection-lag, evidence} creates a draft proposal citing its backtest; the forecast changes only when finance submits and promotes it.
- Warehouse metrics and BI (REPORT-007), signed-in finance: `POST /api/easel/warehouse/:snowflake|bigquery|databricks/connect|disconnect`; `POST /api/easel/warehouse-command/:op` with `warehouse-query-save` {id?, revision?, name, warehouse, metric, sql}, `warehouse-query-preview`, `warehouse-query-approve` {id, revision, fingerprint}, `warehouse-refresh` and `warehouse-query-delete`; a usage revenue driver takes `warehouseMetric`. `bi-drop-save` {id?, revision?, dashboard, store, audience, formats: [csv, parquet], hour, enabled?} and `bi-drop-delete` {id, revision} schedule nightly drops; `GET /api/easel/bi-drops` lists drops and runs.
- Decision follow-up (AGENT-006): `action-revise` (the action's owner or finance) {pack, decision, due, reason}; `action-stop` (owner or finance) {pack, decision, reason}; `decision-change` (owner or finance) {pack, decision, text?, proposal?, reason} stays pending until `decision-change-decide` (finance) {pack, decision, change, approve, note?}. `GET /api/easel/decisions` lists every published decision with its current text, due date, status, chases, history, pending changes and, when it cites a promotion, `outcome` (per effect month `before`, `approved` and `realized` payroll, revenue, cash, headcount and capacity, plus `payrollSaving`). The scheduled handler chases open actions from three company-zone days before they fall due.

## Move-in kits: `POST /api/easel/import/:kit/:op` (finance)

- `actuals`: `preview` {csv, filename, columns, amountMode, dateFormat, allowRepeats}; `commit` {…same, fingerprint, acknowledgeRejected}; `resume`, `undo`, `status` {id}.
- `workbook`: `preview` {base64, filename, sheet?, lineMap?, departmentMap?}; `commit` {…same, fingerprint}; `resume`, `undo`, `status` {id}.

`POST /api/easel/invite` {email} (finance) sends a person their sign-in invitation through Base.

The rolling window keeps that many future months after the last close. Closed months remain visible. Each close snapshots the current forecast before extending its end from the existing drivers. Budgets keep their fixed horizon.

## MCP

Agents can use the native-session [MCP endpoint](docs/mcp.md) at `POST /api/easel/mcp` for filtered reads and proposal, comment and explanation tools. Approval, close, publication and promotion stay with people.

## Model audit trail (AUDIT-001)

Finance reads `GET /api/easel/activity` with optional exact `actor` (email), `record` (ID), `scenario` (ID), and inclusive `from` / `to` dates (`YYYY-MM-DD`). Results are newest first, up to 300 rows; pass the last row's `seq` as `before` to read older rows. `GET /api/easel/activity.csv` accepts the same filters and exports all matching rows.

`record-changed` rows hold the record kind, complete before and after values (null for creation/deletion), and native record revisions in `detail.beforeRecordRevision` / `detail.afterRecordRevision`. Semantic events retain scenario revisions in `beforeRevision` / `afterRevision`. `detail.authority` identifies a person or MCP agent and its transport; `actor` always identifies the person whose authority was used. Import and undo changes enter the same append-only trail inside the authorized journal batch. The complete trail survives `rer export` and restore.

## Integration tokens (API-001)

A signed-in member manages their own tokens through these session-only routes:

- `GET /api/easel/tokens`: safe metadata, expiry and revocation state; no bearer values or hashes.
- `POST /api/easel/tokens/issue`: `{ "label": "Finance reporting", "kind": "personal", "scope": "read", "expiresInSeconds": 86400 }`. Kind is `personal` or `service`; scope is `read` or `write` (includes reads). Lifetime defaults to one day and must be between one second and 365 days. The response contains the bearer `token` once.
- `POST /api/easel/tokens/revoke`: `{ "id": "the-issued-id" }`. Only the issuing person can list or revoke their credentials.

Issuance uses Base's fresh identity proof. If it returns `step_up_required`, request `POST /auth/step-up` with `{ "action": "credentials:mint", "returnTo": "/app" }`, follow and confirm the emailed link in the same browser session, then issue again. Key-gated local developer sessions already satisfy this proof.

Integrations send `Authorization: Bearer <token>` to the existing Easel read and command/import routes. They do not send session cookies or an `Origin` header. Read tokens cannot make POST requests. A supplied invalid bearer is refused even if the request also carries a valid session. Token administration, invitations and MCP require the native signed-in session; MCP's proposal-only tools remain documented separately in `docs/mcp.md`.

Tokens retain the issuer's role at issuance, intersect their original departments with today's grants, and resolve current membership on every request. A role change, deactivation, native operator-version change, expiry or revocation removes access; later department additions never expand an existing token. Named service tokens are labelled as agent work under their issuer's authority. They may edit a working forecast horizon under the issuer's current company-wide planning grant and original token ceiling; approval, month close, publication, promotion and connection administration remain refused to agents. Writes and import journal batches recheck the live credential and revision fence atomically, so stale revisions still return 409.

Each credential has a durable limit of 120 requests per minute. Excess requests return 429 and `Retry-After` in seconds. Successful requests, refused actions and rate-limit refusals record the credential ID, safe label, method, path and outcome in the append-only activity trail; raw bearer values never enter that trail. Base credentials, token metadata and rate counters are excluded from `rer export`, so restored installations require new tokens.

### Spreadsheet exports (SHEET-004)

Signed-in members may download `GET /api/easel/scenario/:id/document.xlsx` (optional `department`), `GET /api/easel/compare.xlsx?a=:from&b=:to`, `GET /api/easel/variance/:month/document.xlsx`, and `GET /api/easel/pack/:id/document.xlsx`. Scenario access and server-filtered detail are identical to JSON reads; published packs use their immutable snapshot. Finance may also download `/api/easel/actuals.xlsx` and `/api/easel/activity.xlsx` (the same filters as activity CSV, all matching pages). Each current statement has its own sheet; amounts are labelled integer minor units and formulas hold cached results and recalculate on open. Scenario CSV is `/api/easel/scenario/:id/document.csv`; existing pack HTML/CSV and activity CSV remain.

### Open plan export (PORT-001)

Finance downloads `GET /api/easel/export` as a ZIP of CSVs for all product and import-journal tables (existing credential exclusions remain), `model.json` with record/schema definitions and units, a formula XLSX per scenario, every immutable snapshot as JSON, and custody-verified retained originals. `manifest.json` lists inventory and each payload file's byte size and SHA-256; missing retained originals are labelled unavailable. The manifest does not hash itself. CSV blobs are JSON base64 objects and text that could execute as a spreadsheet formula is apostrophe-prefixed; JSON definitions and original bytes retain exact data. The normal native-session/revision fence prevents a changed plan from completing its export. `rer export` continues to supply the restorable archive.

### Fixed assets (FIN-004)

Create a non-cash expense line with the normal `line` command (`nonCash: true`). The `asset-category` command accepts `scenario`, `name`, and whole `usefulLifeMonths`; its `originId` is the `asset` command's `category`. Asset inputs accept `name`, `department`, the non-cash expense `line`, `kind` (`purchase` or `existing`), `cost`, `start`, optional purchase `paymentMonth`, and optional `disposalMonth`/`disposalProceeds`. Existing assets start at the first plan month and additionally accept `openingAccumulated` and `remainingLifeMonths`. Money inputs use decimal currency strings. Updates use `id`; deletion is `input-delete` with `kind`. A used category cannot be deleted. All normal scenario edit and department fences apply; category changes require finance.

Scenario reads include `calculation.assets`: each asset/month's pre-depreciation book value, depreciation, disposed book value, closing book value, capex cash, disposal cash and non-cash expense. Exact cent rounding and disposal-month semantics are in CONTRACT.md. Asset details use the same department filtering as other inputs. MCP offers `asset-category` and `asset` only inside the caller's own draft proposals; promotion remains a human finance action.

### Native formulas and driver lines (MODEL-004)

`POST /api/easel/command/formula` accepts `scenario`, its reviewed `revision`,
`name`, `department`, `unit` (`money`, `count` or `percent`) and either a scalar
`formula` or a `dimension` with `members: [{name, formula}]`. Optional `id` edits
an existing definition; `start` defaults to the plan start and `end` is optional.
A money driver can supply an output `line`; member outputs sum into that line.
`collectionLag` sets revenue collection timing. Use `input-delete` with
`kind: "formula"` to remove an unused definition. Invalid dependencies, cycles
and stale revisions refuse the whole save.

Expressions use decimal literals, `+ - * /`, comparisons `= <> < <= > >=`,
lazy `IF(test,yes,no)`, `MIN`, `MAX`, `ROUND(value,decimalPlaces)` and
`GROWTH(value,percent)`. Percent arguments use percentage points: 10 means 10%.
Every numeric value is an integer in hundredths; each division, including the
scale division for multiplication, rounds half away from zero. Thus
`1.25 * 3.33 * 100` produces 416.00. Native formulas use this arithmetic;
imported workbook formulas retain their separately documented workbook rules.

`DRIVER("Customers")` reads a named driver, `PRIOR("Customers",1)` its prior
period, and `DRIVER("Customers",-2)` two periods earlier.
`LOOKUP("Cost per ticket","Region","West")` selects a member;
`MEMBER()` gives the current member inside a dimensional definition, and
`SUM("Support by region","Region")` sums its members.
`LINE("Subscriptions","Sales",-1)` reads a final planning line by department.
`ACTUAL("Subscriptions","Sales",-1)` reads accepted actuals, and
`VERSION("Budget","Subscriptions","Sales",-1)` reads another version.
Offsets are optional and default to zero. `PERIOD()` is one-based and can seed
a recurrence: `IF(PERIOD()=1,100,GROWTH(PRIOR("Customers"),10))`.
References bind to stable identities when saved; source renames do not retarget
them. Missing sources are refused, including missing actuals; an accepted zero
remains a valid source.

Scenario reads expose filtered `inputs.formula` definitions and
`calculation.formulaValues` with each driver's month, optional member, integer
`value` and exact `trace`. Output sources also appear in ordinary planning
cells. Formula cells are read-only in the grid. Changes enter the existing
structure-version trail and proposal comparison; approved and saved versions
retain their captured definitions and arithmetic. The MCP `formula` tool uses
the same fields, with revision as a string, inside the caller's own draft
proposal. Existing department, Pay detail and scenario authority apply to
both destinations and referenced sources.

### Named reforecasts (`CYCLE-005`)

Finance calls `POST /api/easel/command/reforecast-save` with `{from, revision, name}` for a working forecast or scenario. The reviewed revision must still match (409 otherwise); the source stays working and unchanged. The result is a new frozen `reforecast` scenario with `reforecast.snapshot`, source lineage and saved revision. Names are trimmed and case-insensitively unique among reforecasts. It is readable through the existing scenario, comparison, snapshot and spreadsheet routes; branch it to make changes. Captured structure, inputs and arithmetic are read from the immutable snapshot, including after the source is deleted and after restore.

`GET /api/easel/variance/:month` adds `versions: [{id,name,kind,revision,currency,snapshot?}]` and row `comparisons: [{id,amount,variance}]`. Values use integer minor units; variance is actual minus version. A month outside a captured horizon returns null amount and variance; a currency mismatch returns null variance. The current forecast uses accepted actuals for closed months. The Excel variance workbook includes a Version comparison sheet. New published packs capture the same version columns and values for immutable HTML, CSV and Excel downloads.


### CYCLE-006 annual strategy

`GET /api/easel/long-range` lists named annual plans for members. `GET /api/easel/long-range/:id` returns its definition, linked operating-budget revision (and approval digest when frozen), five or fewer annual rows, traces and target gaps. `GET /api/easel/long-range/:id/document.xlsx` downloads the same aggregates with live formulas. No position-level inputs are included.

Finance saves through `POST /api/easel/command/long-range-save`:

```json
{
  "name": "Five-year strategy", "budget": "<budget-id>", "budgetRevision": 8,
  "years": 5, "priorYearRevenue": "1000000",
  "targets": {"growthPercent": "40", "marginPercent": "25", "headcount": 8, "cash": "1500000"},
  "drivers": [
    {"growthPercent": "20", "marginPercent": "30", "headcountChange": 2, "cashChange": "200000"},
    {"growthPercent": "10", "marginPercent": "35", "headcountChange": 1, "cashChange": "-50000"},
    {"growthPercent": "0", "marginPercent": "20", "headcountChange": -1, "cashChange": "30000"},
    {"growthPercent": "-10", "marginPercent": "-5", "headcountChange": 0, "cashChange": "-100000"}
  ]
}
```

For updates include `id` and the reviewed annual `revision`; also send the current `budgetRevision`. A stale revision returns 409 and changes nothing. `years` is 3–5; `drivers` has one entry per later year. Monetary command values are decimal currency units; returned amounts are integer minor units, rates basis points and headcount whole people. Growth is at least −100%, margin at most 100%, and projected headcount nonnegative. Year one sums the first twelve operating-budget months; headcount and cash are the year-end values. Later revenue compounds prior projected revenue, profit applies that year’s margin, headcount adds the entered change, and cash adds the entered net cash change independently of accounting profit. Each division rounds half away from zero once. Revenue targets compound prior-year revenue at the target growth rate; profit applies the target margin; headcount and cash targets stay fixed across years. Each gap is projection minus target. Working-budget edits flow through; approvals use captured arithmetic. A currency change requires finance to review and save assumptions in the new currency.

## Reusable mapping rules (CONNECT-006)

`state.accountRules` lists finance's rules. Exact account picks take priority.
Numeric ranges include both ends, treating leading-zero codes as integers;
prefix and source-type matches are case sensitive after trimming. Agreeing
rules resolve together; conflicting targets leave an account ambiguous.
CSV `columns.accountType` optionally selects source-type metadata.
Previews list each account's `target`, `ruleIds` and `mappingStatus`, and each
period's `blocked`, `unmappedAccounts` and `unmappedDepartments`. A rule or
metadata change invalidates the reviewed preview fingerprint.

Accepted reconciliation reports the same period completeness. Unresolved
accounts or departments (even zero-net groups) block dependent close, live
scenario, variance and publication calculations with 409; incomplete monthly
revenue/cost totals are null, never zero. Earlier complete-period reviews and
frozen snapshots remain readable. A whole-file commit still requires every
account and department to map, as EASEL-003 requires. Rules are planning
records included in open and installation exports. Balance-sheet targets and
custom dimensions still depend on CONNECT-007 and MODEL-003.

### Parallel month (`MOVE-004`)

Finance compares a closed month to the old tool before switching. Download
`GET /api/easel/parallel-month/template/YYYY-MM.csv` and replace its monetary
columns with the old tool's natural-sign decimal amounts in the reporting
currency. Headers are `line,department,actual,budget,forecast`; use the existing
planning IDs in the template, with a blank department for no department.
Missing rows on either side mean zero; unknown IDs and duplicate keys refuse
the entire file. No employee detail is needed.

- `parallel-month-preview`: `{month,name,filename,csv}`; writes nothing and
  returns rows, per-measure differences and a SHA-256. Forecast means the
  immutable forecast kept immediately before that month's close.
- `parallel-month-save`: the same body plus `fingerprint` from that preview.
  Recomputes before saving; changed contents require another preview.
- `parallel-month-classify`: `{id,revision,key,kind,explanation}`; `key` is a
  returned difference key; `kind` is `mapping`, `timing`, `formula` or
  `source-data`. The classification is finance's judgment, not an inference.
- `parallel-month-sign`: `{id,revision,sha256}`; requires all differences
  classified with explanations. Records signer/time and freezes the captured
  comparison; subsequent model edits leave it intact. It does not switch tools.

Commands use `/api/easel/command/<command>`. Finance alone can read
`GET /api/easel/parallel-month?month=YYYY-MM` (summaries) and
`GET /api/easel/parallel-month/:id` (full record including retained CSV).
Every write uses the current session and model revision fence. Stale content
or revision returns 409, unauthorized access 403, invalid CSV 400.

### Cash alerts (`REPORT-006`)

Finance saves `cash-alert-rule-save` with `{name,kind,intervalDays,enabled}`
(`intervalDays` 1 to 365 company-zone days, 7 when omitted).
`kind: "floor"` checks forecast months against the agreed cash floor
(`cash-constraints`); `kind: "below-plan"` takes `{basis:"amount",amount}` or
`{basis:"percent",percent}` and compares the latest closed month's forecast
cash on accepted actuals with the approved budget; `kind: "runway"` takes
`{runway}` in months. Edit with `{id,revision}`; a revision or disable ends the
rule's open alert. `GET /api/easel/cash-alerts` (finance only) returns
`{zone,checkHour,rules,alerts,checks}`; each alert lists its sends with
numbers, cause and recipients. `cash-alert-check` with `{}` checks explicitly
and returns `{sent,blocked}`; `cash-alert-acknowledge` takes `{id,revision}`.
Checks also run after accepted or undone actuals, closes and cash-floor saves,
and daily at 08:00 company time from the scheduled handler.

### Metric-triggered tasks (`CYCLE-002`)

Finance saves `metric-rule-save` with `{name,kind,owner,dueDays,enabled}`.
For `kind: "overspend"` supply `{department,percent,amount}`; both bounds
are strict, in the reporting currency. Spend is cost-of-sales plus operating
expense, including non-cash costs. For a nonpositive budget, positive actual
expense above the amount bound meets the percentage condition. For
`kind: "runway"` supply `{runway}` in months. Edit with `{id,revision}`.
Overspend owners must be active department contributors; runway owners active
finance owners/admins. Rules capture the currency and block after a mismatch.

`GET /api/easel/metric-tasks` returns `{rules,tasks}`. Only finance sees rules;
contributors see their own tasks while their department scope remains valid;
viewers get empty lists. `metric-task-complete` takes `{id,revision}` and is
allowed for finance or the current assignee. Tasks retain evidence and
attribution when complete; they grant no additional plan access.

Checks run automatically after accepted actuals refreshes and closes and on
rule save. Finance can call `metric-refresh` with `{}` to check explicitly;
it returns `{created,blocked}`. An open task is deduplicated by rule/month for
overspend or rule/forecast for runway; completion permits later retrigger.
Runway uses FIN-005's unrounded ratio and first future breach. Due dates add
whole UTC calendar days to trigger time. Source problems and unavailable
owners are recorded as blocked rules, never invented values. Tasks are
in-app work records; no email delivery is claimed. REV-001 inherits pipeline
coverage rules before its future pipeline source can ship.

### FIN-001 linked statements

Scenario reads include `calculation.balanceSheet` and `calculation.cashFlow` in integer currency minor units. These aggregate rows share the P&L horizon and are captured with new approvals and kept versions. `balanceDifference` is assets minus liabilities/equity; `cashDifference` and cash-flow `difference` compare indirect closing cash with direct cash. Each row explains its arithmetic; imbalance causes identify the month and source line without pay detail. Opening equity and other noncash reserves are labelled estimates. Financing inputs remain unavailable. Legacy snapshots remain unchanged and may have no statement arrays. Scenario Excel includes both statement sheets and live subtotal/reconciliation formulas; a department filter omits company-wide statements.

### REPORT-005 department statements

`GET /api/easel/department-statements?month=YYYY-MM` lists authorized statements (omit month for all months); `GET /api/easel/department-statements/:id` reads the captured amounts/source rows plus current open tasks and explanations. Finance reads all; active department contributors read their departments. `GET .../:id/document.xlsx` exports the same scoped data with formulas. Email links open `/app?departmentStatement=:id` and require sign-in.

A successful `close-month` queues statements in its fenced save and dispatches mail afterwards. The configured Base mail transport receives only each department's statement and its recipient address. `department-statement-retry {id}` lets finance retry pending/refused, suppressed or currently blocked recipients after rechecking membership and native-account status. Accepted messages are not resubmitted; uncertain/interrupted outcomes require external reconciliation and are not blindly retried. Provider acceptance is not mailbox delivery. Local development suppresses email.

Pack decisions accept an optional `department`. Finance can use `pack-action-department {pack,decision,department}` to classify an existing action; empty department explicitly unclassifies it. The metadata changes no published snapshot. Statements include only open published actions with an explicit matching department, plus current department metric tasks and outstanding submissions.

Model structure versions (MODEL-005) use the finance-only Activity door: `GET /api/easel/activity?action=structure-version`, with the existing actor/scenario/date/cursor filters and `.csv` / `.xlsx` exports. Each event retains exact field changes, captured global definitions and per-scenario moved cells. Amounts are integer minor units; absent sides and cross-currency differences are null.

Finance-only planning inputs (FIN-003): `POST /api/easel/command/debt` and `/equity` use the existing scenario/revision/session-fenced save and `input-delete`. Debt accepts `name`, `debtKind` (`term`, `credit`, `venture`), expense `line`, `department`, `start`, `maturity`, decimal `opening` and credit `limit`, `rateKind` (`fixed`, `variable`), `annualRate` or named `baseName`/monthly `baseRates` plus `spreadPercent`, monthly `draws`/`repayments`, `amortization` (`interest-only`, `equal-principal`), `amortizationStart`, `termMonths`, and optional `covenants` (`minimumCash`, `minimumLiquidity`, `maximumLeverage` as a ratio, e.g. `3`). Equity accepts `name`, `month`, positive decimal `amount`. Update adds `id`; every input names `scenario`. Rates and amounts are decimal strings; stored amounts are cents, rates and ratios are basis points. These commands plan funding and never execute a payment. MCP exposes these only in finance's own draft proposals.

Scenario `calculation.financing` contains monthly totals, covenant outcomes and (finance only) instrument/equity schedules and traces. Members and pack downloads omit individual terms; all statement and financing worksheets use the same filtered, captured data. Covenant arithmetic and timing are specified in CONTRACT.md FIN-003.

## Fixed revenue forms (REV-003)

All forms use the existing `revenue` command and shared `scenario,id?,name,line,department,start,collectionLag` fields. New decimal-string fields are: `seats` → `startSeats,expansionPercent,price`; `usage` → `startUsage,growthPercent,unitPrice`; `services` → `monthlyHours,utilizationPercent,hourlyRate`; `milestones` → `milestones:[{name,month,amount}]`; `backlog` → `openingBacklog,monthlyAdditions,burnPercent`. Services uses active positions in the revenue department, inclusive of start/end, at the entered monthly available hours and hourly bill rate. Backlog additions arrive at each month's start, before that month's capped recognition. Seats/usage first grow in the month after their start. Every division rounds half away from zero; monthly service factors divide only once. Traces and existing filtered CSV/Excel expose the same arithmetic. These are entered planning assumptions: Gauge/Harvest utilization pulls and user-defined formula-line revenue remain the gaps recorded in CONTRACT.

## Dashboards (REPORT-002)

`GET /api/easel/dashboards` lists authorized definitions; `GET .../dashboards/:id` returns aggregate monthly `rows`, effective `widgets`, `layoutRevision`, currency and labels. `GET .../:id/document.xlsx` repeats access checks and exports formula metrics without pay detail.

Finance creates `dashboard-save {name,scenario,department,audience,widgets:[{metric,display}]}`; changes include `{id,revision}`. A creator alone edits/deletes their definition (`dashboard-delete {id,revision}`). Audiences are `private` (creator), `leadership` (finance), `board` (viewer), `department` (current department contributors; requires department). Company-visible plans only. Metrics: `revenue,grossMargin,headcount,arr,burn,runway,closingCash`; displays: `tile,chart,table`, each metric once. Definitions use the normal model/session fence.

Every authorized reader may save `dashboard-layout {dashboard,revision,definitionRevision,widgets}`, a complete permutation of configured metrics with personal display choices. This never edits the shared definition. Stale revisions return 409. Membership and audience changes remove list/read/layout/export access immediately. Unavailable cash or ARR has null values and explicit bases; units and calculations are specified in CONTRACT.md.

## Actuals-based planning (MODEL-009)

The `schedule` command accepts either entered `values` or `history:{sourceLine,sourceDepartment,offset,window,growthPercent}`. An offset of12 and window1 reads the same month last year; offset1/window3 reads the preceding three months. Percentages are decimal strings; normalized growth uses basis points. Both target and source follow the person's current department authority. Missing cells, unresolved historical mappings or incomplete consumed imports return409 without writing.

Finance calls `budget-from-actuals {name,growth:{lineId:percent}}` to create a genuine alternative budget of editable prior-year schedules. It does not change the existing operating pair. Budget cycle selects an alternative explicitly for requests/approval. Grid schedule writes include `scenarioRevision`; a stale save returns409. Scenario views include aggregate `actualsHistory:{cells,months,missingMonths,blockedMonths}`; no amount is invented for a missing cell. Frozen versions retain captured overlays; older versions identify overlays that were not captured. Scenario Excel includes an Actuals history sheet with live scenario-minus-actual formulas.

### Planning grid (MODEL-008)

`grid-preview` and `grid-save` accept `{scenario,revision,changes:[{schedule,month,value?,note?,subrows?:[{name,amount}],address?}]}`. Monetary inputs are decimal strings. A split derives its total when value is omitted; explicit value must equal its split sum. Existing notes/splits persist when omitted; pass an empty subrows array to clear a split. Selection operations use `{scenario,revision,operation,cells:[{schedule,month}],amount? ,percent?,value?}`: even/proportional/prior-year spread an amount; percent changes each cell; amount adds a signed delta; copy assigns value. Preview returns normalized integer-cent changes, refused addresses and a fingerprint, without writing. Save repeats the original request with that fingerprint; invalid cells refuse the whole save. All operations enforce current scenario/department/submission authority. Missing prior-year cells and driver/closed cells are refused. `grid-undo {scenario,revision}` restores the last grid save while its revision is still current; it never overwrites later changes. Exact rounding and source-weight semantics are specified in CONTRACT.md.

### Starter models (MODEL-006)

Before company setup, finance calls `starter-model {name,starter:saas|services|project|wholesale,planStart:YYYY-01,openingCash?}`. The command creates the USD workspace, budget, department/line definitions, editable inputs, cash timing and leadership dashboard in one fenced save. Values are labelled starter assumptions. Existing companies refuse this command. Linked `expense` forms add `kind:acquisition` with `{revenueOrigin,cac}` or `kind:inventory` with `{revenueOrigin,unitCost,inventoryDays}` to the usual `{scenario,id?,name,line,department,start}` fields. The original revenue driver must be in the same scenario and department: customer drivers feed acquisition cost, units × price drivers feed inventory COGS. Linked revenue cannot be removed or moved to an incompatible kind/department until its cost links are removed. Plan exposes these same assumptions as editable forms. Calculation inventory aggregates, statement inventory assets and inventory cash adjustments retain the normal server-side detail filtering and frozen arithmetic. CONTRACT.md specifies the stock buffer and purchase/payment arithmetic.

### Gauge operational utilization (REV-003, CONNECT-010)

The installation owner configures `GAUGE_ORIGIN` (HTTPS; HTTP loopback only in local mode). In Settings → Connections, finance stores an owner-created Gauge `utilization:read` key. Easel encrypts it with AES-GCM using a purpose-derived installation key, keeps it outside model rows and both export formats, and shows only its final four characters. Disconnect deletes local custody; the Gauge owner revokes the provider key in Gauge Access because read keys cannot administer keys. Reconnect after restore. Never enter a native session cookie.

All following doors require a native finance session and the ordinary origin/session/revision fences:

- `GET /api/easel/connections/gauge`: masked connection metadata.
- `POST /api/easel/connections/gauge/connect` `{key}`; `POST .../disconnect` `{}`.
- `POST /api/easel/connections/gauge/check` `{month}`: explicitly read a calendar-month aggregate and record health, row count, errors and rate limits without importing utilization.
- `POST /api/easel/gauge/preview` `{scenario,driver,month,scenarioRevision}`: no-write preview of the entire Gauge agency's complete calendar month.
- `POST /api/easel/gauge/accept` with those same fields plus the reviewed `digest`: refetch, compare and apply once; changed inputs return 409.
- `POST /api/easel/gauge/undo` `{scenario,driver,scenarioRevision}`: restore the preceding import while its resulting scenario revision is still current.

Gauge supplies participant count, available and approved-billable seconds, inclusive dates and an observation timestamp. Missing capacity blocks import. The selected services driver receives the entire agency aggregate; each scenario/month can map to only one driver. Revenue is approved billable seconds × the reviewed planned hourly rate / 3600, rounded once to cents. Labels explicitly distinguish these operational actuals from ledger revenue; closed ledger values take precedence. Later forecast months keep their entered assumptions. No scheduled refresh is claimed (CONNECT-005).

Disconnect posts the stored key to Gauge `/api/gauge/keys/revoke` at its original configured origin, without following redirects or retrying. The local sealed key is deleted whether Gauge confirms or not. Status and Activity retain the confirmation outcome and HTTP status without the key or provider response body. Unconfirmed revocation shows "Gauge did not confirm revocation; revoke it in Gauge Access". Native finance, origin and model/session fences apply.

## Contract revenue (REV-004)

The existing `revenue` command accepts `kind: contract` with the shared `scenario,id?,name,line,department,start` fields, plus `startDate` (YYYY-MM-DD in the start month), `contractValue` (decimal money), `termMonths` (whole 1–120), `billingCadence` (`monthly`, `quarterly`, `annual`) and `dsoDays` (whole 0–365). `annual` means annual upfront billing. The legacy collection lag does not control contract cash. Existing scenario/department and proposal authority applies.

Scenario `calculation.contracts` contains monthly bookings, billings, earned revenue, collections, billed receivables, deferred and unbilled revenue; invoice dates/collection dates and detailed contract rows follow existing department filtering. Total cents are conserved over service-month installments, with the final installment taking the remainder; calendar recognition allocates each installment by exact UTC service days and puts its remainder in the final segment. Invoice dates follow clamped monthly anniversaries, and collection occurs exactly DSO days later. These are planning schedules, never issued invoices or verified cash receipts. Frozen versions capture their schedules and arithmetic. Accepted closed-month P&L wins; `actualsIssues` and cash/statement `incompleteReasons` disclose unresolved allocation when invoice actuals are absent.

## FIN-002 working-capital assumptions

Revenue accepts `collectionMethod: "dso"` with integer `dsoDays`, or `"curve"` with `collectionCurve: [{days, percent}]` totaling exactly 100%. Noncontract invoices are assumed dated at month end; contract curves use each contract invoice date. Days are exact calendar days. Curve cents use largest remainder with earlier installments winning ties. Existing monthly lag applies when neither option is entered.

Vendor expenses accept `paymentMethod: "dpo"` plus `dpoDays`, or `"terms"` plus `paymentTermDays`, after the assumed month-end invoice. `expense` kind `prepaid` accepts total `amount`, `amortizationMonths` and optional `paymentMonth` (at/before service `start`). Kind `bonus` accepts the quarterly total `amount` and first `payMonth`; it accrues over each three-month quarter and settles at that month end, repeating every three months. Both use floor ordinary installments and put the cent remainder in the last installment.

A cash, non-payroll `expense` of kind `one-off` also accepts `paymentMethod: "date"` with `paymentDate: "YYYY-MM-DD"`. The real Gregorian date must lie within the expense `start` accounting period (the explicit retail boundaries apply). The signed amount settles once on that date rather than following the scenario monthly lag; monthly expense recognition stays unchanged and the monthly cash forecast uses that same event. Omit the dated method to retain existing timing. Dates conflict with `dpoDays`/`paymentTermDays`; recurring, noncash and payroll inputs refuse this method. This plans cash only; it never pays a bill. Distinct date policies in accepted aggregate actuals require source attribution/review rather than an inferred allocation. Dates copy with scenario inputs and freeze with approvals; weekly Excel uses the same dated cash.

A position's optional `payDay` (1–31, clamped to month end) and `payMonthOffset` (0–3) accrue its salary and entered on-costs until the planned pay date. An optional `secondPayDay` (1–31, strictly later than `payDay`) splits regular earned compensation into two equal installments, the first receiving any odd cent. Both dates use the same offset and independently clamp to period end; clamped dates may coincide without losing cents. For retail calendars, days count from the start of the target accounting period. Position bonuses and their incremental taxes settle once on the first pay day of the bonus period without the regular offset. These fields also work through the existing MCP proposal tools, where days and month counts are strings. Prior-horizon service and earned/pay schedules establish labeled estimated opening prepaid/accrued balances. These are planning assumptions, never executed payments or imported balance-sheet actuals. Reads, immutable captures and Excel exports retain the existing department/pay filtering.

`PEOPLE-004` commission planning estimates: a position accepts `commissionPercent` (0–100, at most two decimals; stored as `commissionRateBps`). A `REV-004` contract may explicitly name that same-scenario position's `originId` in `commissionPosition`; it must be active at the booking start period and use a cash salary line. Commission is contract cents × basis points / 10000, rounded once half away from zero, expensed in the booking start period on the position's line/department, without on-costs. It follows that position's payroll cash timing and W-2 taxable wage caps; a 1099 has no employer tax. No ASC 340-40 capitalisation or payment execution is modelled. Link/rate/pay traces use the existing Pay detail and department grants; a reader without the recipient's pay grant receives contract data with the link removed and only aggregate payroll costs. Orphaning a linked position, including deleting that position, is refused with 409. Removing a contract or its explicit link requires the same Pay detail and department grants as editing it. The MCP proposal tools accept the same optional fields. Dated merit, position bonuses, department defaults, quota/attainment/accelerators and weighted-pipeline commission remain separate unbuilt requirements.


Pay detail (PEOPLE-005) is separate from plan access. The signed-in owner uses `POST /api/easel/command/pay-detail` with `{ "email": "analyst@example.com", "granted": true }` (or false). Contributors are limited to their current departments; viewers cannot receive the grant. Tokens keep their issuance ceiling and recheck the live grant. Complete archives and Activity require pay access; filtered scenario/workbook reads retain totals.

Person erasure (ERASE-001): deactivate the former planning member with `member` (`active: false`), then a native finance session posts `person-erase` with `{ "email": "former@example.com" }`. The response contains the anonymous receipt id, pseudonym, changed-record counts and time. The installation owner and last finance member are protected; agents and API tokens cannot erase people. Existing sessions and credentials are revoked atomically. Snapshot reads keep their recorded digest while mapping personal attribution; native exports declare the transform and original/exported digests.

## US tax planning estimates (FIN-006)

Finance enables one `tax-policy` input in a working scenario with
`POST /api/easel/command/tax-policy` (or the same MCP proposal tool). Supply
`scenario`, a dedicated cash/non-payroll operating-expense `line`, `department`,
`sutaPercent`, `sutaBase` and `stateIncomePercent`. Save its returned `id` when
editing; delete through `input-delete`. This is the HTTP configuration door;
the existing Plan form edits a position's `employmentType` (`W-2` or `1099`) and
optional `taxYtdWages`, and Overview displays the resulting expense/statements.

Optional finance assumptions and their 2026 defaults:

| Input | Default |
| --- | --- |
| `year` | 2026 (effective assumption year) |
| `socialSecurityPercent`, `socialSecurityBase` | 6.2, 184500 |
| `medicarePercent` | 1.45, uncapped; no employer Additional Medicare share |
| `futaPercent`, `futaBase` | 6, 7000 (gross, no inferred credit) |
| `federalIncomePercent` | 21 (ordinary corporate planning rate) |
| `openingLoss`, `lossOffsetPercent` | 0, 80 |
| `salesTaxPercent`, `salesTaxRemitLagMonths` | 0, 1 |

SUTA and state income values require explicit finance entry, including explicit
zero where appropriate. Rates/bases remain the stated assumption year's values
in later plan years until revised. Annual wage caps reset January; continuing
W-2 positions in a partial first year need explicit prior YTD wages. Each monthly
component is the change in its rounded cumulative liability; 1099 employer taxes
are zero. Taxes add separately to owner-supplied salary on-costs.

`scenario/:id` returns `calculation.taxes`: effective-year label, filtered
`payrollRows`, aggregate `payrollTotals`, `incomeRows` with losses/taxable profit,
and `sales` collection/remittance/payable rows. Income tax uses accounting profit
as an approximation, carries losses within the entered allowance, and plans
payment in the recognition month. Sales tax is a uniform cash-collection
pass-through, remitted after the entered month lag, with no revenue effect.
Closed P&L retains accepted amounts and frozen scenarios retain captured tax
arithmetic. Every personal wage/trace follows current Pay detail and department
grants. These are estimates; no filing, taxability determination or payment occurs.

## Roster and payroll-register files (PEOPLE-007)

Finance with Pay detail can call `POST /api/easel/import/payroll/preview`, then
`commit` with the returned `fingerprint`. The HTTP import door accepts `provider`,
`scenario`, `kind` (`roster` or `register`), `filename`, and either `csv` text or
`base64` XLSX bytes; XLSX also accepts `sheet`. Roster files require an ISO `asOf`
observation date. Column choices and the date format are saved per provider/kind.

`columns` maps the following field names to source headings:

- Roster: `employeeId`, `name`, `department`, `title`, `employmentType` (`W-2` or
  `1099`), `salary` and/or `hourlyRate`, `start`, optional `termination`.
- Register: `employeeId`, `department`, `payDate`, `grossWages`, `employerTaxes`,
  `benefits`, `fees`. `line` selects a payroll-classified ledger line.

Canonical headings such as Employee ID, Name, Department, Salary, Start, Pay Date
and Gross Wages work on the first file without a column map. `departmentMap`
maps source labels to existing department IDs; an exact department name also
resolves. `positionMap` explicitly maps source employee IDs to planned position
`originId` values. Finance may set `memberMap` from source employee IDs to existing Easel member emails; this is the authoritative erasure association for that provider, including linked planned holders. No identity is inferred from names. `dateFormat` is
`YYYY-MM-DD` (default), `MM/DD/YYYY` or `DD/MM/YYYY`; Excel numeric dates are UTC
serial days. Decimal money must be nonnegative and exact to cents.

Read `GET /api/easel/payroll/:scenario` for four reconciliation buckets, latest
roster headcount and monthly register-versus-ledger costs. Missing/blocked ledger
values are null, differences remain visible, and hourly-versus-salary bases are
listed for review. Current Pay detail and department grants filter every detail
row; viewers and analysts without Pay detail receive totals only. Imports and
original archives require finance and Pay detail; scenario read/edit shares remain binding and private imports stay out of unauthorized open exports. These are HTTP import/read
doors; no provider connection or browser upload form is claimed.

`POST /api/easel/import/payroll/status`, `resume` and `undo` take `{id}` from the
commit result's `import.id`. Multi-batch imports require explicit continuation.
Undo removes that import's observations without changing plans, ledger rows or
other imports; that import's saved mapping is removed and the previous mapping applies. Replacing an existing employee
observation/pay run requires undoing its earlier import first. Original bytes
travel through the existing import journal and complete owner export.

### Headcount plan against actual (PEOPLE-006)

`GET /api/easel/headcount/:scenario` reads monthly department plan/actual headcount, hires, departures, payroll cents, explicit backfill counts and expected attrition in hundredths of a person. `observations` names each reviewed provider/date; missing actuals are `null`. `history` and `positions` require the reader's live Pay detail grant for that department; aggregates use the existing scenario read grant. `command/position` accepts optional `plannedStartDate` (ISO day in its `start` month), `backfillOrigin` (an earlier same-department position origin), and `attritionPercent` (monthly probability, displayed only). Day slippage is actual minus the planned date retained by roster acceptance; month-only plans return `null`. This door reads reviewed files, not a connected provider pull.

### Imported workbook drivers (SHEET-003)

`POST /api/easel/command/workbook-driver` accepts `{scenario,id,revision,cell,value}`. `id` identifies the finance/Pay detail reader's `inputs["workbook-model"]` record, `cell` is its source key (for example `Assumptions!B2`), `revision` is the reviewed scenario revision, and `value` is an exact source-unit decimal string with at most eight places. Only numeric non-formula assumptions outside the mapped plan rows can be changed here; mapped constant cells use the grid. Formula results recalculate without replacing the retained source graph; saved versions stay frozen. Workbook preview also returns `formulaReport`, `formulaReconciliation` and `workbookTotals`. Commit refuses missing or mismatched supported totals or formula caches.

### Balance-sheet actuals review (CONNECT-007 partial)

`GET /api/easel/actuals` retains finance-only reconciliation and adds `trialBalances`, one cumulative accepted-ledger review per source month. Source CSV rows are debit-positive journal movements, including an opening journal; repeated month-end snapshots would double-count and are not the input format. Each review contains account/type/department balances with row counts, source periods and import references, debit/credit totals, their `difference`, mapping `blocked` and true `balanced` status. `balances` gives all nine supported balance-sheet targets in natural signs (assets debit-normal, liabilities/equity credit-normal). Any unresolved cumulative mapping makes every balance amount null; zero-net unresolved rows still block. All accounts, including P&L and exclusions, participate in trial zero-sum checks. A zero difference does not establish source completeness. The existing monthly `balanced` field continues to mean classification completeness; its new `balanceSheet` amount includes noncash balance-sheet mappings. Actuals Excel adds ledger, trial-balance and balance-sheet review sheets with live debit/credit formulas. Forecast and attributed working-capital/asset openings still use planning assumptions; CONNECT-007 remains partial for those obligations.

## Fiscal calendars (MODEL-001)

Scenario reads include `fiscal.periods`, `fiscal.quarters` and `fiscal.years`. Period metadata exposes the key, fiscal year/quarter/period, `fromDate`, `throughDate` (inclusive UTC dates) and retail week count. Groups expose exact integer-cent line/P&L flows, cash opening/closing stocks and a `complete` flag. Retail keys are ordinal YYYY-MM aliases; setup requires an explicit anchor within the first key month and uses consecutive 52-week years without automatic leap weeks. Calendar/anchor stay fixed after setup. Monthly drivers apply per period, while dated sources map by their actual date; contract service anniversaries remain Gregorian. Horizon edits invalidate reviews of affected working scenarios; frozen captures and existing forecast horizons stay fixed. Starter setup accepts the same horizon/calendar/anchor fields. Excel exports include Accounting periods, Fiscal quarters and Fiscal years sheets with formulas referencing monthly P&L.

`PEOPLE-004` base-compensation estimates: `position` accepts `payBasis` (`salary`, the default, or `hourly`). Hourly pay requires `hourlyRate` and `expectedHours` (each nonnegative, at most two decimals) and `annualSalary: "0"`; salary requires `annualSalary` and zero/omitted hourly fields. Hourly rate cents × hours hundredths / 100 rounds once half away to cents and must fit the existing money-input limit (10^13 cents); entered on-costs apply to hourly wages with separate half-away rounding. `benefits` is the employer cost per head per active accounting period. `retirementMatchPercent` (0–100, at most two decimals) applies once-rounded to salary or hourly base wages, excluding commission; eligibility, employee deferrals and statutory limits are not inferred. Both are additional cost, excluded from taxable wages and on-costs, and use the position's existing payroll timing. Expected hours and benefits are fixed per accounting period, including retail calendars. They default to zero and are planning assumptions, never payment execution or verified compliance. Stored fields are `hourlyRateCents`, `expectedHours` in hundredths, `benefitsCents`, and `retirementMatchBps`; they follow existing Pay detail and department filtering, immutable captures, comparisons, Excel and MCP proposal semantics.


### Complete position compensation (PEOPLE-004)

`position` also accepts decimal-string `meritPercent` (0–100) with ISO `meritDate`, `bonusPercent` (0–100) with `bonusMonth` (YYYY-MM), `commissionQuota` (money per period), and `commissionTiers` (newline-separated `attainment percent:commission rate percent`, e.g. `100:15` and `150:20`). A merit pair or bonus pair is either complete and positive or absent/zero; percent-of-salary bonuses require salary pay and an active payment period. Invalid inputs refuse the entire save. Stored values are `meritBps`, `meritDate`, `bonusBps`, `bonusMonth`, `commissionQuotaCents`, and `{attainmentBps,rateBps}[]` in `commissionTiers`. These fields are also available to the MCP position tool on an owned draft proposal. The existing live pay, revision, proposal and immutable-capture fences apply.

`department` accepts `onCostDefaultPercent` (0–100). Blank/omitted `position.onCostPercent` captures the current department default and `onCostSource: "department"`; an explicit value captures `onCostSource: "position"`. Updating a default does not rewrite existing positions.

PEOPLE-004 uses one explicit merit increase and one explicitly dated salary bonus per position. Merit is additional base wages × entered basis points × affected inclusive UTC calendar days / (10,000 × days in the accounting period), rounded half away to cents once; dates before a period affect all its days, including leap and retail periods. Existing salary cent conservation is unchanged. Merit adds separately rounded on-costs and enters the employer match base and FIN-006 taxable wages. The match excludes both bonus and commission. A bonus is the entered percentage of the annual salary rate in force at its selected period end (including the full merit rate if effective by then), rounded once, expensed once and paid in that period; it has no on-cost or match. With dated payroll, the bonus and its incremental employer taxes settle on the selected pay day in that same period, ignoring the regular payroll month offset. Other components retain their earned/pay-date timing. Benefits and match remain excluded from taxable wages. Continuing service retains these components in estimated opening accruals.

A department has an entered on-cost default. Blank or omitted position on-costs capture that department rate at each position save; an explicit percentage, including zero, overrides it. Changing a department default alone changes no existing position or frozen arithmetic. A commission quota is entered in cents per accounting period. Attainment is cumulative explicitly linked contract bookings / quota, displayed as once-rounded basis points; zero quota disables attainment and requires no tiers. Up to twenty increasing attainment thresholds and increasing commission rates define marginal accelerators: only booking cents above a threshold earn that tier's rate, without retroactive changes to earlier cents. Threshold cents are quota × attainment basis points / 10,000 once half-away rounded, and must be positive and distinct. Same-period contracts consume quota in ascending stable origin-ID order. Each contract sums exact cent × rate numerators over its marginal slices, then rounds once to cents; without tiers the existing contract × rate rule is unchanged. Quota resets each accounting period. Every trace names the quota, attainment, slices and resulting planning estimate; employer taxes, live pay filtering, proposals, immutable captures and formula exports use the same result. REV-001 inherits these quota/attainment/accelerator rules for weighted pipeline bookings before shipping. No eligibility, deferral, payment, payroll execution or statutory certification is inferred.

`GET /api/easel/weekly-cash/:scenario?start=YYYY-MM-DD` reads thirteen seven-day planned cash windows and accounting-period-end reconciliation under the current scenario read grant. `weekly-cash-override {scenario, start, adjustment, note}` is a finance-only working-scenario command: signed decimal adjustment replaces that week’s prior override, settles on its seventh day and carries forward. Monthly forecast and frozen versions remain unchanged. The view labels undated assumptions and unavailable horizon/version coverage; it is not a bank or open-item feed.

### Saved numeric reports (REPORT-001, partial)

The existing `dashboard-save` command accepts an optional `report` definition.
Its creator, revision, source scenario, department filter and audience keep the
existing dashboard rules; a personal layout never changes a report definition.
Omitting `report` preserves it on an ordinary dashboard edit; `null` removes it.

```json
{
  "row": "department",
  "period": "quarter",
  "through": "2027-03",
  "lines": ["<line id>"],
  "comparison": "<optional company version id>",
  "highlightBps": 1000
}
```

`row` is `department` or `line`; `period` is `month`, `quarter` or `year`.
Read `GET /api/easel/dashboards/:id/report` or download
`GET /api/easel/dashboards/:id/report.xlsx`. A dashboard carrying a definition also shows Download saved report (Excel).
Both routes recheck current dashboard
and source-version access and return aggregate cells only, never inputs or
source traces. The source version's values occupy the `budget` column; the
optional version occupies `comparison`. Versions must share currency and
accounting periods. Actuals use the current reconciled ledger; frozen plan
values retain their captured arithmetic.

Periods end at the inclusive `through` key. Quarter/year groups and YTD use
the source version's fiscal calendar; TTM is the twelve accounting periods
ending at `through`, and prior-year actuals use the same keys minus twelve.
A complete accepted period without a selected row has an observed zero; a
missing or blocked actual period, or a plan period outside its horizon, makes
the corresponding aggregate unavailable (`null`, blank in Excel). Variance
is actual minus source version. YoY is actual minus prior-year actual.
The workbook includes monthly aggregate cells and live period sums and variance formulas.
Percentages are integer basis points, `(difference * 10000) / baseline`,
rounded once half away from zero; a zero baseline is unavailable. A highlight
flag means the absolute variance percentage is strictly above `highlightBps`.

The browser builder, report-driven dashboard widgets, custom dimensions and
hierarchies, permitted-member authoring and scheduled email delivery remain
unfinished; these API reports do not mark REPORT-001 done.

### Custom dimensions and account hierarchies

Finance uses `dimension` / `dimension-member` with stable IDs and optional member `parent`, and `line-group` / `line-hierarchy` for same-type account rollups. Every planning input accepts `dimensions: {dimensionId: memberId}`. `input-dimensions` changes an existing input at `{scenario,kind,id,revision,dimensions}` without changing its other terms. Entered and calculated planning-grid rows display their member tags.

`dimension-map` stores `{dimension,member,sourceKind,source,match}` rules, where sourceKind is `department`, `class` or `tracking-option` and match is `exact` or `prefix`. CSV actuals accept the `class` and `trackingOption` column choices (headers Class and Tracking option are detected). Preview lists `dimensionExceptions`; unresolved or conflicting member rules refuse commit. Changed rules block only dependent dimension/line/month conclusions, never manufacture a zero.

Read `GET /api/easel/dimension-report/:scenario?dimension=<id>&member=<id>` or use `actuals` as the scenario. The same path with `/document.xlsx` before the query exports live totals in integer currency minor units. Frozen scenarios read captured definitions and source partitions. Deleting an in-use definition refuses; structure changes retain readable diffs and every affected department/member cell in Activity.

## Native groups and current authority

Native finance sessions use `group-save` with `name`, active `members` emails, department `read`/`edit`/`owners` lists, dimension-keyed `read`/`edit` member lists and `capabilities` (`connections`, `model-structure`, `approvals`, `publishing`). Existing groups require exact `id` and `revision`; `group-delete` removes its private-scenario shares. Only the native owner uses `group-pay {id,revision,granted}`; only that owner changes a pay-enabled group's members. A membership may explicitly select `groupOnly:true` instead of legacy department assignments. `GET /api/easel/access-report` lists effective native roles, groups, department/dimension grants, capabilities, pay and visible scenarios. Global approval/publication also requires visibility across the company. Existing native-finance Gauge custody applies.

`scenario-share` accepts a `group` and `mode` read/edit using the exact scenario revision. Removal takes effect on the next read, compare, export or write. Tokens retain the issued department/dimension/member/capability/share/pay ceiling and never grow with later grants. Statements use group owner departments, live source scope and current recipient authority.

## Saved report authoring and delivery

`GET /api/easel/reports` lists current readable saved definitions. `report-save` accepts `name`, official `scenario`, optional `department`, `audience` and `report` (row `department|line|dimension|hierarchy`, period `month|quarter|year`, through month, selected lines, optional dimension/member filters, comparison and comparison-version list, highlight basis points). Updates/deletion require the creator and exact definition revision. Contributors author private/department reports only in their current departments. `report-layout {dashboard,revision,definitionRevision,display}` saves a personal table/chart choice. Existing `/dashboards/:id/report` and `/report.xlsx` return the same filtered aggregate projection.

Finance uses `report-schedule-save {dashboard,recipients:[emails],cadence:daily|weekly|monthly,hour,weekday,day}`; updates require exact schedule revision. Recipients need active native accounts, memberships and report audience access. `GET /report-schedules` shows definitions and honest delivery states, company zone and scheduled/actual dispatch instants without stored message bodies. `report-schedule-delete` cancels future attempts; `report-schedule-retry {id:deliveryId}` explicitly retries a known refusal with its captured body/key only while the report and current audience agree. Accepted or uncertain sends cannot be retried. Each scheduled recipient receives the aggregate copy produced under their own current server-side authority.

## Native entity plans and management consolidation

A native owner/admin session uses `entity-save {name,scenario,currency,group,reporting}` to bind a separate official working source plan to an entity and reporting group. The local currency and group are fixed after creation. A newly bound template keeps its entered local amounts and receives the new entity tag; binding a source with compensation requires Pay detail. An inherited entity template must be bound before deriving more versions. The automatic Entity member follows the source plan and its derived versions; an input cannot override it. `entity-rate {entity,month,budget?,average?,monthEnd?}` stores reporting units per local unit (up to six places); enter the preceding month-end for opening equity/cash.

`entity-elimination-save` takes `name`, `month`, `fromEntity`, `toEntity`, source input `fromOrigin`/`toOrigin`, local `fromAmount`/`toAmount`, `receivable`/`payable`, `cashReceived`/`cashPaid`, and explicit `reviewed:true`. Both translated sides must match and remain source-backed; overlapping rules cannot exceed the source. `entity-elimination-delete {id}` removes a reviewed rule. No automatic matching or inference runs.

`GET /entities` returns authorized entities and groups (native finance additionally sees rates/rules/source options). `/consolidation/:group` and `/consolidation/:group/workbook` expose local and translated statements, before/elimination/after totals, visible FX adjustments and missing-source states through current entity and department authority. A subset of entities never implies a complete consolidation. The unpartitioned installation ledger cannot close a bound entity forecast; provider/entity-scoped actuals remain CONNECT-003/011 work.


## Background calculation

Input and grid mutations on plans above 2,000 input rows return HTTP 202 with
`calculationJob {id,scenarios,status,startedAt}`. A reviewed workbook above that
size runs each bounded commit, continuation or undo as a background operation.
The app shows the affected plan periods as recalculating and removes old figures
until completion. A partially imported workbook returns 425 with
`calculation.status: awaiting-continuation`; explicitly continue or undo the
source import before using its figures or editing its inputs.

Poll `GET /api/easel/calculation-jobs/:id` (MCP `calculation_status`) for
`running|completed|failed|interrupted`. Authorized scenario readers receive
metadata; only the initiating actor with unchanged effective authority receives
the stored `result` and `responseStatus`. All commands retain ordinary session,
origin, model revision and input authority checks. Reads consuming an active
calculation return 202 metadata without financial values. Re-read after a
completed job; never repeat an accepted mutation to discover its outcome.
An interrupted operation has an unknown outcome: reload current state before
deciding on another action. Background responses are transient operational data
and are excluded from portable model archives.

### Incumbent planning exports

`POST /api/easel/import/incumbent/preview` accepts `{provider,files,options,mapping}`; provider is `adaptive`, `planful`, `anaplan`, `runway` or `pigment`. Each original file supplies `name` and exactly one `text` or `base64`, plus its export call/version/sheet context where applicable. [Move-in formats](docs/move-in.md) describe the explicit buyer mapping. Preview writes nothing. Native finance with Pay detail receives created records, unmapped items, personnel, per-account reconciliation and the reviewed fingerprint; other current planning members receive only their aggregate version projections. No preview fingerprint is returned to a viewer.

`POST /api/easel/import/incumbent/commit` takes the same body and `fingerprint`. Every account/month must reconcile. Acceptance, `resume`, `status` and `undo` require a native finance session and live Pay detail. The latter operations take `{id}` from the import result. All created structure, scenarios, schedules and positions go through the retained-original import journal. Source permissions never become native permissions.


## Scheduled Google Sheets ranges

Native finance sessions with Pay detail use `GET /api/easel/connections/sheets` for masked status and `POST /api/easel/connections/sheets/connect` with an explicitly provisioned offline `{clientId,clientSecret,refreshToken}` grant carrying only `spreadsheets.readonly`. Credentials never appear in status or archives. The Google grant covers accessible spreadsheets, while Easel requests only each saved rectangle. `disconnect` disables schedules, asks Google to revoke the grant and removes local secrets on every outcome; status records the actual outcome and required Google Account removal step when unconfirmed.

`POST /api/easel/sheet-links/preview` takes `{name,scenario,spreadsheetId,range,cadence:"hourly"|"daily",hour?,mappings:[{source:"B2",schedule,month:"YYYY-MM"}]}`. Every cell of the sheet-qualified numeric rectangle must map once to an existing entered native schedule cell. Preview writes nothing and returns source/native cells and a reviewed `digest`; `save` takes that exact digest to retain the baseline and enable the schedule. Replacing an existing link also requires its exact `id` and `revision`.

`GET /api/easel/sheet-links` lists current health, baselines and proposal differences. `pull` and `disable` take `{id,revision}`. A pull creates a separate submitted native proposal when source values change; the working target remains unchanged until normal exact-revision promotion. Identical values produce no duplicate. A missing source, changed sheet/grid shape or absent numeric cell records an error without replacing the valid baseline or writing plan/proposal inputs. Daily schedules use the company time zone; each run re-resolves the current native finance owner's Pay authority. Tokens and outside agents cannot administer or inspect this connection or its complete source captures.

### Department approval chains (`CYCLE-007`)

`GET /api/easel/approval-chains/:scenario` returns the permitted department chains, recorded submission versions, ordered steps, current eligible reviewers, blocked reasons and attributed history. Finance with company-wide `approvals` also receives the editable configuration and active reviewer choices. A chain grants no data or editing capability.

Commands use the existing session/token and atomic model-revision fences:

- `approval-chain-save`: `department`, current `version` (null on first save), and ordered `steps` (`name`, `members` email list, `groups` ID list, optional retained step `id`). Every save retains a new immutable version. Step IDs survive edits and reordering; removing a reviewer from the current step revokes them even on an older in-flight version.
- `approval-chain-delete`: `department`, current `version`. Saves an empty next version; in-flight submissions retain their recorded version until explicitly restarted.
- `approval-chain-restart`: `scenario`, `department`, current submission `pass`, latest configuration `version`, and `reason`. Finance explicitly voids previous decisions and starts a new pass on the latest version.
- `approval-step`: `scenario`, `department`, recorded `step` ID, current `pass` and exact content `digest`, all from the read response. Only a currently eligible human reviewer may approve the next step once. Agent/service credentials are refused. Live grants must cover every submitted source and required Pay detail. Stale content/order/pass returns 409; missing authority returns 403.
- Existing `return-submission` also accepts a reviewer of the current or an earlier completed step, with a required `reason`. Finance may return any in-flight submission. A frozen budget cannot be returned.

Submitting a configured department records the chain version and exact department content, and locks contributor edits until return. Related input changes through commands, MCP and import outcomes restart its pass on that same version, preserving voided decisions. Unrelated departments do not restart it. Budget approval checks the current digest and every recorded step and captures those decisions in its immutable snapshot. Pending-step notifications recheck current recipients before delivery. Chain definitions, captures and history travel through normal portable and open exports; immutable captures inherit the existing read/export erasure map.


### Read-only Plaid bank cash (CONNECT-009 / FIN-007)

Native company-wide finance uses `GET /api/easel/connections/plaid` and `POST /api/easel/connections/plaid/{connect,refresh,disconnect}`. Connect takes `environment` (`sandbox` or `production`), `clientId`, `secret`, `accessToken` and boolean `consent: true` for every depository account in that already-authorized item. Credentials are sealed, archive-excluded and masked; API tokens cannot administer or inspect them. Disconnect attempts provider item removal and deletes local credentials on every outcome, with an explicit owner step on unconfirmed removal. No payment/transfer endpoint exists.

`GET /api/easel/weekly-cash/:scenario?basis=bank` (also `document.xlsx`) selects observed bank cash for a working scenario. Existing company-wide finance read authority applies, including finance tokens under their current issuance ceiling. Default `basis=plan` preserves all existing readers. Bank cash starts the UTC day after the observation and never adds historical posted transactions again; `start` cannot precede that boundary. Dates outside the plan horizon, captured versions, currency mismatch, failed refresh, disconnected/restored credentials and observations over 24 hours old refuse rather than use zero. Forecast inputs, monthly calculations and frozen snapshots do not change; month-end differences remain visible. Refresh is manual; CONNECT-005 carries scheduling. The source retains aggregate counts/current balance and the last 30 days of posted movement only; account IDs and merchant descriptions are discarded.

`cash-alert-rule-save` also accepts `kind: "bank-below-plan"` with the existing amount/percent threshold fields. It compares fresh bank cash with the approved budget's dated cash on that observation date, retaining source labels and the existing deduplication, worsening, interval and acknowledgment rules. Other cash rules keep their existing ledger/forecast semantics. Conservative finance-only bank-data audience approval remains pending in CONTRACT/ACCEPTANCE.

## Reviewed owner assumptions and source refreshes

Native finance enables `owner-question-settings {enabled}` before asking `owner-question-ask {scenario,scenarioRevision,kind,originId,field,owner,source,question,dueAt}`. `GET /api/easel/owner-questions` lists only current permitted questions. The bound native owner answers with `owner-question-answer {id,revision,choice:yes|no|new-date,date?}`. Finance can override with `owner-question-override` plus `note`, cancel with `owner-question-cancel` plus `reason`, check unanswered deadlines with `owner-question-escalate`, or prepare a recalculated draft with `owner-question-propose {id,revision}`. All remain separate from ordinary finance submission/promotion. Current explicit fields are contract `startDate`, hire `plannedStartDate` and one-off expense `paymentDate`.

`source-guard-stage {source,label,scenario,month,actuals,expectedPayroll:[{provider,payDate,rows}],observedAt,nextExpectedAt,revision?}` stores a reviewed one-period observation without importing rows. `source-guard-review {id,revision,fingerprint,decisions:[{issue,action:map|evidence|exclude,target?,reason}]}` uses normal mappings or accepted payroll-register evidence; exclusions retain the person/time/reason. `GET /api/easel/source-guard` returns current permitted impacts and unresolved findings. Accepted source bytes complete the review through the ordinary actuals import; a changed file for a tracked period must be staged again. Working conclusions stay held until acceptance, while frozen snapshots keep their captured values.

### Consented private Slack delivery

`GET /api/easel/slack-private` returns connection and consent status. A native finance owner/admin with Connections permission explicitly consents to `/slack-private/connection/connect {key,consent:true,revision}`. Only Slack's fixed API host is used. The key is sealed and omitted from status, Activity and archives. `disconnect` attempts revocation of that key and removes local custody on every outcome, labeling unconfirmed provider revocation honestly.

Finance calls `/slack-private/bind {email,user,revision,connectionRevision}` after checking the active human Slack profile's exact native email and workspace. The mapped native person alone can `/slack-private/consent {email,revision,connectionRevision,team,user,consent:true}` to that identity and to structured owner questions and financial cash alerts replacing their usual delivery preference. `/revoke {email,revision}` withdraws that consent; finance `/unbind {email,revision}` stops the mapping. A selected route awaiting consent or later stopped blocks delivery, without switching to email or a shared channel.

Each private send checks current native authority, exact connection/binding/consent revisions, current Slack bot and human identities, and a single-person private conversation. A durable intent captures the identity before the send; retries cannot redirect captured content to another identity. The private message contains the structured question or financial alert and its authenticated Easel record link. Answers remain attributed native actions. Slack acceptance confirms neither delivery nor reading. Shared webhooks retain their existing generic sign-in notices and qualified Base egress dependency. The adopted private identity/consent/custody default awaits ct approval.

## Model variance commentary

Native finance uses `POST /api/easel/commentary/settings/configure` with `model,inputUsdPerMillion,outputUsdPerMillion,monthlyUsd,enabled,consent:true`, and `/settings/stop|resume`. `/connection/connect {key,consent:true}` seals the owner-provided OpenAI key; `/connection/disconnect` destroys local custody. Archives omit it. `GET /api/easel/commentary/status` distinguishes a conservative reserved allowance from actual provider charges; the budget month is UTC.

A native variance writer calls `/commentary/preview {month,line,department}`, reviews the exact non-pay request, then `/commentary/generate` with the same scope, `fingerprint` and `consent:true`. The fixed Responses API request uses strict structured claims, no tools and `store:false`; its request format follows [official OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). A durable conservative reservation precedes the single call and remains charged to the allowance on every outcome. Unknown results are never retried automatically. The response creates only a sourced, labeled, unconfirmed explanation; existing human confirmation and finance publication apply. Current sources, authority and local stop are rechecked before send and save. Provider retention/training terms and ct approval of the adopted default are not claimed as complete.

## Reviewed modeler proposals

The Scenarios modeler reuses the chosen model, declared rates and sealed OpenAI key configured under Review. It has independent off/stopped defaults and a monthly reserved USD allowance: native company-wide finance with Pay detail and model-structure permission explicitly consents through `POST /api/easel/modeler/settings/configure {monthlyUsd,enabled,consent:true}`, then `/settings/resume` or `/settings/stop`. `GET /modeler/status` labels the allowance and recorded runs; it makes no provider-reported cost claim.

`POST /modeler/preview {from,request}` returns the exact planning request, model snapshot and safe output schema for human review, including any permitted pay assumptions. `/modeler/generate` takes the same body plus `fingerprint,consent:true`. A fenced intent reserves allowance before one fixed-endpoint, no-tool call. The server accepts only planned salary positions, volume revenue drivers and native formulas bound to existing permitted metadata. It validates every operation and recalculates a separate draft in an isolated context; exact expected-value checks must cover every moved line and formula before anything is saved. Unsupported operations, bad checks, stale sources, stopped settings and changed authority create no partial proposal. Unknown outcomes are never retried automatically.

`GET /modeler/proposal/:id` returns the agent label, reused structure, added formula definitions, input and cell differences, and checked expected values, with changed-source/proposal proof labeled stale. The official scenario stays unchanged. Ordinary exact-revision submission and human promotion still apply; modeler promotion independently requires model-structure permission. The adopted generation/consent/custody/allowance defaults await ct approval, and AGENT-011 carries global governance.

## Linked Office reports

`GET /api/office/manifest/PowerPoint` and `/Word` download this installation's sideload manifests. They contain the same-origin task pane URL, never credentials. See [Office installation](docs/office-reporting.md).

`GET /api/easel/dashboards/:id/office?period=&kind=table|chart|number&metric=budget|actual|comparison|variance|priorYearActual|yoy&row=&source=&through=` reads aggregate saved-report content with current audience, source availability and Pay filtering. Source and through selectors pin the inserted link to its chosen report version/horizon; changed selectors, unavailable periods or inaccessible rows refuse. `row=unassigned` selects a permitted unassigned-department row. The corresponding `/office.xlsx` door returns the existing aggregate report workbook with live formulas after the same selector checks.

The Office.js adapter stores only selectors and document object IDs. Explicit insertion exports values into the operator's document; refresh fetches every source under the current person's authority before document mutation. Easel cannot recall previously exported document bytes.

## Enterprise identity

Enterprise identity is off unless the owner configures it. See [identity configuration](docs/enterprise-identity.md) for the SAML/OIDC relying-party settings and the separately authorized `/scim/v2` provisioning API. SCIM does not use personal API credentials or native session cookies. Identity configuration, provider keys, replay transactions and machine associations are excluded from portable exports; restored installations need explicit configuration.

## Connected Gusto observations

`GET /api/easel/connections/gusto` and `POST /api/easel/connections/gusto/connect|disconnect` require a native finance session with company-wide Pay detail and connections authority. Connection accepts an explicitly consented read-only company token; this manual observation door does not claim the future PEOPLE-001 OAuth flow.

`POST /api/easel/import/gusto/preview|commit|status|resume|undo` uses the existing payroll journal. Preview pulls complete employee and processed-payroll source pages, shows explicit employee mappings and changes no plan. Commit refetches and requires the reviewed fingerprint. Exact pay dates and dated complete roster observations feed `/api/easel/headcount/:scenario`. Accepted prior payroll IDs do not duplicate when windows overlap; source changes refuse rather than overwrite history. See [source fields and costs](docs/gusto-roster.md).


## Pantry read-only source (partial connector)

Configure `PANTRY_ORIGIN` to the trusted installation’s HTTPS origin. Local development also permits an HTTP loopback origin. It cannot be supplied by an API caller. Create a separate Pantry credential with `business:read`, `accounts:read`, `periods:read`, `journals:read` and `reports:read`. Open-item previews additionally need `invoices:read`, `bills:read` and `payments:read`. No write grant is needed.

All these routes require a native finance session with company-wide connection authority; personal API tokens, agents and schedulers are refused. POST requests retain the ordinary same-origin and live-session fences.

| Route | Body and result |
| --- | --- |
| `GET /api/easel/connections/pantry` | Masked status, required ledger scopes and the exact owner revocation step; no credential |
| `POST /api/easel/connections/pantry/connect` | `{key, consent:true}`; checks read access, then seals the key outside archives and audits consent |
| `POST /api/easel/connections/pantry/disconnect` | `{}`; deletes the local key and audits unsupported provider self-revocation. Revoke it in Pantry People & settings → Integration credentials |
| `POST /api/easel/pantry/ledger` | `{from,to}` inclusive ISO dates; complete posted source with entry revisions, chart types, dimensions and both boundary trial balances |
| `POST /api/easel/import/pantry/preview` | `{from,to}`; no-write actuals mapping preview, `fingerprint`, `sourceFingerprint`, trial-balance agreement and changed-row count |
| `POST /api/easel/import/pantry/commit` | `{from,to,fingerprint,sourceFingerprint}`; re-fetches the source and accepts only the reviewed differences through the ordinary actuals journal |
| `POST /api/easel/pantry/cash` | `{asOf}` where the date is today in UTC; current remaining invoice and bill cents, paid-history collection dates and explicit unresolved items. This source preview does not change weekly or monthly cash |

Use the existing actuals journal routes to resume or undo an import. Corrected source amounts become reviewed deltas, preserving earlier rows and frozen captures. A changed accepted account, date or dimension requires a correcting-file review. An unchanged pull returns `unchanged:true` with zero changed rows; there is nothing to commit. Full-source reads exceeding 5,000 records or the bounded response size refuse rather than accepting truncated data. Redirects, missing pagination, inconsistent ledgers and provider failures refuse without exposing response bodies or silently retaining a previous successful conclusion.

Native Pantry connection and import controls, provider transaction links and integrated weekly open-item scheduling remain unfinished. Current planned and Plaid weekly views continue to work independently.


### Reviewed Pantry weekly cash preview

A native company-wide finance session can read `POST /api/easel/pantry/cash`
with `asOf` set to today's UTC date. Review the returned events and digest,
then call `POST /api/easel/pantry/cash-forecast` with:

- `scenario` and its current numeric `revision`, `asOf`, optional `start`,
  `sourceFingerprint` equal to that digest and `basis` set to `plan` or `bank`.
- `replacements`: one object per reviewed planned date with `date`,
  `collections` and `payments` in nonnegative integer minor units.
- `additionalCollections` and `additionalPayments` in integer minor units.
  Replacements plus these explicitly additional amounts must equal the source
  invoice and bill totals respectively. Replacements cannot exceed that day's
  planned cash. No customer or vendor identity match is inferred.

The source is refetched and both fingerprints are checked. Unresolved dates,
changed sources, stale revisions and captured scenarios refuse. Bank mode
requires a bank observation on the source observation date. The thirteen-week
preview starts after that date, keeps other planned events and noted overrides,
and displays monthly differences without changing the monthly plan. Set
`format` to `xlsx` for the same formula workbook. This HTTP preview does not yet
have native source-review controls; FIN-007 remains partial.


## Native financial connections

Connection administration, source previews, acceptance, continuation and undo require a current company-wide native finance session. Bearer tokens and agents cannot use these provider doors. Writes keep the ordinary origin, model revision and session fences. Credentials are encrypted in the excluded connection-secret table; status returns a masked suffix. Accepted observations remain after disconnect.

| Route | Operation |
| --- | --- |
| `GET /api/easel/connections/stripe` | Masked Stripe scope, owner, manual cadence, accepted row count, health and revocation instructions |
| `POST /api/easel/connections/stripe/:op` | `connect` takes a restricted key and explicit `consent`; `check` reads access health; `disconnect` deletes local custody and states the separate Stripe key deletion step |
| `POST /api/easel/billing/:op` | `preview` and `accept` take `scenario`, `driver`, `scenarioRevision`, complete calendar months `from` and `to`, and optional per-month `explanations`; acceptance also takes the reviewed `digest`. `undo` takes the reviewed scenario revision and driver |
| `GET /api/easel/billing/:scenario` | Finance-only accepted aggregate bridges, cohorts and ledger reconciliations |
| `GET /api/easel/connections/qbo` | Masked Intuit company, scope, owner, manual cadence, health and reviewed source months |
| `POST /api/easel/connections/qbo/begin` | `environment`, Intuit app credentials and explicit `consent`; returns the provider authorization address with one-use session-bound state |
| `GET /api/easel/connections/qbo/callback` | The registered installation callback; exchanges the reviewed native session's code and company realm for sealed OAuth credentials |
| `POST /api/easel/connections/qbo/connect` | Connect an existing accounting OAuth grant with `environment`, `realmId`, app credentials, `refreshToken` and explicit `consent` |
| `POST /api/easel/connections/qbo/check` | Explicit access health read, with sanitized errors and rate-limit state |
| `POST /api/easel/connections/qbo/disconnect` | Attempt Intuit revocation, retain its actual outcome and delete local credentials |
| `POST /api/easel/import/qbo/:op` | One reviewed month at a time. `preview` takes `month` and explicit `includeOpening`; `commit` also takes the reviewed journal `fingerprint` and `sourceFingerprint`. Confirm any nonposting observations with their reviewed `acknowledgeNonPosting` count |

The native history form defaults to 24 closed months and allows 12 to 36. Each month is reviewed separately and keeps its own provider trial balance; a source-confirmed empty month has an accepted source-month record without fabricated ledger rows. The first month imports the preceding source trial balance once. Later months must follow accepted history. Corrections append the changed amounts for stable provider posting groups. Ordinary actuals journal continuation and undo keep the provider's native authority; a removed history month must be restored before consuming later balances.

QuickBooks reports use accrual accounting and their declared currency. Source fiscal-year transfers into retained earnings appear separately in trial reconciliation; they do not become posted revenue. Zero-value observations without a posting account are visible exclusions requiring confirmation. Unknown transaction destinations block acceptance. Current-month reports stop at the observed date. The accounting OAuth grant includes provider write permissions; Easel issues only the allowlisted accounting reads, plus OAuth renewal and explicit revocation.

Stripe run rates use recurring invoice periods and actual subscription end dates. Customer-level movements and cohorts aggregate subscriptions; retention measures the opening active customer base. Invoice service-period allocation, deferred balance, refunds and tax remain separate from ledger revenue. Finance explains any residual difference before acceptance. One driver receives the account's complete monthly totals in each scenario; later customer or seat projections start from those accepted observations. Dashboards and aggregate formula Excel use the same imported ARR and current audience checks. Frozen plans retain their captured observations.


### Sage Intacct reviewed entity actuals

`GET /api/easel/connections/intacct` and `POST /api/easel/connections/intacct/{connect,check,bind,disconnect}` require a company-wide native finance session with Connections capability. Tokens, agents, schedulers, viewers and scoped finance sessions cannot administer or inspect credentials. Writes require the installation origin and current native session. `connect` takes `companyId`, `senderId`, `senderPassword`, `userId`, `userPassword` and `consent: true`; use a dedicated read-only Web Services user. Credentials are sealed outside portable archives. Status provides masked suffixes, permitted reads, owner, Manual cadence and sanitized health.

`bind` takes `sourceEntity` (the legal entity ID returned by Intacct) and `entity` (an existing Easel entity). Each mapping fixes the source-plan root, local base currency and ACCRUAL book; location dimension labels never identify legal entities. Create another entity source budget with `branch` and `budget: true` before binding it. Approval records that root's official forecast. Disconnect deletes local custody, retains accepted history and reports remote revocation as unsupported. Deactivate the dedicated Web Services user and remove the sender ID's authorization in Intacct; Easel does not claim to revoke it.

`POST /api/easel/import/intacct/{preview,stage,commit}` takes `sourceEntity`, `month` and the explicit boolean `includeOpening`. Review each completed entity/month separately, in chronological order; include the preceding opening balance only with the first month. Native history defaults to 24 months and accepts 12–36. Preview writes nothing. Commit re-reads all source pages and requires both returned `sourceFingerprint` and journal `fingerprint`. The first includes metadata, binding and opening choice; the latter includes live account and dimension mappings. Acceptance refuses incomplete pagination, non-accrual/nonposted detail, wrong authenticated entity or currency, unsafe entry URLs, inconsistent independent trial balances, and journals over 5,000 rows or 2 MB. Only normalized credential-free CSV/provenance enters the journal. Use `import/actuals/{status,resume,undo}` for explicit continuation and undo; undo the latest correction first, and never undo a closed entity month.

The result exposes account types, normal balances, closing metadata, all standard dimensions, namespaced GL-enabled user dimensions (`udd:OBJECT_NAME`), changed source inventory, exact account trial differences, and changed transaction counts. Account range/prefix/type rules apply on every pull. Stable department IDs map to native departments and a custom Department dimension; location IDs map independently to a Location dimension. An unchanged re-pull adds no journal rows; amount edits and removals create reviewed deltas/reversals. Both the source observation and prior accepted journal history enter the import identity, keeping identical entity openings and repeated equal-sized corrections distinct. Identity or period moves are refused with a correcting-review instruction so accepted identities cannot be silently reassigned. Documented fiscal account closing transfers are displayed separately from posted movements; unexplained differences block acceptance.

`stage` also takes `observedAt`, `nextExpectedAt`, `expectedPayroll` (explicitly `[]` for no dependency), and the prior staged `revision` on refresh. It saves a credential-free observation, proposed mappings and affected scenario/report/pack/alert inventory without accepting ledger rows. Review its exact fingerprint and revision with `source-guard-review`, then accept the reviewed source. An accepted empty month has a coverage receipt and no invented journal rows. Failed reads preserve accepted data. Source guards hold affected working conclusions and cash alerts while frozen captures retain their arithmetic.

Choose an explicit `?entity=<Easel entity ID>` for `actuals`, `actuals.xlsx` and `dimension-report/actuals` when entity bindings exist. Ordinary plan calculations derive scope from the consuming scenario, including each version used by native Actuals formulas. Unbound legacy plans exclude entity-tagged rows. Choose `?scenario=<entity forecast ID>` for `variance/:month` and its Excel download; pass `scenario` to explanation and pack creation commands. Current entity/department/dimension and Pay detail authority filters every projection; viewers receive amounts without private source rows or entry links.

`GET /api/easel/entities` includes native-finance-only `ledgerSources`, grouped by entity. `entity-elimination-save` may use `ledgerSources: {from: {charge: [id], receivable: [id], cash: [id]}, to: {charge: [id], payable: [id], cash: [id]}}` instead of planned origins. Select exact accepted identities, enter local amounts and `reviewed: true`. All corrections of each identity enter its digest. The server checks current mapping, source limits, overlap and reciprocal amounts after per-entity translation. A correction invalidates stale selection rather than changing a reviewed rule automatically.

Qualification: the new tests replay synthetic XML at the provider HTTP edge. A recorded run against a real Sage Intacct sandbox company remains required by CONNECT-011; these fixtures do not qualify that item.
### NetSuite actuals (manual, read-only TBA)

Native company-wide finance with Connections authority connects a token for a declared
read-only NetSuite role in Settings → NetSuite connection. Create the integration and
access token in NetSuite, restricting the role to the intended subsidiaries, accounting
book and read-only SuiteAnalytics/REST access. Easel reports that declared role and its
requested operations; a successful read does not certify the provider role's completeness.
Credentials are sealed under a provider-specific purpose and excluded from both portable
archive formats. After restore, reconnect with a new grant; bindings and accepted evidence remain.

- `GET /api/easel/connections/netsuite`: masked status, owner, declared role, permitted
  operations, Manual schedule, check/pull times, counts, sanitized error/rate limit,
  metadata, immutable subsidiary bindings, source-period mappings and accepted months.
- `POST /api/easel/connections/netsuite/connect`: `realm`, `consumerKey`,
  `consumerSecret`, `tokenId`, `tokenSecret`, `role`, `consent: true`.
  Account IDs derive fixed account-specific hosts. No arbitrary origin or redirect is accepted.
- `POST /api/easel/connections/netsuite/check`: check the source without importing.
- `POST /api/easel/connections/netsuite/map-subsidiary`: `book`, `subsidiary`, `entity`.
  One subsidiary/book binds to one stable entity source-plan root in its own currency.
  Accepted sources cannot be moved to another entity, duplicated across books or inferred as FX.
- `POST /api/easel/connections/netsuite/map-period`: `book`, `period`, `month`.
  Explicitly map every preceding leaf source period and every adjustment period.
  Parent year/quarter periods are excluded; the original transaction date stays in evidence.
- `POST /api/easel/import/netsuite/preview`: `binding`, `month`, `includeOpening`.
  Preview is write-free. It reads fixed SuiteQL SELECTs with signed TBA requests and
  reconciles separate cumulative source aggregates account by account with the posted movement.
  Reads refuse incomplete pagination, changing metadata/balances, unsafe cents, unknown
  accounts/dimensions, unsupported transaction destinations and byte/row/time overflows.
- `POST /api/easel/import/netsuite/stage`: the same selection plus the reviewed
  `sourceFingerprint`. Stages metadata/mapping findings, reasoned proposals and dependent
  conclusion holds through source-guard. Resolve findings with `source-guard-review`.
- `POST /api/easel/import/netsuite/commit`: same selection, `sourceFingerprint` and
  preview `fingerprint`. Re-read and review the exact source/mapping before journal acceptance.
  Use `import/actuals/resume|status|undo` with the resulting batch ID. Continuations and
  undo require current native company-wide finance; undo refuses closed entity periods.
  Empty/unchanged acceptance records coverage without inventing rows. Changed attribution
  reverses the old classification and adds the new one; removals reverse accepted amounts.
- `POST /api/easel/connections/netsuite/disconnect`: signed self-revocation at the
  account's RESTlet `/rest/revoketoken` endpoint, without redirects or retries. Local secrets
  are deleted on confirmed, refused, unreachable and unreadable outcomes. An unconfirmed
  result names the owner action: NetSuite Setup → Users/Roles → User Management →
  Access Tokens → Edit Easel’s token → Revoke. No provider URL, token parameters,
  response body or authorization header is retained in audit or errors.

History review defaults to 24 closed months (12–36 selectable), with a separate reviewed
batch for every subsidiary/month and the preceding opening exactly once per binding.
`budget-from-actuals` accepts an explicit `entity`; approval designates the descendant
forecast while preserving the source-plan root. `GET actuals?entity=ID` and its Excel
export select an authorized entity and its currency. Legacy doors retain the legacy
installation ledger. Variance and variance Excel accept `?forecast=ID`; explanations
and packs accept `forecast`, retaining separate entity evidence and immutable captures.
Entity ledger elimination reviews use `evidence: "ledger"`, `revenueLine`, `expenseLine`
and explicit `ledgerEvidence` posting IDs for `fromAmount`, `toAmount`, `receivable`,
`payable`, `cashReceived` and `cashPaid`. GET `entities` supplies authorized net posting
choices. Corrected or remapped source evidence invalidates the review; overlap is refused.

Qualification evidence in `tests/netsuite-suiteql-recording.json` is synthetic recorded-fake
wire data. It is not a live sandbox recording. One recorded NetSuite sandbox-account run
remains required before the connector ships; CONNECT-003's status and acceptance are unchanged.
