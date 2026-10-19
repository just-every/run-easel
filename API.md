# Easel HTTP API

The same routes serve the app and any agent acting for a signed-in person.
Every request needs that person's native session cookie; writes also need a
same-origin `Origin` header. Responses are JSON; refusals are
`{ "error": "..." }` with 400, 401, 403, 404, 409 or 413. A 409 means the plan
or the person's access changed (reload and decide again) or a reviewed
revision or fingerprint no longer matches.

## Reads

| Route | Returns |
|---|---|
| `GET /api/easel/state` | The person and role, workspace, lines, departments, scenarios they may see, submissions, comments, and (finance) people, mappings, imports and activity-free lists of snapshots and packs |
| `GET /api/easel/scenario/:id` | The scenario, its inputs the person may see, and its calculation: every cell (line, department, month, amount, basis, sources with traces), line totals, profit, cash and warnings |
| `GET /api/easel/compare?a=&b=` | Monthly profit and cash of both, changed inputs, changed cells |
| `GET /api/easel/snapshot/:id` | An approved budget, kept forecast or published pack exactly as stored, with its SHA-256 (filtered by role) |
| `GET /api/easel/variance/:month` | For a closed month: actual, budget, kept forecast, variance, accepted rows, budget sources, hypotheses, draft and saved explanation per line and department |
| `GET /api/easel/actuals` | Finance: month-by-month reconciliation and unmapped accounts |
| `GET /api/easel/activity` | Finance: the latest 300 activity events with revisions before and after |
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
- Cycle: `forecast-window` (finance) {scenario, revision, months: 12..60}; `request-submissions` (finance) {scenario, departments, due}; `comment` {scenario, department, text}; `submit` {scenario, department}; `return-submission` (finance) {scenario, department, reason}; `approve-budget` (finance) {scenario, revision, note}; `close-month` (finance) {scenario, month}.
- Review: `explanation` and `explanation-confirm` {month, line, department, text}; `pack-create` (finance) {month}; `pack-decision` (finance) {pack, text, owner, due}; `pack-publish` (finance) {pack}; `action-status` (finance) {pack, decision, status, note}.

## Move-in kits: `POST /api/easel/import/:kit/:op` (finance)

- `actuals`: `preview` {csv, filename, columns, amountMode, dateFormat, allowRepeats}; `commit` {…same, fingerprint, acknowledgeRejected}; `resume`, `undo`, `status` {id}.
- `workbook`: `preview` {base64, filename, sheet?, lineMap?, departmentMap?}; `commit` {…same, fingerprint}; `resume`, `undo`, `status` {id}.

`POST /api/easel/invite` {email} (finance) sends a person their sign-in invitation through Base.

The rolling window keeps that many future months after the last close. Closed months remain visible. Each close snapshots the current forecast before extending its end from the existing drivers. Budgets keep their fixed horizon.

## MCP

Agents can use the native-session [MCP endpoint](docs/mcp.md) at `POST /api/easel/mcp` for filtered reads and proposal, comment and explanation tools. Approval, close, publication and promotion stay with people.
