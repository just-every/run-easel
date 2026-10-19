# Easel HTTP API

The same routes serve the app and integrations acting under a person's authority.
Use a native session cookie (and a same-origin `Origin` header for writes), or
a scoped personal/service bearer token as documented below. Responses are JSON; refusals are
`{ "error": "..." }` with 400, 401, 403, 404, 409, 413 or 429. A 409 means the plan
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
| `GET /api/easel/pack/:id/document.html` · `.csv` | A published pack, rendered from its snapshot |

`state` and `variance` include `actorNames`, a contextual email-to-name map from
the installation's native directory, limited to emails already visible in that
response. Like `me`, it is not portable state: restore retains historical
attribution and snapshot names, but does not import native identities, sessions
or credentials. A missing directory entry is omitted from the map.

## Commands: `POST /api/easel/command/:op`

Amounts are decimal strings ("12000.50"), percentages decimal percent ("12.5"),
months `YYYY-MM`.

- Setup (finance): `workspace` {name, currency, fiscalYearStart, planStart}; `department` {id?, name, shared}; `department-delete` {id}; `line` {id?, name, type: revenue | cost-of-sales | operating-expense, payroll}; `line-delete` {id}; `member` {email, name, role: finance | contributor | viewer, departments, active}; `account-map` {account, target: lineId | excluded | cash}; `department-map` {source, department}; `account-rule` {id?, match: range | prefix | type, from, to? (range), target: lineId | excluded | cash}; `account-rule-delete` {id}.
- Inputs (finance, or a contributor in scope): `revenue` {scenario, id?, name, kind: volume | customers, line, department, start, collectionLag, startVolume, growthPercent, rate | startCustomers, newPerMonth, newPerRep, repDepartment, rampMonths, churnPercent, arpa}; `position` {scenario, id?, title, holder, department, line, start, end, annualSalary, onCostPercent}; `expense` {scenario, id?, name, line, department, kind: recurring | one-off, amount, start, end}; `schedule` {scenario, id?, name, line, department, values: {month: amount}}; `allocation` {scenario, name, sourceDepartment, basis: headcount | fixed, targets: [{department, percent}]}; `input-delete` {kind, id}; `scenario-cash` (finance) {scenario, basis: estimate | imported, opening, receivables, payables, collectionLag, paymentLag, note}.
- Scenarios: `branch` (finance) {from, name}; `scenario-adopt` (finance) {from, into, revision}; `scenario-delete` (finance) {id}; `proposal-create` {from, name, request}; `proposal-submit` {id, summary}; `proposal-promote` (finance) {id, revision}; `proposal-decline` (finance) {id, reason}.
- Cash health (finance): `cash-constraints` {floor, runwayMinimum}; both are nonnegative decimal strings (currency units and months). The agreement records currency, person and time on the workspace. Scenario reads return `cashHealth`, and comparisons return it on each side; the current agreement checks saved cash without rewriting frozen snapshots. Burn is in cents, runway is in hundredths of months, and null runway means nonpositive average net burn, with its basis distinguishing not-burning from cash-exhausted. A negative finite runway is the signed cash/burn ratio and means cash is exhausted. The trailing window is the current and up to two preceding available months; checks use the exact ratio before rounding and equality meets a minimum. Cross-currency checks are not assessed. Scenario and comparison XLSX downloads include Cash health sheets.
- Cycle: `forecast-window` (finance) {scenario, revision, months: 12..60}; `request-submissions` (finance) {scenario, departments, due}; `comment` {scenario, department, text}; `submit` {scenario, department}; `return-submission` (finance) {scenario, department, reason}; `approve-budget` (finance) {scenario, revision, note}; `close-month` (finance) {scenario, month}.
- Review: `explanation` and `explanation-confirm` {month, line, department, text}; `pack-create` (finance) {month}; `pack-decision` (finance) {pack, text, owner, due}; `pack-publish` (finance) {pack}; `action-status` (finance) {pack, decision, status, note}.

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

Tokens retain the issuer's role at issuance, intersect their original departments with today's grants, and resolve current membership on every request. A role change, deactivation, native operator-version change, expiry or revocation removes access; later department additions never expand an existing token. Named service tokens are labelled as agent work under their issuer's authority. Writes and import journal batches recheck the live credential and revision fence atomically, so stale revisions still return 409.

Each credential has a durable limit of 120 requests per minute. Excess requests return 429 and `Retry-After` in seconds. Successful requests, refused actions and rate-limit refusals record the credential ID, safe label, method, path and outcome in the append-only activity trail; raw bearer values never enter that trail. Base credentials, token metadata and rate counters are excluded from `rer export`, so restored installations require new tokens.

### Spreadsheet exports (SHEET-004)

Signed-in members may download `GET /api/easel/scenario/:id/document.xlsx` (optional `department`), `GET /api/easel/compare.xlsx?a=:from&b=:to`, `GET /api/easel/variance/:month/document.xlsx`, and `GET /api/easel/pack/:id/document.xlsx`. Scenario access and server-filtered detail are identical to JSON reads; published packs use their immutable snapshot. Finance may also download `/api/easel/actuals.xlsx` and `/api/easel/activity.xlsx` (the same filters as activity CSV, all matching pages). Each current statement has its own sheet; amounts are labelled integer minor units and formulas hold cached results and recalculate on open. Scenario CSV is `/api/easel/scenario/:id/document.csv`; existing pack HTML/CSV and activity CSV remain.

### Open plan export (PORT-001)

Finance downloads `GET /api/easel/export` as a ZIP of CSVs for all product and import-journal tables (existing credential exclusions remain), `model.json` with record/schema definitions and units, a formula XLSX per scenario, every immutable snapshot as JSON, and custody-verified retained originals. `manifest.json` lists inventory and each payload file's byte size and SHA-256; missing retained originals are labelled unavailable. The manifest does not hash itself. CSV blobs are JSON base64 objects and text that could execute as a spreadsheet formula is apostrophe-prefixed; JSON definitions and original bytes retain exact data. The normal native-session/revision fence prevents a changed plan from completing its export. `rer export` continues to supply the restorable archive.

### Fixed assets (FIN-004)

Create a non-cash expense line with the normal `line` command (`nonCash: true`). The `asset-category` command accepts `scenario`, `name`, and whole `usefulLifeMonths`; its `originId` is the `asset` command's `category`. Asset inputs accept `name`, `department`, the non-cash expense `line`, `kind` (`purchase` or `existing`), `cost`, `start`, optional purchase `paymentMonth`, and optional `disposalMonth`/`disposalProceeds`. Existing assets start at the first plan month and additionally accept `openingAccumulated` and `remainingLifeMonths`. Money inputs use decimal currency strings. Updates use `id`; deletion is `input-delete` with `kind`. A used category cannot be deleted. All normal scenario edit and department fences apply; category changes require finance.

Scenario reads include `calculation.assets`: each asset/month's pre-depreciation book value, depreciation, disposed book value, closing book value, capex cash, disposal cash and non-cash expense. Exact cent rounding and disposal-month semantics are in CONTRACT.md. Asset details use the same department filtering as other inputs. MCP offers `asset-category` and `asset` only inside the caller's own draft proposals; promotion remains a human finance action.

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
