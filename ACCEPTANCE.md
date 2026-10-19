# Easel acceptance

## The first-release outcome

A finance lead at one company can set up the plan, move in a month of
general-ledger actuals and an existing Excel budget, build a driver-based
budget with department contributors, approve and freeze it, branch a downside,
take a contributor's proposal through exact-revision approval, close months
with actuals while keeping each prior forecast, explain variances from the
rows behind them, publish a review pack with decisions, and export the whole
installation and restore it elsewhere. All of it runs locally with uploaded
files and no provider account. That loop is the published contract
(`EASEL-001` to `EASEL-017`); the connected product beyond it is listed under
[Target and push-further acceptance](#target-and-push-further-acceptance).

This file separates implemented source from executed proof. Owner inputs that
fixtures cannot stand in for are listed at the end.

## Proof

| Clauses | Status | Proof | What it runs |
|---|---|---|---|
| EASEL-001 to EASEL-015 | done | `pnpm test:easel` (`tests/easel.test.mjs`): one flow test per clause | The deployed request path (auth then the Hono API) on real workerd and D1 with every migration, a real owner claim and real email-link sign-in for each contributor and viewer. No application fake. |
| EASEL-001 to EASEL-015 (as a person) | done | `node tests/browser.mjs`: planning journey at 1440 px, review journey at 390 px | Real `rer dev` with dev identity (owner, finance, sales, engineering, board), clicking only what a person can: setup, July CSV move-in with mapping and rejected rows, budget, submissions, approval, month close, cell traces, August move-in, variance explanations, pack publish and download, downside branch and comparison, a contributor proposal promoted by finance, the workbook move-in. Every tab at both widths is checked for horizontal overflow and screenshotted. |
| EASEL-016 | done | `node tests/browser.mjs` | `rer export`, refused import into a non-empty installation (exit 4), a second fresh clone set up with a different owner, refused corrupt archive, restore, then the restored owner sees the same state, every scenario's calculation, every snapshot and the reconciliation, the pack downloads, and the re-export has identical rows. |
| EASEL-017 | done | `node tests/browser.mjs`, `rer verify`, GitHub Verify | install, setup, check, describe, dev, setup rerun, build, preview (health 200, signed-out API 401), deploy --dry-run, export, import, reset, from a fresh clone of committed HEAD; `verify` runs build, typecheck, the flow tests, the emitted Worker's HTTP checks and the outbox email-link sign-in. |

GitHub **Verify** runs `rer install`, `rer verify` and `tests/browser.mjs` on
every push and keeps the journey screenshots, the downloaded pack and the
archives as an artifact of that run.

A source edit to the ramp rule (`src/easel/ramp.ts`) was demonstrated on a
running installation: the working forecast's January subscription revenue
changed while the approved budget snapshot kept the same SHA-256 and cells.
That is evidence, not a permanent test.

## Target and push-further acceptance

[CONTRACT.md](CONTRACT.md) defines the product Easel is being built towards:
86 target and push-further clauses beyond the published loop, each with the
acceptance evidence below. Status is judged from the code and tests at commit
`1086527233bf9ee39094c8b6c60c3e7257fa0780` (17 October 2026) and matches
CONTRACT.md's Status table: 44 partial, 42 missing, none yet accepted.
A build round that starts a clause registers it in `seed.json → capabilities`,
adds the flow test or journey named here through a public door (the HTTP API,
the browser at 1440 and 390, a `rer` command, an add-in host, a native build
or an import or export file), and only then marks it done. Fakes are allowed
only at a paid or network edge (provider, model, mail, chat, push). A
provider fake proves Easel's semantics, so every connector clause also needs
one recorded run against the provider's sandbox before acceptance.

### Connected actuals

| Clause | Status | Acceptance evidence |
|---|---|---|
| `CONNECT-001` — QuickBooks Online actuals connector | missing | Through the HTTP API against a recorded QuickBooks Online sandbox company (a fake only at the Intuit edge) holding 24 closed months, connect and see all 24 months backfilled and accepted, each with a reconciled trial balance; then pull two current months, map, accept, edit one transaction in the fake, pull again and see one changed row, no duplicates, and a reconciled trial balance; one recorded run against Intuit's live sandbox. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, see all accepted rows and follow a row's link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows. |
| `CONNECT-002` — Xero actuals connector | missing | The `CONNECT-001` journey, including the 24-month backfill, against a recorded Xero demo company, including two tracking categories mapped to two dimensions; one recorded run against Xero's live demo company. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, see all accepted rows and follow a row's link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows. |
| `CONNECT-003` — NetSuite actuals connector | missing | The `CONNECT-001` journey, including the 24-month backfill, against a recorded NetSuite SuiteQL fake with two subsidiaries; one recorded run against a NetSuite sandbox account. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, see all accepted rows and follow a row's link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows. |
| `CONNECT-004` — Pantry actuals connector | missing | Two local installations (Pantry and Easel) where Easel backfills every closed month Pantry holds, pulls a current month, a Pantry correction shows as a changed row on the next pull, and trial balances agree. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, see all accepted rows and follow a row's link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows. |
| `CONNECT-011` — Sage Intacct actuals connector | missing | The `CONNECT-001` journey, including the 24-month backfill, against a recorded Sage Intacct fake of Web Services or REST general-ledger detail with two entities, two locations and three departments, where locations and departments map to two Easel dimensions and each entity's trial balance reconciles; a variance cell's row links to the Intacct fake's entry URL (`CONNECT-008`); one recorded run against a Sage Intacct sandbox company. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, see all accepted rows and follow a row's link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows. |
| `CONNECT-005` — Scheduled refresh with visible freshness | missing | A Workers journey with the scheduled handler, a provider fake and a mail fake: refresh on schedule; fail, and show the error with data unchanged while finance receives one refresh-failure notification naming the source and error (`CYCLE-003`); go stale; and post a change to a closed month that produces a restatement notice instead of a changed pack. |
| `CONNECT-006` — Mapping rules that survive refresh | done | The API journey maps by range, pulls a month containing a new in-range account (mapped and listed) and a new out-of-range account, and sees the dependent month's reconciliation blocked until finance maps it. `tests/mapping-rules.test.mjs` (CONNECT-006) asserts current CSV range/prefix/type rules, exact overrides, conflicting rules, no-write preview, stale-review refusal, cash and citations, period-dependent blocking (including zero-net rows), restored mappings and frozen arithmetic. `tests/mapping-rules-browser.mjs` creates rules, previews automatic and unmapped accounts, resolves the exception and accepts reconciled actuals at 1440/390. Numeric ranges are inclusive; leading zeros compare numerically; prefixes/types are case sensitive after trimming; exact mappings take priority and conflicting rule targets are unresolved. Current CSV doors are proven. Before shipping, CONNECT-001/002/003/004/011 inherit provider refresh/metadata resolution, CONNECT-007 inherits balance-sheet targets, and MODEL-003 inherits custom dimension mappings and finer line/dimension-level dependency blocking, as asserted in their own acceptance rows. |
| `CONNECT-007` — Balance-sheet actuals and the trial balance | partial | The API journey accepts a ledger month with balance-sheet accounts, reads a zero-sum trial balance, closes the month and sees the forecast balance sheet open from those balances. Also assert inherited CONNECT-006 rules targeting supported balance-sheet lines: a new in-range balance-sheet account maps automatically, and an unresolved balance blocks dependent balance-sheet conclusions until mapped. |
| `CONNECT-008` — Drill-through to the ledger transaction | done | `tests/drillthrough.test.mjs` (CONNECT-008) asserts every one of 210 accepted source rows (file, line, date, description, reference and amount), exact cell reconciliation, contributor scope and viewer amounts with no restricted rows. `tests/easel.test.mjs` asserts department filtering, and `tests/mapping-rules-browser.mjs` opens a variance cell and displays all twelve accepted rows as finance, with amounts but no rows as a viewer, at 1440/390. Current CSV doors are proven. CONNECT-001/002/003/004/011 each inherits the provider-fake follow-link journey in its text and acceptance row before shipping. |
| `CONNECT-009` — Bank balances for current cash | missing | A Plaid sandbox fake supplies two accounts; the 13-week view and a cash alert use the bank balance and label it as such; no payment route exists. |
| `CONNECT-010` — Connection custody and status | missing | Connect and disconnect a provider fake through the API; the archive from `rer export` and the stored rows contain no planted token; a contributor's connect attempt is refused with 403; the audit trail shows both actions. |

### Flexible model

| Clause | Status | Acceptance evidence |
|---|---|---|
| `MODEL-001` — Configurable horizon and multi-year plans | partial | The API journey sets a 36-month horizon starting in a fiscal year that begins in October, and reads monthly, quarterly and annual totals that agree to the cent; a second plan on a 4-4-5 calendar reads periods of 4, 4 and 5 weeks in each quarter, with each quarter's total equal to the sum of its three periods and the year equal to its four quarters, to the cent. |
| `MODEL-002` — A rolling forecast that extends itself | done | `tests/rolling-forecast.test.mjs` (`MODEL-002`). With an 18-month window, close two months in the API journey and see the forecast end move by two months, the new months calculated from drivers, and both kept forecasts unchanged. |
| `MODEL-003` — Custom dimensions and hierarchies | partial | The API journey adds a Region dimension with a two-level hierarchy, enters inputs by region, maps a provider class to it, and reads a report that rolls regions up to the total without changing line totals; it then builds a chart-of-accounts hierarchy (for example Operating expense, then Sales and marketing, then Advertising and Events) and reads subtotals equal to the sum of their lines in every month. Also assert inherited CONNECT-006 source department/class/tracking-option rules for custom dimension members, and finer line/dimension-level blocking: an unresolved member blocks its dependent cells while unrelated cells remain available, with no invented zero. |
| `MODEL-004` — User-defined formulas and driver lines | partial | The API journey defines a support-cost driver as tickets per customer × cost per ticket with a lookup by region, reads exact cells with traces, and is refused a circular formula with the cycle named. |
| `MODEL-005` — Versioned model structure | partial | Change a formula in the API journey, read the structure diff and moved cells, and confirm the approved budget snapshot keeps its SHA-256 and cells. |
| `MODEL-006` — Starter models for US small businesses | missing | In the browser at 1440, create a company from each starter (SaaS, professional services, project or backlog, and wholesale or ecommerce) and, for each, see a three-statement forecast, a dashboard and a cash view without entering a formula; the services starter's revenue traces to billable headcount × utilization × rate, the project starter's to milestones and backlog, and the wholesale starter's cash to inventory days. |
| `MODEL-007` — Recalculation at small-business scale | partial | A load fixture at the stated size through the API, timing 50 edits at p95, and a larger bulk import showing calculation state in the browser. |
| `MODEL-008` — Planning grid entry | partial | In the browser at 1440 and 390, a contributor opens their department's budget during a requested submission, pastes a 3 × 12 block copied from a spreadsheet, spreads $120,000 across twelve months evenly ($10,000 a month) and then by prior-year actual shape (each cell in the prior-year proportion, summing to exactly $120,000), copies a value forward, splits one cell into two vendor sub-rows that total the cell, adds a note, and reads the cells and note back through the API. A proportional spread of $60,000 over three cells holding $1,000, $2,000 and $3,000 reads $10,000, $20,000 and $30,000; a 10% increase and then a $500 decrease on a selection read exactly; undo of the last grid save restores the previous values of exactly the cells it changed; a save at a stale revision returns 409 and changes nothing; a pasted block that reaches into another department's row lists that cell's address as refused and leaves that department's cell unchanged; typing over a driver-calculated cell is refused and its trace shows. Another department's contributor and a viewer read the same cell through the API and receive its total without the sub-rows or vendor names, and the page has no horizontal overflow at 390. |
| `MODEL-009` — Plans built from actuals history | partial | With 24 closed months accepted, the API journey defines a line as prior-year same-month actual × 1.05 and reads each cell equal to that actual × 1.05 rounded once, with a trace citing the actual cell; defines a line as the trailing three-month average of actuals and reads each cell equal to the three prior months' actuals ÷ 3 rounded once, with a trace citing all three; seeds a budget scenario from prior-year actuals with 5% growth on one line and reads its inputs; and, for a month with no accepted actuals, is told which month is missing rather than given zero. In the browser at 1440, the grid and the scenario view of that budget show each closed and prior-year month's actual beside the plan cell, equal to the API's actual for that month and line. |

### Three statements and cash

| Clause | Status | Acceptance evidence |
|---|---|---|
| `FIN-001` — Linked P&L, balance sheet and cash flow | partial | The API journey reads three statements for 24 months and asserts assets equal liabilities plus equity in every month and that cash-flow closing cash equals balance-sheet cash. |
| `FIN-002` — Working-capital timing | partial | The API journey sets 45-day DSO, a 30-day term on one vendor line and an annual-upfront plan, and reads receivables, payables, deferred revenue and cash that agree with the traces; a $24,000 annual insurance prepayment amortises at $2,000 a month with the prepaid balance declining to zero; payroll earned but unpaid at a month end is accrued and settles on the next pay date; and a quarterly bonus accrues monthly and settles in its pay month, with accrued liabilities and cash agreeing with the traces. |
| `FIN-003` — Debt and financing | missing | The API journey adds a line of credit with a minimum-cash covenant, draws on it in a downside, and reads interest, balances and a covenant breach month; it then plans a $5,000,000 equity raise in a month and reads the cash inflow and the equity increase on the balance sheet with no profit-and-loss effect. |
| `FIN-004` — Capex and depreciation | done | The API journey adds $120,000 of equipment over 5 years and reads $2,000 of monthly depreciation, net book value and the cash outflow. |
| `FIN-005` — Runway, burn and an agreed cash floor | done | `tests/cash-health.test.mjs` and `tests/cash-health-browser-journey.mjs` (FIN-005). The API and browser journeys set a $500,000 floor, branch a downside that crosses it, and see the crossing month and runway on the scenario, the comparison and the dashboard. Through the API, each month's gross burn, net burn and runway equal values computed by hand from that month's cash in and out, and a scenario whose cash runs out reads its cash-zero date as the first month with closing cash below zero. |
| `FIN-006` — US tax estimates in the forecast | partial | The API journey plans one $180,000 W-2 position and reads Social Security stopping at the wage base within the year, Medicare continuing, FUTA on the first $7,000, SUTA at an entered 2.7% state rate stopping at an entered state wage base, and an income-tax line on a profitable month; a loss in an early month is carried forward and reduces income tax in a later profitable month; and sales tax collected on an invoice flows into cash and out through a sales-tax payable without changing revenue. |
| `FIN-007` — 13-week cash forecast | missing | With ledger, payroll and bank fakes holding open invoices and bills, a semimonthly pay schedule, a term-loan payment and a planned spend line, the API journey reads 13 weeks in which each invoice lands in the week its customer's paid-invoice history puts it (a customer averaging 12 days late lands 12 days after its due date), each bill on its due date, each payroll run on its run date, the loan payment in its scheduled week and the planned spend in its planned week; the month-end weeks agree with the monthly cash forecast, and an override keeps its note. |

### Headcount and compensation

| Clause | Status | Acceptance evidence |
|---|---|---|
| `PEOPLE-001` — Roster and payroll actuals from Gusto | missing | A recorded Gusto demo-company fake; the API journey connects, sees reconciliation buckets, accepts matches, and confirms a viewer receives headcount totals without names or salaries; one recorded run against Gusto's demo environment. |
| `PEOPLE-002` — Roster from Rippling, Willow, BambooHR and ADP | missing | The `PEOPLE-001` journey against a fake for each provider, with an unmapped custom field listed rather than dropped. |
| `PEOPLE-003` — Open roles from the ATS | missing | An ATS fake opens a requisition, then marks an offer accepted with a later start; the API journey sees a proposal with the changed start and cost and promotes it. |
| `PEOPLE-004` — US compensation assumptions | partial | The API journey plans a salaried W-2 engineer with a merit increase, a commissioned salesperson tied to pipeline bookings, a 1099 contractor with no employer tax, an hourly W-2 position at $40 × 120 hours a month, and a salaried position carrying a 10% bonus paid in March, $1,200 a month of benefits, a 4% 401(k) match and a department on-cost default overridden on that position; each monthly cost reads as traced components (salary or hours × rate, merit, bonus, commission, benefits, 401(k) match and each employer tax) that sum to the cell. |
| `PEOPLE-005` — Compensation access separate from finance | partial | Through the API and the Excel add-in fake, an analyst without pay access, a department head and a viewer each read the same plan, and none receives a salary they are not granted; a planted salary never appears in their exports. |
| `PEOPLE-006` — Headcount plan against actual | partial | After a roster pull with one late hire and one departure, the API and browser journeys show plan against actual headcount and cost by department, with the slippage in days. |
| `PEOPLE-007` — Roster and payroll-register file import | missing | Through the API, import a Justworks-shaped roster CSV and an .xlsx payroll register: the preview writes nothing; the accepted import shows the four reconciliation buckets and a register total reconciled to the ledger's payroll lines; a viewer receives headcount and cost totals without names or salaries; a second file in the same shape needs no column choices; and undo removes exactly what the import wrote. |

### Revenue and pipeline

| Clause | Status | Acceptance evidence |
|---|---|---|
| `REV-001` — Pipeline drivers from Orbit, HubSpot and Salesforce | missing | A HubSpot fake with deals at three stages; the API journey sets probabilities and slippage, reads weighted bookings and revenue traced to deal IDs, moves a deal's close date in the fake, refreshes, and sees the revenue move; one recorded run against a HubSpot developer test account. The same journey against a recorded Salesforce fake of Opportunity, OpportunityLineItem and fiscal-period records: a custom stage whose CRM probability is 60% is overridden by finance to 40%, and weighted bookings use 40% with the trace labelling the override; an opportunity with a one-time setup product and a 12-month subscription product recognises the first in its close month and the second ratably over 12 months; a close date inside a custom fiscal period lands in that period; one recorded run against a Salesforce Developer Edition org. Two local installations (Orbit and Easel), as in `CONNECT-004`: Easel pulls Orbit's deals, a deal's close date changed in Orbit moves its revenue on Easel's next refresh, and the trace cites the Orbit deal ID. Also assert inherited CYCLE-002 next-quarter pipeline coverage rules: a below-threshold refresh creates a cited owned/due task, a second refresh does not duplicate open work, and live owner/task authority and blocked-source handling hold. |
| `REV-002` — Subscription metrics from Stripe Billing and Nectar | missing | A Stripe fake with subscriptions, upgrades, downgrades and cancellations across three months; the API journey reads an ARR bridge and a cohort table that agree with hand-computed values, and a reconciliation to ledger revenue; one recorded run against Stripe test mode. |
| `REV-003` — A revenue driver library | partial | The API journey plans one line per driver form and reads exact traced cells. |
| `REV-004` — Bookings, billings, revenue and cash | missing | A $120,000 annual-upfront booking in the API journey produces a $120,000 billing, $10,000 a month of revenue, a declining deferred-revenue balance and collection by the DSO. |

### Spend

| Clause | Status | Acceptance evidence |
|---|---|---|
| `SPEND-001` — Committed and card spend | missing | A Ramp fake and a Purse fake add a card transaction and a purchase order; the API journey reads budget, committed, actual and remaining for the affected department. |

### Spreadsheets

| Clause | Status | Acceptance evidence |
|---|---|---|
| `SHEET-001` — Excel add-in with live formulas | partial | An Office.js test host loads the add-in against a running Easel, in a workbook holding `=EASEL.VALUE(...)` cells and a plain `=SUM(...)` over them: the functions return role-filtered values; a value changed in Easel through the browser or the API, followed by an on-demand refresh, shows the new value in its function cell and the new total in the `SUM`; after a second Easel change, closing and reopening the workbook refreshes on open and shows that change in the cell and the `SUM`; a viewer refreshing the same workbook receives role-filtered values without restricted detail; during a requested submission a contributor's write to their own department lands directly at the next revision and reads back in the browser and the API; after they submit, the same write returns as a proposal bound to the revision; a write to the approved budget and a write to another department are refused; one recorded run in Excel on the web. |
| `SHEET-002` — Google Sheets add-on with live formulas | missing | An Apps Script test harness against a running Easel replays the `SHEET-001` journey, including the on-demand refresh, the refresh on open and a `SUM` over Easel cells recalculating after each, and the viewer's role-filtered refresh; the harness then fires the installable time-driven trigger with the spreadsheet closed, and on reopening the sheet shows an Easel change made before the trigger ran; one recorded run in a Google Workspace test domain. |
| `SHEET-003` — Model import that keeps formulas | partial | Import a fixture workbook model with cross-sheet formulas and one unsupported function; the import report lists the unsupported cell, Easel totals equal the workbook totals, a driver change recalculates the translated formulas, and undo removes the import. |
| `SHEET-004` — Excel exports with formulas | done | Download a report as .xlsx through the browser, open it with a spreadsheet library in the test, and assert that subtotal cells hold formulas that evaluate to Easel's totals. |
| `SHEET-005` — Scheduled spreadsheet pulls | missing | A Google Sheets fake changes two cells and then deletes a column between scheduled pulls; the API journey sees a proposal with two changed cells, then a shape error with no write. |

### Planning cycles and collaboration

| Clause | Status | Acceptance evidence |
|---|---|---|
| `CYCLE-001` — Budget calendar, tasks and reminders | partial | With a fake clock and mail and chat fakes, the API journey requests submissions due Friday; a reminder goes out Thursday morning Eastern, the reminder for a submitted department is cancelled, and an overdue department escalates to finance on Monday. |
| `CYCLE-002` — Metric-triggered tasks | done | `tests/metric-tasks.test.mjs` and `tests/metric-tasks-browser.mjs` (`CYCLE-002`). A 10% overspend rule precedes actuals acceptance/close; the contributor receives one owned/due task with actual, budget, variance and source citations, without duplicate on repeated refresh. Strict AND bounds, zero-budget expense, late correcting imports, frozen open-task evidence, live role/department authority, blocked owners and exact unrounded runway checks are asserted. At 1440/390 finance creates/checks/disables rules, reads evidence, and the assignee completes work with persisted attribution; viewers see no metric UI. Current actuals/runway metrics complete this clause under ct 19 October pattern 1; REV-001 inherits next-quarter pipeline coverage rules/evaluation/dedup before shipping. Due dates use UTC calendar days; completed work may trigger again on a later check; notification delivery remains CYCLE-003. |
| `CYCLE-003` — Notifications from discussions and events | missing | With mail, Slack, Microsoft Teams and Nook fakes and a fake clock, the API journey produces one notification per event type, each linking to its record: a mention in a variance explanation (email and Slack), a returned submission to its contributor (email and Teams), a pending approval to finance, a restatement notice to finance, a failed refresh to finance, and a triggered task to its owner (Nook). A person who chose Teams only receives no email, and a digest-only person receives all their events in the next daily digest instead. |
| `CYCLE-004` — Private and shared scenarios | partial | The API journey creates a private scenario for a contributor, confirms another contributor and a viewer get 404 for it, shares it read-only with the viewer, and confirms the viewer can compare but not edit. |
| `CYCLE-005` — Quarterly reforecasts and version comparison | done | `tests/reforecasts.test.mjs` (`CYCLE-005`) asserts exact-revision Q2/Q3 freezes, stale and duplicate refusal, immutable full models, source deletion, closed actual against budget/every named/current values, role-filtered reads/exports, live metadata and currency changes, differing horizons, and report/pack Excel formulas plus saved HTML/CSV. Names are trimmed and case-insensitively unique; closed current forecasts include accepted actuals; variance is actual minus version in minor units, absent periods have no value, and differing currencies have no variance. `tests/review-fixes.test.mjs` and `tests/restore-flow.mjs` (`AUDIT-001 CYCLE-005`) exercise real CLI export/restore with exact bodies/hashes and tamper refusal. `tests/reforecasts-browser.mjs` (`CYCLE-005`) saves versions, edits, closes, compares and downloads as finance/viewer at 1440/390. |
| `CYCLE-006` — Long-range plan linked to the operating plan | done | `tests/long-range.test.mjs` (`CYCLE-006`) asserts five years and a 40% growth target, year-one operating-budget equality, every later driver and revenue/profit/headcount/cash gap, three-year edits, exact rounding, revision refusal, aggregate role filtering, frozen budget linkage and independently evaluated Excel formulas. `tests/long-range-browser.mjs` creates and reads plans, reconciliations and Excel as finance/board at 1440/390 without page overflow. Revenue targets compound entered prior-year revenue; profit uses the target operating margin; headcount and cash targets are fixed year-end targets. Working budgets remain live; approved budgets use their captured arithmetic. |

### Reporting

| Clause | Status | Acceptance evidence |
|---|---|---|
| `REPORT-001` — Report builder | partial | In the browser at 1440, build a department-by-quarter report of actual against budget with year-to-date, trailing-twelve-month, prior-year actual and year-over-year % columns, a department filter and a highlight rule; save it, share it with a viewer, and confirm through the API that the viewer's copy omits restricted detail. Year-to-date and trailing-twelve-month cells equal the sum of their months, and year-over-year % equals (actual − prior-year actual) ÷ prior-year actual, to the cent. With a mail fake and a fake clock, schedule the report weekly for Monday 8:00 Eastern to finance and a viewer: on Monday each receives one email, and the viewer's copy omits restricted detail. |
| `REPORT-002` — Dashboards | partial | In the browser at 1440 and 390, build a dashboard with runway, ARR and headcount tiles, share it with the board persona, and see the same numbers in the API without horizontal overflow. |
| `REPORT-003` — Board pack | partial | Generate a quarter pack in the browser, refresh it after a late adjustment with commentary kept, publish, download PDF, .pptx and .xlsx, and confirm through the API that the published numbers do not change after a later refresh; save the published pack to a Chest folder, a Google Drive folder and a SharePoint library through fakes, each holding a PDF with the same digest. |
| `REPORT-004` — Linked PowerPoint and Word reporting | missing | An Office.js test host inserts a table and a number into a .pptx, refreshes after an Easel change, and sees the new values. |
| `REPORT-005` — Department budget-owner reporting | partial | Close a month in the API journey with mail fakes; the engineering contributor receives a statement for Engineering only, and a link opens their variances. |
| `REPORT-006` — Scheduled cash alerts | missing | With a fake clock, a bank fake and mail and Slack fakes: a refresh that drops forecast lowest cash below the floor sends one alert with the crossing month; bank cash $60,000 below plan under a $50,000 rule sends one alert, and a 10% rule fires the same way; runway falling to 11 months under a 12-month rule sends one alert; a second refresh with no change sends none; a refresh that worsens the breach re-alerts once; an unchanged breach re-alerts after the set interval (for example seven days) on the fake clock; and acknowledgement is recorded. |
| `REPORT-007` — BI and warehouse feeds | missing | A warehouse fake supplies a monthly metric that drives a revenue line; a BI client fake reads the dataset endpoint with a scoped token and receives no pay detail; a scheduled nightly drop writes CSV and Parquet files to a storage fake whose rows equal the dataset endpoint's, with no pay detail. |

### Access, audit and governance

| Clause | Status | Acceptance evidence |
|---|---|---|
| `ACCESS-001` — Groups and per-dimension permissions | partial | The API journey makes a group with edit on two departments and no pay access, adds a person, and confirms reads, writes and exports respect it; the access report lists it. |
| `ACCESS-002` — SSO and SCIM | missing | With an IdP fake, sign in one person by SAML and another by OIDC; provision a person and a group by SCIM, add the person to the group by a SCIM group update and see the group's grants (`ACCESS-001`) apply, remove them and see the grants end; deprovision the person and see their session refused on the next request while their past submissions still show their name. |
| `AUDIT-001` — Model audit trail | done | Through the API, make changes as three people, filter the trail by one person and one scenario, export it as CSV, and confirm the database refuses to update or delete a trail row. |
| `ERASE-001` — Person erasure | missing | Through the API, erase a contributor who submitted and commented; their name is absent from live views, pack downloads and `rer export`, their submissions show the pseudonym, the snapshot digest is unchanged, and the receipt and audit row exist. |
| `API-001` — Public API with scoped tokens | done | Issue a read-only token, read a scenario, be refused a write, revoke the token and be refused a read. |
| `API-002` — Webhooks and automation apps | missing | Register a webhook receiver fake, approve a budget, and receive one signed event with a verifiable signature; replaying it is detectable by its ID. The Crank, Zapier and Make apps each run against a running Easel in that platform's developer test tooling (a local Crank installation, the Zapier Platform CLI, and a Make custom app in a test organisation): a trigger receives an approval event, and a create-proposal action creates a proposal bound to the revision. |
| `API-003` — MCP endpoint for outside agents | done | `tests/mcp.test.mjs` (`API-003`). An MCP client signed in as a contributor lists tools, reads a variance, creates a proposal, and is refused the approve and promote tools. |

### Entities, currency and US defaults

| Clause | Status | Acceptance evidence |
|---|---|---|
| `ENTITY-001` — Multiple entities and management consolidation | missing | Two entities with an intercompany management fee; the API journey reads entity and consolidated statements in which the fee and the intercompany balance are eliminated and consolidated totals equal the sum less eliminations; the same holds when both entities arrive from one Sage Intacct multi-entity connection fake (`CONNECT-011`). |
| `ENTITY-002` — Multi-currency planning | missing | A CAD entity with budget and actual rates; the API journey reads USD statements, a translation adjustment, and a constant-currency variance. |
| `US-001` — US defaults | partial | Set up a new company in the browser without changing defaults and see USD formatting, US dates and an Eastern-time reminder schedule; import a CSV with MM/DD/YYYY dates and $-formatted amounts. |

### Move in and out

| Clause | Status | Acceptance evidence |
|---|---|---|
| `MOVE-001` — Move in from Adaptive Planning | missing | A fixture export in the shapes of Adaptive's documented API calls (`exportLevels`, `exportAccounts`, `exportDimensions`, `exportAttributes`, `exportVersions`, `exportData` and `exportConfigurableModelData` for a personnel sheet) and a sheet export; the import report lists created levels, accounts and versions and the unmapped items; budget totals equal the export's totals. The personnel-sheet fixture holds three employees and two to-be-hired rows, one row carrying a 10% bonus and a merit increase on a date, and one custom column with no Easel equivalent: the import creates five positions, two of them to be hired, whose monthly cost per payroll account equals the export's payroll-account totals for the same version to the cent, with the bonus and merit as traced components (`PEOPLE-004`); the custom column is listed as unmapped; a viewer reads headcount and payroll totals through the API without names or salaries, in the preview and after acceptance; undo removes the import, the positions included. |
| `MOVE-002` — Move in from Planful | missing | The `MOVE-001` journey with a fixture in Planful's documented export shapes. |
| `MOVE-003` — Move in from Anaplan, Runway and Pigment | missing | The `MOVE-001` journey with one fixture per product in its documented export shape. |
| `MOVE-004` — A parallel month against the old tool | done | `tests/parallel-month.test.mjs` and `tests/parallel-month-browser.mjs` (`MOVE-004`). The fixture produces exactly one mapping and one formula difference; actual, budget and kept pre-close forecast agree or differ to the cent across the union of line/department rows (absent sides are zero). Finance-only record access (ct, 19 October), no-write preview, exact-digest save, all four explicit classification kinds with explanations, exact-revision/digest sign-off, attribution and frozen source/values after later model edits are asserted through HTTP. At 1440/390 finance uploads the normalized CSV, previews, saves, classifies, signs and reloads the frozen record with both digests and signer/time; viewers have no comparison door. Sign-off records the decision before an external switch; no switch or automatic causal classification is claimed. |
| `PORT-001` — An export a buyer can open without Easel | done | Download the open export, unzip it in the test, check every manifest digest, and open a scenario workbook whose totals equal Easel's. |

### Anywhere

| Clause | Status | Acceptance evidence |
|---|---|---|
| `MOBILE-001` — Review and approve at phone width | done | `tests/mobile.mjs` and `tests/browser-journey.mjs` (MOBILE-001). The browser journeys at 390 move in actuals, close a month and confirm an explanation (as today), and also submit a department, approve the budget, promote a proposal and read a dashboard, with an overflow check on every page. |
| `MOBILE-002` — Native iOS and Android apps | missing | A native test build on an iOS simulator and an Android emulator signs in against a running Easel, receives a push for a cash alert through a push fake, and approves a pending proposal. |
| `HOST-001` — Hosted operation on the buyer's Cloudflare account | partial | A deploy to a test Cloudflare account, a health check, a scheduled refresh run, a delivered invite email and a restore from backup. |

### Push further: agents that keep the plan feasible

| Clause | Status | Acceptance evidence |
|---|---|---|
| `AGENT-001` — Constraint watch | partial | With provider fakes, a refresh that slips a large deal by two quarters breaks the cash floor; one decision item names the crossing month and cites the deal ID and stage change; the plan's revision is unchanged. |
| `AGENT-002` — Feasible responses for the owner to choose | partial | For the `AGENT-001` item, the agent returns at least three proposals that each satisfy the floor in a recalculation; a lever not marked adjustable is unchanged in all of them; promotion of one goes through `EASEL-012`. |
| `AGENT-003` — Asking owners for uncertain assumptions | missing | With a Slack fake, the agent asks the deal owner, the answer "new date 15 January" becomes an assumption with its source, and the forecast moves; an unanswered question escalates without changing the assumption. |
| `AGENT-004` — Learning from the company's own forecast errors | partial | A fixture history in which deals close on average 34 days late; the agent proposes a slippage assumption of about 34 days with a backtest showing lower error on past kept forecasts; nothing changes until finance promotes it. |
| `AGENT-005` — Source-change guard | partial | A refresh with a new account named like an existing software line and a missing payroll run; the agent proposes the mapping with its reason, lists the affected reports, and the cash alert for that month is held as blocked rather than computed. |
| `AGENT-006` — Following decisions through to results | partial | A decision to delay two hires to July is published; the agent chases the hiring manager before the due date, and after July closes it reports the realised payroll saving against the approved assumption. |

### Push further: agents that explain and model

| Clause | Status | Acceptance evidence |
|---|---|---|
| `AGENT-007` — Variance commentary grounded in sources | partial | With a model fake at the API edge, the agent drafts an explanation that cites row IDs that exist; a citation to a row that does not exist is refused by the server; an unconfirmed draft is absent from the published pack. |
| `AGENT-008` — Modeler agent | partial | With a model fake, the request produces a proposal whose diff adds the named positions and drivers; promotion by a person without model-structure permission is refused. |
| `AGENT-009` — Analyst with cited answers | missing | With a model fake, a viewer asks about payroll by department and receives totals only; a planted salary is absent from the request sent to the model fake and from the answer. |
| `AGENT-010` — Recurring missions | missing | With a fake clock, mail and model fakes, a weekly cash brief runs Monday, is delivered to two people, and reports stale sources when a connector is stale. |
| `AGENT-011` — Agent governance | partial | With a model fake, an agent run is recorded with its person, model and cost; at the budget, further runs are refused; the stop switch ends a running agent; an agent call to approve or promote is refused by the server. |

## Not applicable or not yet proven

- **Prior-data upgrade:** the boundary is the installed database of the earlier
  Easel application to package mode on `rer` 0.2.0.
  Applied migrations `0001` through `0007` remain byte-identical. The executed
  in-place upgrade retained all 495 original rows across 67 tables; five role
  models, four snapshots and the published HTML/CSV outputs stayed identical.
  Workbook undo, new writes and two setup reruns passed. Base's origin-scoped
  local cookies require people to sign in again; native session rows remain.
- **Old backups:** A pre-upgrade export restores only with the release that made it.
  Keep a private export and that release before upgrading. To recover, restore into
  an empty installation of that release, upgrade that installation in place by running
  `rer install` and `rer setup` inside that existing checkout, then export again with the upgraded release. Do not
  import a pre-upgrade export directly into a newer release. The starting version
  writes v1 archives; the upgraded release requires v2. The in-place upgrade proof
  above does not establish direct cross-release archive restore.
- **Owner data:** no owner export, anonymised company or parallel month was
  supplied. The fixtures in `fixtures/` are synthetic files in the documented
  shapes; they prove Easel's behaviour, not compatibility with any real
  accounting or planning product's export.
- **Hosted operation:** `deploy --dry-run` only. No Cloudflare account,
  deployment, hosted health or real mail delivery is claimed.
- **Connectors and hosted AI:** none shipped yet. Agents work through `API.md`
  as a signed-in person; no model is called by Easel. The connector and agent
  clauses above (`CONNECT-*`, `PEOPLE-*`, `REV-*`, `SHEET-*`, `AGENT-*`) are
  the target and are not claimed.
- **Economics:** no current-process baseline was supplied, so no saving in
  cost or attention is claimed.

## Limits

CSV actuals: 2 MB and 5,000 rows per file. Workbooks: 5 MB. Import batches
apply 100 rows at a time, two batches per request, continued explicitly. The
plan year is twelve months from the first plan month. One reporting currency.
