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

- Setup (finance): `workspace` {name, currency, fiscalYearStart, planStart}; `department` {id?, name, shared}; `department-delete` {id}; `line` {id?, name, type: revenue | cost-of-sales | operating-expense, payroll}; `line-delete` {id}; `member` {email, name, role: finance | contributor | viewer, departments, active}; `account-map` {account, target: lineId | excluded | cash}; `department-map` {source, department}.
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
