# Easel contract

Target edition: 17 October 2026. Easel is connected FP&A for small and mid-size finance teams. A US finance lead or fractional CFO buys it instead of Workday Adaptive Planning, Planful or Anaplan, and it has to beat what Runway, Pigment and Aleph offer the same buyer. It provides flexible driver models; rolling profit-and-loss, balance-sheet and cash forecasts; headcount and compensation planning; scenarios; and board reporting. All of it is fed live from the ledger, payroll and the CRM, with every number traceable to its source and every approval kept as an immutable record.

This contract describes the product Easel is being built towards, not only what exists today. The [Status](#status) table shows how close the current code is. The 17 published clauses (`EASEL-001` to `EASEL-017`) are the shipped monthly planning loop. The target clauses complete the category job, and the push-further clauses take agents beyond today's up-and-comers. Difficulty (provider OAuth apps, Office add-ins, payroll and CRM connectors, native apps) is engineering work recorded as a clause. It is never a reason to drop scope.

## Product target

| | |
| --- | --- |
| Category | FP&A (financial planning and analysis) software |
| Incumbents a buyer switches from | Workday Adaptive Planning, Planful, Anaplan, Runway, Pigment, Aleph |
| First buyer | A US finance lead or fractional CFO at a business with 25 to 250 employees, closing its books in QuickBooks Online, Xero or NetSuite, paying people through Gusto or Rippling, selling through HubSpot or Salesforce, and planning in USD |

For that buyer, switching means that their ledger, payroll roster, pipeline and subscription data arrive through live connectors; their Excel or Google Sheets model arrives with its formulas; every planning job they ran in the incumbent (budget, rolling forecast, headcount, scenarios, department submissions, board pack, cash alerts) has an Easel equivalent; and their old tool's versions are imported with a list of what did not map.

A buyer replacing an incumbent needs the whole job, so the target is the whole job:

- **Connected actuals.** QuickBooks Online, Xero, NetSuite and [Pantry](https://github.com/just-every/run-pantry) actuals refresh on a schedule, with reusable account, department and class mapping, balance-sheet balances, freshness and drill-through to the ledger transaction (`CONNECT-*`, `EASEL-002` to `EASEL-004`).
- **A flexible model.** User-defined formulas, dimensions and hierarchies, a configurable rolling horizon, multi-year plans and starter models for subscription, services and project businesses (`MODEL-*`, `EASEL-006`, `EASEL-008`).
- **Three statements and cash.** A linked P&L, balance sheet and cash-flow forecast with receivables and payables timing, deferred revenue, debt, capex and depreciation, runway, a 13-week cash view and US tax estimates (`FIN-*`, `EASEL-005`).
- **Headcount and compensation.** A roster from Gusto, Rippling or [Willow](https://github.com/just-every/run-willow), open roles from [Lodge](https://github.com/just-every/run-lodge) or Greenhouse, and US compensation assumptions (W-2 and 1099, employer payroll taxes with wage bases, benefits, bonus, commission), with salary visible only to those allowed (`PEOPLE-*`, `EASEL-007`).
- **Revenue and pipeline.** Pipeline from [Orbit](https://github.com/just-every/run-orbit), HubSpot and Salesforce with explicit probability and timing assumptions, and subscription metrics (ARR, churn, cohorts) from Stripe Billing or [Nectar](https://github.com/just-every/run-nectar) (`REV-*`).
- **Spreadsheets kept live.** Two-way Excel and Google Sheets add-ins whose formulas stay live, model import that keeps formulas, and Excel exports with formulas (`SHEET-*`, `EASEL-015`).
- **Planning cycles.** Budget calendars, tasks, reminders and escalations, metric-triggered tasks, quarterly reforecasts, long-range plans, private and shared scenarios, groups and per-dimension permissions (`CYCLE-*`, `EASEL-009` to `EASEL-012`).
- **Reporting.** A report builder, dashboards, board packs in PDF, PowerPoint and Excel, scheduled cash alerts, and BI and warehouse feeds (`REPORT-*`, `EASEL-013`, `EASEL-014`).
- **Move in and out.** Imports from Adaptive Planning, Planful, Anaplan, Runway and Pigment exports, a parallel month against the old tool, and complete exports and restores (`MOVE-*`, `PORT-*`, `EASEL-016`).
- **Anywhere and governed.** Phone-width review and approvals, native iOS and Android apps with push, SSO and SCIM, an audit trail, person erasure, multi-entity and multi-currency plans, a public API, webhooks and an MCP endpoint (`MOBILE-*`, `ACCESS-*`, `AUDIT-*`, `ERASE-*`, `ENTITY-*`, `API-*`).
- **Agents that keep the plan feasible.** They watch actuals, pipeline and hiring, flag when a change breaks an agreed cash or runway constraint, compute feasible responses for the owner to choose, chase uncertain assumptions, and learn from the company's own forecast errors (`AGENT-*`).

### Neighbouring products stay separate

Easel is one product. Where the market sells a neighbouring product separately, Easel connects to it and does not rebuild it. When the neighbour is a Run Edit Run sibling, Easel connects to that sibling first and to the US incumbent second.

| Job | Owned by | How Easel meets it |
| --- | --- | --- |
| General ledger, bookkeeping and the close | [Pantry](https://github.com/just-every/run-pantry) (or QuickBooks Online, Xero, NetSuite) | Read-only actuals connectors and drill-through (`CONNECT-001` to `CONNECT-004`, `CONNECT-008`); Easel never posts a journal |
| Sales CRM and pipeline | [Orbit](https://github.com/just-every/run-orbit) (or HubSpot, Salesforce) | Pipeline drivers with finance-owned probabilities (`REV-001`) |
| Subscription billing | [Nectar](https://github.com/just-every/run-nectar) (or Stripe Billing, Chargebee) | Subscription metrics and cohorts as actuals and drivers (`REV-002`) |
| Core HR and the employee record | [Willow](https://github.com/just-every/run-willow) (or Rippling, BambooHR) | Roster and compensation sync (`PEOPLE-002`) |
| Recruiting | [Lodge](https://github.com/just-every/run-lodge) (or Greenhouse) | Open roles become planned positions (`PEOPLE-003`) |
| Payroll runs and tax filing | No sibling (Gusto, Rippling, ADP RUN) | Roster and payroll-cost actuals (`PEOPLE-001`); Easel estimates employer cost and never pays anyone |
| Expenses, cards and purchasing | [Coaster](https://github.com/just-every/run-coaster) and [Purse](https://github.com/just-every/run-purse) (or Ramp, Brex, Bill.com) | Committed and card spend in the forecast (`SPEND-001`) |
| Professional-services delivery | [Gauge](https://github.com/just-every/run-gauge) (or Harvest, Kantata) | Utilization and project revenue drivers (`REV-003`) |
| Team chat | [Nook](https://github.com/just-every/run-nook) (or Slack, Microsoft Teams) | Notifications, reminders and agent questions (`CYCLE-003`, `AGENT-003`) |
| Workflow automation | [Crank](https://github.com/just-every/run-crank) (or Zapier, Make) | Webhooks, API and published apps (`API-001`, `API-002`) |
| Identity provider | [Auth](https://github.com/just-every/run-auth) (or Okta, Microsoft Entra ID) | SAML SSO and SCIM (`ACCESS-002`) |
| Files and board decks storage | [Chest](https://github.com/just-every/run-chest) (or Google Drive, SharePoint) | Board packs saved to a chosen folder (`REPORT-003`) |

### How to read this contract

- **Published clauses** are the `- **ID — Title.**` bullets in [Published clauses](#published-clauses). Each one is registered in `seed.json → capabilities` and has a flow test in `tests/easel.test.mjs` and a browser journey in `tests/browser.mjs`.
- **Target clauses** are the `#### ID — Title.` headings in [Target clauses](#target-clauses), and **push-further clauses** are the ones in [Push further](#push-further). They are binding product requirements that are not yet registered. A build round that starts one registers it in `seed.json → capabilities` in the same change and adds its flow test. IDs never change.
- **Status** is `done`, `partial` or `missing`, judged from the code and tests at the commit named in [Status](#status). `done` means the behaviour ships and a cited test or journey exercises it. `partial` means some of it ships, or there is code with no test that exercises the behaviour. `missing` means there is no implementation. Status is a build-planning judgement, not acceptance. [ACCEPTANCE.md](ACCEPTANCE.md) decides acceptance.
- **Acceptance runs through public doors**: the HTTP API (`API.md`), the browser at 1440 and 390 pixels, `rer` commands, an Office or Google add-in, a native app, or an import or export file. Fakes are allowed only at a paid or network edge (a provider API, a model API, a mail or chat relay). A provider fake proves Easel's semantics, never live provider behaviour, so a connector clause also needs one recorded run against the provider's sandbox before it is accepted.

## Published clauses

These are the guarantees of the shipped monthly planning loop for one company. It uses uploaded files, local storage and a reporting currency chosen at setup, and needs no provider account. Posted accounting truth stays in the accounting system. Easel holds assumptions, estimates, alternatives, approvals and the review record. The target clauses below extend each of these into the connected product; none of them is withdrawn.

### The planning loop

- **EASEL-001 — Setup, roles and membership.** Finance (the claimed owner and any Base admin) sets the company name, reporting currency, fiscal-year start and first plan month (twelve months), departments (shared or not), planning lines (revenue, cost of sales, operating expense; payroll or not) and people. Contributors are scoped to named departments; viewers read. A signed-in person without an active Easel membership sees no plan data. *Acceptance:* `tests/easel.test.mjs` `EASEL-001` and the planning journey in `tests/browser.mjs`.
- **EASEL-002 — Actuals preview that writes nothing.** An actuals CSV preview reads the file with the person's column, sign and date choices and shows months covered, per-account totals with a sign check, department totals, and every rejected row with its line number and reason (malformed date or amount, missing account, both debit and credit, an exact repeat of an earlier line, a row already accepted in another import). The preview writes nothing. *Acceptance:* `tests/easel.test.mjs` `EASEL-002`.
- **EASEL-003 — Mapped, reconciled actuals acceptance.** An actuals file is accepted only when every account maps to a planning line, the cash balance or an explicit exclusion, every department maps, the reviewed preview fingerprint still matches, and finance confirms the rejected rows stay out. Acceptance goes through the Base import-kit journal with the exact original bytes. Reconciliation shows, month by month, that imported = mapped + excluded + cash + unmapped, with unmapped accounts listed. *Acceptance:* `tests/easel.test.mjs` `EASEL-003` and `tests/review-fixes.test.mjs`.
- **EASEL-004 — Exact undo of an actuals import.** Undo of an accepted actuals import removes exactly the rows it wrote, through the journal. An import whose months a forecast has already closed cannot be undone; a correcting file is imported instead. *Acceptance:* `tests/easel.test.mjs` `EASEL-004`.
- **EASEL-005 — Labelled opening cash and explicit cash timing.** Each scenario's opening cash is either an estimate the person enters or the balance imported from accepted rows mapped to the cash balance before the first plan month, and every cash figure says which. Collections and payments follow explicit lags (months) plus opening receivables and payables; payroll is paid in its month. Each month's cash shows its arithmetic. *Acceptance:* `tests/easel.test.mjs` `EASEL-005`.
- **EASEL-006 — Exact revenue drivers with traces.** Revenue comes from volume × rate (with monthly growth) or customers × revenue per customer (with churn, new customers per month and new customers per hire in a named department, ramped by the recorded ramp rule). Every cell carries the arithmetic that produced it. Money is integer cents, counts are hundredths and every division rounds half away from zero once; the same inputs always produce the same cells. *Acceptance:* `tests/easel.test.mjs` `EASEL-006` and `tests/totals.test.mjs`.
- **EASEL-007 — Position costs and restricted pay detail.** Positions (named or to be hired) cost annual salary ÷ 12 × (1 + owner-supplied on-costs) from start to end month. Individual positions, salaries and the sources behind another department's numbers are visible only to finance and that department's contributors; viewers and other departments receive amounts with the detail removed by the server, and cannot change another department's inputs through any route. *Acceptance:* `tests/easel.test.mjs` `EASEL-007`.
- **EASEL-008 — Expenses, schedules and visible allocations.** Recurring and one-off expenses and imported monthly schedules feed their line and department. A shared department's costs are allocated to other departments by monthly headcount or fixed shares adding to exactly 100%; line totals never change and every allocated amount names its rule. Self, chained or unshared allocations, unknown lines or departments, and deleting a department or line still in use are refused. *Acceptance:* `tests/easel.test.mjs` `EASEL-008` and `tests/totals.test.mjs`.
- **EASEL-009 — Department submissions.** Finance requests submissions from departments. A contributor revises only their own department's budget inputs while its submission is requested or returned, comments on their own department, and submits; a submitted department is locked until finance returns it with a reason. The full request/submit/return history is kept. *Acceptance:* `tests/easel.test.mjs` `EASEL-009` and `tests/review-fixes.test.mjs`.
- **EASEL-010 — Exact-revision budget approval.** Finance approves the budget only at the exact revision reviewed and only when every requested department has submitted. Approval freezes the budget and stores an immutable snapshot (inputs, outputs, approver, time, revision, submissions, SHA-256) that the database refuses to change or delete. The forecast opens from the approved budget. *Acceptance:* `tests/easel.test.mjs` `EASEL-010`.
- **EASEL-011 — Scenario branch and comparison.** Finance branches any plan into a scenario (for example a downside with later hiring or higher churn) and compares two scenarios: monthly profit and closing cash side by side, every changed assumption, and every cell that moved. *Acceptance:* `tests/easel.test.mjs` `EASEL-011`.
- **EASEL-012 — Proposals promoted at exact revisions.** A proposal is a copy of a working plan bound to that plan's exact revision. Its author (a contributor for their own departments, finance for any) changes it and submits it; finance promotes only the exact proposal revision reviewed, and only while the target is still at the bound revision. Otherwise nothing changes. Promotion records the target's revision before and after. *Acceptance:* `tests/easel.test.mjs` `EASEL-012`.
- **EASEL-013 — Month close and source-backed variance.** Finance closes the next month on the forecast once accepted actuals cover it. The forecast as it stood is kept as an immutable snapshot first; closed months then use actuals. For a closed month, each line and department shows actual against the approved budget and the kept forecast, with the accepted rows behind it, the budget sources, and a draft that marks any timing explanation as an unconfirmed hypothesis. Finance or the department's contributor writes and confirms the business explanation. *Acceptance:* `tests/easel.test.mjs` `EASEL-013` and the review journey at 390 in `tests/browser.mjs`.
- **EASEL-014 — Published review pack with decisions.** Finance creates a review pack for a closed month, records decisions and actions, and publishes it as an immutable snapshot binding the numbers, the approved budget and forecast revisions, the accepted source files with their digests, the explanations and the decisions. Every member, viewers included, can download it as HTML or CSV; it carries no individual pay detail. Action progress is recorded without changing the pack. *Acceptance:* `tests/easel.test.mjs` `EASEL-014`.
- **EASEL-015 — Excel workbook move-in with provenance.** The Excel planning workbook kit reads an .xlsx sheet with Line, Department and month columns, uses each cell's cached value, keeps sheet, row, cell address and formula text as provenance, rounds to cents visibly, skips total rows, and requires every line and department to match or be mapped. It stages the workbook as a new scenario through the import journal; undo removes what it wrote and keeps any row a person has since edited (and what that row needs). *Acceptance:* `tests/easel.test.mjs` `EASEL-015` and `tests/workbook-undo.test.mjs`.

### Portability and runtime

- **EASEL-016 — Complete export and clean restore.** `rer export` writes the complete installation (model, actuals, journal and originals, approvals, kept forecasts, packs and activity); `rer import` refuses a non-empty destination or a corrupt archive and restores into a clean installation of the release that made it, which then shows the same model, approvals, outputs and packs and re-exports identical rows. *Acceptance:* the export and restore steps of `tests/browser.mjs` and `tests/review-fixes.test.mjs`.
- **EASEL-017 — Owned runtime on Base.** MIT source starts with one line, `npx -y @runeditrun/rer dev just-every/run-easel`, and the checkout runs through `rer` install, setup, dev, build, preview, verify, reset, export, import, deploy --dry-run, describe and check, on TanStack Start, Hono and Cloudflare D1, with self-hosted IBM Plex Sans, Easel's theme on Base's installer and sign-in pages, and dev identity with finance, sales, engineering and board personas. Builds refuse the local dev layer. *Acceptance:* `tests/browser.mjs`, `rer verify` and the GitHub Verify workflow.

### Upgrade and restore rules for the published loop

The package-mode upgrade starts from the installed data and migrations of the earlier Easel application, before package mode. Migrations `0001` through `0007` retain their original bytes; subsequent numbered migrations extend that schema. The executed in-place upgrade retained all 495 original rows across 67 tables, then passed native sign-in, role-filtered reads, saved-output comparison, writes and repeated setup. Local people sign in again because Base now scopes local cookies to their origin; their native session records are retained.

Restore preserves planning memberships and historical attribution, but excludes native identities, sessions and credentials. The destination keeps its own owner; membership alone cannot sign anyone in. Live `actorNames` projections resolve only names available in the destination's native directory, while names stored inside immutable snapshots remain unchanged (subject to `ERASE-001`).

A pre-upgrade export restores only with the release that made it. Keep a private export and that release before upgrading. To recover, restore into an empty installation of that release, upgrade that installation in place by running `rer install` and `rer setup` inside that existing checkout, then export again with the upgraded release. Do not import a pre-upgrade export directly into a newer release.

## Target clauses

These clauses complete the category job alongside the published clauses. Each states the behaviour a buyer gets, the acceptance evidence that proves it through a public door, and its current status. Every connector is read-only toward its source unless the clause says otherwise. Every connector keeps its credentials under `CONNECT-010` and feeds Easel through the same preview, mapping, journal and undo rules as the published file kits (`EASEL-002` to `EASEL-004`).

### Connected actuals

#### CONNECT-001 — QuickBooks Online actuals connector.
Finance connects QuickBooks Online through Intuit OAuth 2.0 (accounting scope, read-only). Easel pulls the chart of accounts, classes, locations, departments, customers and vendors, and general-ledger detail by month for the profit-and-loss and balance-sheet accounts. Each pull is previewed as a reviewed batch: rows by month, new or changed accounts and dimensions, and anything unmapped. It lands through the import journal with the provider's transaction IDs, so a re-pull of the same month is idempotent and a provider-side edit shows as a change rather than a duplicate. Monthly totals reconcile to the QuickBooks trial balance for the same period, and the difference is shown when they do not.

*Acceptance:* through the HTTP API against a recorded QuickBooks Online sandbox company (a fake only at the Intuit edge), connect, pull two months, map, accept, edit one transaction in the fake, pull again and see one changed row, no duplicates, and a reconciled trial balance; one recorded run against Intuit's live sandbox.

*Status:* missing.

#### CONNECT-002 — Xero actuals connector.
Finance connects Xero through OAuth 2.0 (read-only accounting scopes). Easel pulls accounts, both tracking categories (mapped to departments or other dimensions under `MODEL-003`), contacts and journals by month, with the same preview, idempotent re-pull, change detection and trial-balance reconciliation as `CONNECT-001`.

*Acceptance:* the `CONNECT-001` journey against a recorded Xero demo company, including two tracking categories mapped to two dimensions; one recorded run against Xero's live demo company.

*Status:* missing.

#### CONNECT-003 — NetSuite actuals connector.
Finance connects NetSuite through token-based authentication or OAuth 2.0 with a read-only role. Easel pulls accounts, subsidiaries, departments, classes and locations and posted transaction lines by period through SuiteQL, with the same preview, idempotent re-pull, change detection and trial-balance reconciliation. Subsidiaries map to entities under `ENTITY-001`.

*Acceptance:* the `CONNECT-001` journey against a recorded NetSuite SuiteQL fake with two subsidiaries; one recorded run against a NetSuite sandbox account.

*Status:* missing.

#### CONNECT-004 — Pantry actuals connector.
A buyer on [Pantry](https://github.com/just-every/run-pantry) connects it through Pantry's API with a scoped read-only token, and gets the same chart, dimension and journal pull, idempotency, change detection and reconciliation as `CONNECT-001`.

*Acceptance:* two local installations (Pantry and Easel) where Easel pulls a month from Pantry, a Pantry correction shows as a changed row on the next pull, and trial balances agree.

*Status:* missing.

#### CONNECT-005 — Scheduled refresh with visible freshness.
Each connection refreshes on a schedule finance sets (hourly, nightly or weekly, in the company's US time zone) and on demand. Refresh pulls data and metadata together. Every view shows each source's last successful refresh, and a source older than its schedule is marked stale wherever its numbers appear. A failed refresh keeps the previous data, shows the provider error and notifies finance (`CYCLE-003`). A provider-side change to a month that is already closed never silently changes closed numbers: it opens a restatement notice that lists the affected lines, packs and kept forecasts, and finance accepts or rejects it.

*Acceptance:* a Workers journey with the scheduled handler and a provider fake: refresh on schedule, fail and show the error with data unchanged, go stale, and post a change to a closed month that produces a restatement notice instead of a changed pack.

*Status:* missing.

#### CONNECT-006 — Mapping rules that survive refresh.
Account and dimension mappings are reusable rules, not only one-to-one picks. They cover a single account, an account-number range, a prefix or a provider account type to a planning line, the cash balance, a balance-sheet line or an exclusion, and a provider department, class or tracking option to an Easel dimension member. A new account that a rule covers is mapped automatically and listed. A new account that no rule covers blocks only the conclusions that depend on it, and is never treated as zero.

*Acceptance:* the API journey maps by range, pulls a month containing a new in-range account (mapped and listed) and a new out-of-range account, and sees the dependent month's reconciliation blocked until finance maps it.

*Status:* partial.

#### CONNECT-007 — Balance-sheet actuals and the trial balance.
Accepted actuals include month-end balance-sheet balances (cash, receivables, prepaid, fixed assets, payables, accrued liabilities, deferred revenue, debt and equity), not only profit-and-loss flows and the cash account. Each closed month shows a trial balance that sums to zero, and the forecast balance sheet (`FIN-001`) opens from the last closed month's actual balances.

*Acceptance:* the API journey accepts a ledger month with balance-sheet accounts, reads a zero-sum trial balance, closes the month and sees the forecast balance sheet open from those balances.

*Status:* partial.

#### CONNECT-008 — Drill-through to the ledger transaction.
Every actual cell drills to the accepted rows behind it (as `EASEL-013` does for files). For a connected source, each row also links to the transaction in QuickBooks Online, Xero, NetSuite or Pantry, under the same role filtering as `EASEL-007`.

*Acceptance:* in the browser at 1440 and 390, open a variance cell, see its rows, and follow a row's link to the provider-fake transaction URL; a viewer sees amounts without another department's rows.

*Status:* partial.

#### CONNECT-009 — Bank balances for current cash.
Finance can connect bank accounts read-only through Plaid (balances and transactions). Current cash position and daily balance movement then feed the cash alerts (`REPORT-006`) and the 13-week view (`FIN-007`) between ledger closes, labelled as bank balances rather than ledger actuals. Easel never initiates a payment or transfer.

*Acceptance:* a Plaid sandbox fake supplies two accounts; the 13-week view and a cash alert use the bank balance and label it as such; no payment route exists.

*Status:* missing.

#### CONNECT-010 — Connection custody and status.
Every connector credential (OAuth tokens, API keys, certificates) is stored encrypted, excluded from `rer export`, shown only by masked suffix, and removed on disconnect, which also revokes the token at the provider where the provider supports it. A Connections page lists each source with its scopes, owner, schedule, last refresh, row counts, errors and rate-limit state. Only finance connects, disconnects or changes schedules, and each of those actions enters the audit trail (`AUDIT-001`).

*Acceptance:* connect and disconnect a provider fake through the API; the archive from `rer export` and the stored rows contain no planted token; a contributor's connect attempt is refused with 403; the audit trail shows both actions.

*Status:* missing.

### Flexible model

#### MODEL-001 — Configurable horizon and multi-year plans.
Finance sets any fiscal-year start month and a plan horizon from 12 to 60 months, with monthly detail and quarter and fiscal-year roll-ups. Budgets can span one fiscal year or several. A 4-4-5 or 5-4-4 retail calendar is available as an alternative to calendar months.

*Acceptance:* the API journey sets a 36-month horizon starting in a fiscal year that begins in October, and reads monthly, quarterly and annual totals that agree to the cent.

*Status:* partial.

#### MODEL-002 — A rolling forecast that extends itself.
Finance sets a rolling window (for example always 18 months ahead). Closing a month (`EASEL-013`) extends the forecast by one month and seeds the new month from its drivers, with the kept forecast snapshot taken first. Budgets keep their fixed fiscal horizon.

*Acceptance:* with an 18-month window, close two months in the API journey and see the forecast end move by two months, the new months calculated from drivers, and both kept forecasts unchanged.

*Status:* partial.

#### MODEL-003 — Custom dimensions and hierarchies.
Beyond lines and departments, finance defines dimensions (for example entity, region, product, customer segment, project, class or location), each with a hierarchy of members and roll-ups. Inputs, actuals and reports can be cut by any dimension, and source dimensions map onto them (`CONNECT-006`). Lines get a chart-of-accounts hierarchy with subtotals.

*Acceptance:* the API journey adds a Region dimension with a two-level hierarchy, enters inputs by region, maps a provider class to it, and reads a report that rolls regions up to the total without changing line totals.

*Status:* partial.

#### MODEL-004 — User-defined formulas and driver lines.
Finance writes driver lines and formulas over named drivers, lines, dimensions and time: arithmetic, prior-period and offset references, growth, lookups by dimension member, IF, MIN, MAX, ROUND and SUM over a dimension. Evaluation keeps the published arithmetic rules: integer cents, counts in hundredths, one rounding half away from zero per division, and a trace per cell. Circular references are refused with the cycle named. Every formula change is a revision that a proposal can carry (`EASEL-012`).

*Acceptance:* the API journey defines a support-cost driver as tickets per customer × cost per ticket with a lookup by region, reads exact cells with traces, and is refused a circular formula with the cycle named.

*Status:* partial.

#### MODEL-005 — Versioned model structure.
Changes to model structure (dimensions, formulas, driver forms, mapping rules) are versioned with a readable diff of what changed and which cells moved. Approved budgets, kept forecasts and published packs keep the structure they were made with and never recompute.

*Acceptance:* change a formula in the API journey, read the structure diff and moved cells, and confirm the approved budget snapshot keeps its SHA-256 and cells.

*Status:* partial.

#### MODEL-006 — Starter models for US small businesses.
Setup offers starter models that a buyer edits rather than builds from nothing: SaaS (ARR, churn, CAC, seats), professional services (billable headcount, utilization, rate), project or backlog businesses, and wholesale or ecommerce (units, price, COGS, inventory days). Each comes with its drivers, lines, dimensions, dashboards and cash timing, in USD.

*Acceptance:* in the browser at 1440, create a company from the SaaS starter and see a three-statement forecast, a dashboard and a cash view without entering a formula.

*Status:* missing.

#### MODEL-007 — Recalculation at small-business scale.
A model with 2,000 input rows, 5 dimensions and a 36-month horizon recalculates after an input change in under 2 seconds p95. Larger changes run as a visible background calculation, and the affected cells show as recalculating rather than stale-but-final.

*Acceptance:* a load fixture at the stated size through the API, timing 50 edits at p95, and a larger bulk import showing calculation state in the browser.

*Status:* partial.

### Three statements and cash

#### FIN-001 — Linked P&L, balance sheet and cash flow.
Every scenario produces a monthly forecast profit and loss, balance sheet and indirect cash-flow statement that link: net income flows to retained earnings, working-capital, capex and financing movements flow to cash, and the balance sheet balances every month. A visible check marks any month that does not balance, and its cause is traced.

*Acceptance:* the API journey reads three statements for 24 months and asserts assets equal liabilities plus equity in every month and that cash-flow closing cash equals balance-sheet cash.

*Status:* partial.

#### FIN-002 — Working-capital timing.
Receivables follow days-sales-outstanding or a collection curve by revenue line, and payables follow days-payables-outstanding or payment terms by expense line. Annual-upfront billing creates deferred revenue that is recognised ratably, prepaid expenses amortise, and accrued payroll and bonuses settle on their pay dates. Opening balances come from actuals (`CONNECT-007`) or labelled estimates (`EASEL-005`).

*Acceptance:* the API journey sets 45-day DSO, a 30-day term on one vendor line and an annual-upfront plan, and reads receivables, payables, deferred revenue and cash that agree with the traces.

*Status:* partial.

#### FIN-003 — Debt and financing.
Term loans, lines of credit and venture debt carry principal, rate (fixed, or variable over a stated base rate), draws, repayments and amortisation schedules, with interest flowing to the P&L. Covenant tests (minimum cash, liquidity, debt-to-EBITDA) are computed every month. Equity raises are planned events.

*Acceptance:* the API journey adds a line of credit with a minimum-cash covenant, draws on it in a downside, and reads interest, balances and a covenant breach month.

*Status:* missing.

#### FIN-004 — Capex and depreciation.
Planned asset purchases by category depreciate straight-line over a useful life set per category. Disposals and existing fixed assets (from `CONNECT-007`) continue their schedules. Capex reaches cash in its payment month.

*Acceptance:* the API journey adds $120,000 of equipment over 5 years and reads $2,000 of monthly depreciation, net book value and the cash outflow.

*Status:* missing.

#### FIN-005 — Runway, burn and an agreed cash floor.
Every scenario shows gross and net burn, months of runway, the lowest cash month and cash-zero date. Finance records an agreed cash floor and runway minimum, which every scenario, proposal and comparison checks and marks where they are crossed.

*Acceptance:* the API and browser journeys set a $500,000 floor, branch a downside that crosses it, and see the crossing month and runway on the scenario, the comparison and the dashboard.

*Status:* partial.

#### FIN-006 — US tax estimates in the forecast.
Employer payroll taxes are calculated per person under US rules with annual wage bases: Social Security, Medicare, FUTA, and SUTA at a state rate and wage base finance enters. Income tax is estimated at the federal rate plus a state rate, with a loss carryforward. Sales tax collected is a pass-through to cash that never counts as revenue. These are planning estimates, labelled as such, and never filings.

*Acceptance:* the API journey plans one $180,000 W-2 position and reads Social Security stopping at the wage base within the year, Medicare continuing, FUTA on the first $7,000, and an income-tax line on a profitable month.

*Status:* partial.

#### FIN-007 — 13-week cash forecast.
A weekly direct cash view for the next 13 weeks is built from open receivables by due date and expected payment behaviour, open payables and bills by due date, payroll run dates, debt service and planned spend. Finance can override any week with a note, and the view reconciles to the monthly forecast at month ends.

*Acceptance:* with ledger and bank fakes holding open invoices and bills, the API journey reads 13 weeks whose month-end weeks agree with the monthly cash forecast, and an override keeps its note.

*Status:* missing.

### Headcount and compensation

#### PEOPLE-001 — Roster and payroll actuals from Gusto.
Finance connects Gusto (OAuth, read-only). Easel pulls employees and contractors, with department, title, employment type (W-2 or 1099), compensation, start and termination dates, and payroll run totals by employee. The roster is reconciled to planned positions: matched, unplanned hires, planned but not hired, and changed salaries. Payroll actuals reconcile to the ledger's payroll lines. Pay detail stays under `EASEL-007` and `PEOPLE-005`.

*Acceptance:* a recorded Gusto demo-company fake; the API journey connects, sees reconciliation buckets, accepts matches, and confirms a viewer receives headcount totals without names or salaries; one recorded run against Gusto's demo environment.

*Status:* missing.

#### PEOPLE-002 — Roster from Rippling, Willow, BambooHR and ADP.
The same roster pull, reconciliation and restriction as `PEOPLE-001` from Rippling, [Willow](https://github.com/just-every/run-willow), BambooHR and ADP Workforce Now, with each provider's own fields mapped and anything unmapped listed.

*Acceptance:* the `PEOPLE-001` journey against a fake for each provider, with an unmapped custom field listed rather than dropped.

*Status:* missing.

#### PEOPLE-003 — Open roles from the ATS.
Open requisitions from [Lodge](https://github.com/just-every/run-lodge) or Greenhouse become to-be-hired positions with department, level and target start. An accepted offer updates the position's name, salary and start date as a proposal for finance (`EASEL-012`), and a closed requisition proposes removing the position.

*Acceptance:* an ATS fake opens a requisition, then marks an offer accepted with a later start; the API journey sees a proposal with the changed start and cost and promotes it.

*Status:* missing.

#### PEOPLE-004 — US compensation assumptions.
Each position or person carries salary or hourly rate with expected hours, W-2 or 1099 type, merit increases on a date, bonus (percent of salary, paid in a month), sales commission (rate on bookings from `REV-001`), benefits per head per month, 401(k) match, and employer taxes from `FIN-006`. On-cost defaults are set per department and overridden per position. Each cost traces to its components.

*Acceptance:* the API journey plans a salaried W-2 engineer with a merit increase, a commissioned salesperson tied to pipeline bookings, and a 1099 contractor with no employer tax, and reads traced monthly costs.

*Status:* partial.

#### PEOPLE-005 — Compensation access separate from finance.
Compensation detail (names, salaries, bonus and commission) is a permission of its own. Finance can grant a finance analyst plan access without pay access. Department heads see their department's totals and, only when granted, their own people's detail. Exports, packs, API responses, agent answers and Excel or Sheets pulls apply the same server-side filtering.

*Acceptance:* through the API and the Excel add-in fake, an analyst without pay access, a department head and a viewer each read the same plan, and none receives a salary they are not granted; a planted salary never appears in their exports.

*Status:* partial.

#### PEOPLE-006 — Headcount plan against actual.
Monthly headcount, hires, departures and payroll cost are compared between plan and roster actual by department. Hiring slippage (planned start against actual start), backfills and an attrition assumption are shown, and the slippage history feeds `AGENT-004`.

*Acceptance:* after a roster pull with one late hire and one departure, the API and browser journeys show plan against actual headcount and cost by department, with the slippage in days.

*Status:* partial.

### Revenue and pipeline

#### REV-001 — Pipeline drivers from Orbit, HubSpot and Salesforce.
Finance connects [Orbit](https://github.com/just-every/run-orbit), HubSpot or Salesforce (OAuth, read-only) and pulls open and closed deals with stage, amount, owner, close date and product. Finance owns the assumptions, which are explicit and versioned: probability by stage (or the CRM's own probability, labelled), close-date slippage by stage, and the deal-to-revenue rule (one-time, ratable over term, or subscription start). Weighted bookings feed revenue, deferred revenue, commissions and cash. Each revenue cell traces to the deals behind it, under role filtering.

*Acceptance:* a HubSpot fake with deals at three stages; the API journey sets probabilities and slippage, reads weighted bookings and revenue traced to deal IDs, moves a deal's close date in the fake, refreshes, and sees the revenue move; one recorded run against a HubSpot developer test account.

*Status:* missing.

#### REV-002 — Subscription metrics from Stripe Billing and Nectar.
Finance connects Stripe Billing (restricted read-only key) or [Nectar](https://github.com/just-every/run-nectar). Easel computes MRR and ARR movements (new, expansion, contraction, churn and reactivation), customer counts, gross and net revenue retention, and monthly cohorts. These serve as actuals for the subscription drivers in `EASEL-006` and `REV-003`, and reconcile to ledger revenue with the difference explained (deferred revenue, refunds, tax).

*Acceptance:* a Stripe fake with subscriptions, upgrades, downgrades and cancellations across three months; the API journey reads an ARR bridge and a cohort table that agree with hand-computed values, and a reconciliation to ledger revenue; one recorded run against Stripe test mode.

*Status:* missing.

#### REV-003 — A revenue driver library.
Beyond volume × rate and customers × revenue per customer, revenue can come from seats × price with expansion, usage × unit price, billable headcount × utilization × rate (with actuals from [Gauge](https://github.com/just-every/run-gauge) or Harvest), project milestones and backlog burn-down, and the formula lines of `MODEL-004`. Every driver traces.

*Acceptance:* the API journey plans one line per driver form and reads exact traced cells.

*Status:* partial.

#### REV-004 — Bookings, billings, revenue and cash.
For contract revenue, a booking carries term, billing frequency (monthly, quarterly, annual upfront) and start date. Billings, deferred revenue, recognised revenue and collections follow from it and appear on the three statements (`FIN-001`, `FIN-002`).

*Acceptance:* a $120,000 annual-upfront booking in the API journey produces a $120,000 billing, $10,000 a month of revenue, a declining deferred-revenue balance and collection by the DSO.

*Status:* missing.

### Spend

#### SPEND-001 — Committed and card spend.
Purchase orders and committed contracts from [Purse](https://github.com/just-every/run-purse), expense reports from [Coaster](https://github.com/just-every/run-coaster), and card and bill-payment data from Ramp, Brex and Bill.com feed the forecast as committed spend by line, department and month. The variance view shows budget, committed, actual and remaining for each.

*Acceptance:* a Ramp fake and a Purse fake add a card transaction and a purchase order; the API journey reads budget, committed, actual and remaining for the affected department.

*Status:* missing.

### Spreadsheets

#### SHEET-001 — Excel add-in with live formulas.
A Microsoft Excel add-in (Office.js, Windows, Mac and Excel on the web) signs in as the person and provides worksheet functions, for example `=EASEL.VALUE("Revenue","Sales","2027-01","Forecast")`, plus pull-a-report ranges. Values refresh on demand or when the workbook opens, with server-side role filtering. Cells a person may edit can be sent back as a proposal (`EASEL-012`), never written directly to an approved or locked plan. The workbook's own formulas around Easel cells stay live.

*Acceptance:* an Office.js test host loads the add-in against a running Easel: functions return role-filtered values, a contributor's edit returns as a proposal bound to the revision, and an edit to a locked budget is refused; one recorded run in Excel on the web.

*Status:* partial.

#### SHEET-002 — Google Sheets add-on with live formulas.
The same functions, refresh, role filtering and proposal write-back as `SHEET-001`, as a Google Workspace add-on with custom functions. Scheduled refresh runs through an installable trigger.

*Acceptance:* an Apps Script test harness against a running Easel replays the `SHEET-001` journey; one recorded run in a Google Workspace test domain.

*Status:* missing.

#### SHEET-003 — Model import that keeps formulas.
Importing an existing Excel or Google Sheets model translates supported formulas (arithmetic, SUM, IF, references across sheets and months, growth and lookups) into Easel formulas (`MODEL-004`). Every formula it cannot translate is listed with its sheet and cell, and that cell keeps its cached value with provenance (`EASEL-015`). Totals reconcile to the workbook's own totals before anything is accepted, and undo works through the journal.

*Acceptance:* import a fixture workbook model with cross-sheet formulas and one unsupported function; the import report lists the unsupported cell, Easel totals equal the workbook totals, a driver change recalculates the translated formulas, and undo removes the import.

*Status:* partial.

#### SHEET-004 — Excel exports with formulas.
Any report, plan or pack exports as .xlsx with live subtotal, total and variance formulas and one sheet per statement, not values only. CSV exports remain. Pay detail follows `PEOPLE-005`.

*Acceptance:* download a report as .xlsx through the browser, open it with a spreadsheet library in the test, and assert that subtotal cells hold formulas that evaluate to Easel's totals.

*Status:* partial.

#### SHEET-005 — Scheduled spreadsheet pulls.
A linked sheet range (for example a sales team's capacity sheet) is pulled on a schedule. Its changes arrive as a previewed proposal for finance with the changed cells listed. A sheet that went missing or changed shape is reported, never read as zeros.

*Acceptance:* a Google Sheets fake changes two cells and then deletes a column between scheduled pulls; the API journey sees a proposal with two changed cells, then a shape error with no write.

*Status:* missing.

### Planning cycles and collaboration

#### CYCLE-001 — Budget calendar, tasks and reminders.
Finance sets a planning calendar with tasks (submit department budget, review headcount, confirm variance explanations), owners and due dates. Owners get reminders by email, [Nook](https://github.com/just-every/run-nook), Slack or Microsoft Teams in the company's time zone. Reminders stop when the task is done, and overdue tasks escalate to finance. Submission status (`EASEL-009`) is one kind of task.

*Acceptance:* with a fake clock and mail and chat fakes, the API journey requests submissions due Friday; a reminder goes out Thursday morning Eastern, the reminder for a submitted department is cancelled, and an overdue department escalates to finance on Monday.

*Status:* partial.

#### CYCLE-002 — Metric-triggered tasks.
Finance writes rules such as "a department's actual spend exceeds budget by 10% and $5,000 in a closed month", "runway falls below 12 months" or "pipeline coverage for next quarter falls below 3×". When a refresh or close meets a rule, Easel creates a task with an owner and due date that cites the numbers, and does not create a duplicate while the task is open.

*Acceptance:* the API journey sets a 10% overspend rule, accepts a month that breaks it, sees one task for the department contributor with the cited variance, and refreshes again without a duplicate.

*Status:* missing.

#### CYCLE-003 — Notifications from discussions and events.
Mentioning a person in a comment or explanation, a returned submission, a pending approval, a restatement notice and a triggered task each notify the person by email and, if connected, in Slack, Microsoft Teams or Nook. The notification links to the exact cell or record. Each person sets their channels, and a daily digest is the default.

*Acceptance:* with mail and Slack fakes, a mention in a variance explanation produces one email and one Slack message linking to that variance, and a digest-only person receives it in the next digest instead.

*Status:* missing.

#### CYCLE-004 — Private and shared scenarios.
Any planner can make a private sandbox scenario that only they can see, share it with named people or groups as read or edit, and submit it as a proposal. Finance sets which scenarios are official (budget, forecast, board case). Scenario-specific access rights are enforced on every read, comparison and export.

*Acceptance:* the API journey creates a private scenario for a contributor, confirms another contributor and a viewer get 404 for it, shares it read-only with the viewer, and confirms the viewer can compare but not edit.

*Status:* partial.

#### CYCLE-005 — Quarterly reforecasts and version comparison.
Besides the approved budget and the rolling forecast, finance saves named reforecast versions (for example Q2 reforecast), each frozen like a budget. Reports and variances can compare actual, budget, each reforecast and the current forecast.

*Acceptance:* the API journey freezes a Q2 reforecast, closes a month, and reads actual against budget, against the Q2 reforecast and against the current forecast for the same line.

*Status:* partial.

#### CYCLE-006 — Long-range plan linked to the operating plan.
A 3-to-5-year annual plan holds top-down targets (revenue growth, margin, headcount, cash). Year one comes from the operating budget, and later years come from annual drivers. A reconciliation shows where the bottom-up budget misses the long-range target.

*Acceptance:* the API journey sets a five-year plan with a 40% growth target and reads year one equal to the budget and the gap to the target.

*Status:* missing.

### Reporting

#### REPORT-001 — Report builder.
Finance and permitted members build reports. Rows are lines, dimensions or hierarchies. Columns are months, quarters, years, year-to-date or trailing twelve months, across versions, with variance in dollars and percent. Filters and conditional highlighting are available. Reports are saved, shared and scheduled, and always role-filtered on the server.

*Acceptance:* in the browser at 1440, build a department-by-quarter report of actual against budget, save it, share it with a viewer, and confirm through the API that the viewer's copy omits restricted detail.

*Status:* partial.

#### REPORT-002 — Dashboards.
Dashboards hold KPI tiles, charts and tables from saved reports and metrics, such as revenue, gross margin, burn, runway, ARR, headcount and pipeline coverage. Layouts are saved per person and shared per audience (leadership, board, departments) and work at phone width.

*Acceptance:* in the browser at 1440 and 390, build a dashboard with runway, ARR and headcount tiles, share it with the board persona, and see the same numbers in the API without horizontal overflow.

*Status:* partial.

#### REPORT-003 — Board pack.
A board pack template contains statements, KPIs, charts, variance commentary, decisions and appendix tables. It is generated for a closed month or quarter, refreshed until published, and published as an immutable snapshot (as in `EASEL-014`). It exports as PDF, PowerPoint (.pptx) and Excel, and can be saved to [Chest](https://github.com/just-every/run-chest), Google Drive or SharePoint. Refreshing keeps the commentary that people wrote.

*Acceptance:* generate a quarter pack in the browser, refresh it after a late adjustment with commentary kept, publish, download PDF, .pptx and .xlsx, and confirm through the API that the published numbers do not change after a later refresh.

*Status:* partial.

#### REPORT-004 — Linked PowerPoint and Word reporting.
PowerPoint and Word add-ins insert Easel tables, charts and single numbers into a deck or memo, and refresh them in place from a chosen version and period, under the person's role filtering.

*Acceptance:* an Office.js test host inserts a table and a number into a .pptx, refreshes after an Easel change, and sees the new values.

*Status:* missing.

#### REPORT-005 — Department budget-owner reporting.
Each department owner gets a monthly actual-against-budget statement for their department after close. It includes their top variances, the rows behind them, open tasks and explanations to confirm, by email and in the app, and never includes other departments' detail.

*Acceptance:* close a month in the API journey with mail fakes; the engineering contributor receives a statement for Engineering only, and a link opens their variances.

*Status:* partial.

#### REPORT-006 — Scheduled cash alerts.
Finance sets cash alerts: forecast lowest cash below the floor (`FIN-005`), actual or bank cash below plan by an amount or percent, and runway below N months. They are checked after every refresh and on a schedule. Each alert is sent once per breach by email and chat with the numbers, the cause and a link. It re-alerts only on worsening or after a set interval, and records when it was acknowledged.

*Acceptance:* with a fake clock and mail and Slack fakes, a refresh that drops forecast lowest cash below the floor sends one alert with the crossing month, a second refresh with no change sends none, and acknowledgement is recorded.

*Status:* missing.

#### REPORT-007 — BI and warehouse feeds.
Operational metrics flow in from Snowflake, BigQuery or Databricks as driver actuals (for example active users or shipments), by a read-only query that finance reviews. Easel's actuals, plans and versions flow out to Power BI, Looker and Tableau through a read-only, role-scoped dataset endpoint and scheduled CSV or Parquet drops.

*Acceptance:* a warehouse fake supplies a monthly metric that drives a revenue line; a BI client fake reads the dataset endpoint with a scoped token and receives no pay detail.

*Status:* missing.

### Access, audit and governance

#### ACCESS-001 — Groups and per-dimension permissions.
Finance creates groups (for example FP&A team, department heads, board) and grants read or edit by dimension member (department, entity, region), by scenario (`CYCLE-004`) and by capability: compensation (`PEOPLE-005`), connections, model structure, approvals and publishing. Every server route enforces the grants, and an access report shows who can see what.

*Acceptance:* the API journey makes a group with edit on two departments and no pay access, adds a person, and confirms reads, writes and exports respect it; the access report lists it.

*Status:* partial.

#### ACCESS-002 — SSO and SCIM.
Easel is a SAML 2.0 and OIDC relying party for Okta, Microsoft Entra ID, Google Workspace and [Auth](https://github.com/just-every/run-auth), and a SCIM 2.0 server that provisions and deprovisions people and group membership. Deprovisioning ends the person's sessions at once and keeps their historical attribution.

*Acceptance:* with an IdP fake, sign in by SAML, provision a person and group by SCIM, deprovision them, and see their session refused on the next request while their past submissions still show their name.

*Status:* missing.

#### AUDIT-001 — Model audit trail.
Every change to setup, inputs, formulas, mappings, connections, permissions, submissions, approvals, closes and packs is recorded with actor (person or agent), time, record, scenario, revision before and after, and the changed values. Finance filters the trail by person, record, scenario and date, and exports it. The trail is append-only and survives `rer export` and restore.

*Acceptance:* through the API, make changes as three people, filter the trail by one person and one scenario, export it as CSV, and confirm the database refuses to update or delete a trail row.

*Status:* partial.

#### ERASE-001 — Person erasure.
Finance can erase a former member's personal data: their name, email and membership details, and, for an employee record from `PEOPLE-*`, their name and identifiers. Planning amounts stay, attributed to a stable pseudonym. Immutable snapshots keep their recorded digest, and every read and export of them shows the pseudonym in place of the erased name. The erasure returns a receipt with counts and time, and the audit trail records it without the erased data. Erasing the last finance member is refused.

*Acceptance:* through the API, erase a contributor who submitted and commented; their name is absent from live views, pack downloads and `rer export`, their submissions show the pseudonym, the snapshot digest is unchanged, and the receipt and audit row exist.

*Status:* missing.

#### API-001 — Public API with scoped tokens.
The HTTP API (`API.md`) is available to integrations through personal and service tokens with read or write scopes, the issuing person's role and an expiry. Requests are rate-limited, every write is fenced by revision as today, and token use enters the audit trail.

*Acceptance:* issue a read-only token, read a scenario, be refused a write, revoke the token and be refused a read.

*Status:* partial.

#### API-002 — Webhooks and automation apps.
Signed webhooks fire on approval, close, publish, refresh failure, alert and task events. Published apps for [Crank](https://github.com/just-every/run-crank), Zapier and Make expose those triggers and the proposal and comment actions.

*Acceptance:* register a webhook receiver fake, approve a budget, and receive one signed event with a verifiable signature; replaying it is detectable by its ID.

*Status:* missing.

#### API-003 — MCP endpoint for outside agents.
An MCP endpoint exposes Easel's reads (scenarios, comparisons, variances, metrics) and its proposal, comment and explanation commands to the person's own agent (for example Claude). It uses that person's authority and filtering, and it can never approve, close, publish or promote.

*Acceptance:* an MCP client signed in as a contributor lists tools, reads a variance, creates a proposal, and is refused the approve and promote tools.

*Status:* missing.

### Entities, currency and US defaults

#### ENTITY-001 — Multiple entities and management consolidation.
A company plans several entities (for example a US C-corp and a services subsidiary), each with its own ledger connection (`CONNECT-001` to `CONNECT-004`). Easel shows consolidated P&L, balance sheet and cash with intercompany balances and charges eliminated by rules finance sets. Entity-level access uses `ACCESS-001`.

*Acceptance:* two entities with an intercompany management fee; the API journey reads entity and consolidated statements in which the fee and the intercompany balance are eliminated and consolidated totals equal the sum less eliminations.

*Status:* missing.

#### ENTITY-002 — Multi-currency planning.
An entity plans in its local currency and reports in USD, using rate tables that finance keeps (budget rate, monthly average and month-end rates). Profit and loss converts at average rates, the balance sheet at month-end rates, and the translation difference is shown. Constant-currency comparisons are available.

*Acceptance:* a CAD entity with budget and actual rates; the API journey reads USD statements, a translation adjustment, and a constant-currency variance.

*Status:* missing.

#### US-001 — US defaults.
A new company defaults to USD with `$1,234.56` formatting, US English, MM/DD/YYYY dates, a January fiscal year with any other start month available, US time zones for schedules and reminders, and the US payroll and tax assumptions of `FIN-006` and `PEOPLE-004`. Files with US date and number formats import without extra choices.

*Acceptance:* set up a new company in the browser without changing defaults and see USD formatting, US dates and an Eastern-time reminder schedule; import a CSV with MM/DD/YYYY dates and $-formatted amounts.

*Status:* partial.

### Move in and out

#### MOVE-001 — Move in from Adaptive Planning.
Easel imports a Workday Adaptive Planning export (levels, accounts, dimensions and attributes, versions with their data, and sheet exports), together with the buyer's mapping. It previews what will be created, lists everything that did not map (formulas it cannot translate, custom sheets, access rules), and lands through the journal with undo.

*Acceptance:* a fixture export in Adaptive's documented export shapes; the import report lists created levels, accounts and versions and the unmapped items; budget totals equal the export's totals; undo removes the import.

*Status:* missing.

#### MOVE-002 — Move in from Planful.
Planful exports of the chart of accounts, segments, scenarios and data load the same way as `MOVE-001`, with a report of unmapped items, totals reconciled and undo.

*Acceptance:* the `MOVE-001` journey with a fixture in Planful's documented export shapes.

*Status:* missing.

#### MOVE-003 — Move in from Anaplan, Runway and Pigment.
Anaplan list and module exports, and Runway and Pigment CSV or Excel exports, load the same way as `MOVE-001`, with a report of unmapped items, totals reconciled and undo.

*Acceptance:* the `MOVE-001` journey with one fixture per product in its documented export shape.

*Status:* missing.

#### MOVE-004 — A parallel month against the old tool.
For one closed month, Easel compares its actuals, budget and forecast with the buyer's old tool or spreadsheet for the same month, line by line. Each difference is classified (mapping, timing, formula or source data), and finance signs the comparison off before switching.

*Acceptance:* with a fixture month from the old tool that differs on one mapping and one formula, the comparison lists exactly those two differences and records finance's sign-off.

*Status:* missing.

#### PORT-001 — An export a buyer can open without Easel.
Besides the `rer export` archive (`EASEL-016`), finance can download the whole plan as open files: one CSV per table, an .xlsx per scenario with formulas (`SHEET-004`), the model definition as JSON, and every snapshot and original file, with a manifest of digests.

*Acceptance:* download the open export, unzip it in the test, check every manifest digest, and open a scenario workbook whose totals equal Easel's.

*Status:* partial.

### Anywhere

#### MOBILE-001 — Review and approve at phone width.
Every review, approval, submission, comment, explanation, dashboard and alert works in the browser at 390 pixels without horizontal scrolling. That includes approving a budget and promoting a proposal.

*Acceptance:* the browser journeys at 390 move in actuals, close a month and confirm an explanation (as today), and also submit a department, approve the budget, promote a proposal and read a dashboard, with an overflow check on every page.

*Status:* partial.

#### MOBILE-002 — Native iOS and Android apps.
Native iOS and Android apps sign in as the person and show dashboards, alerts, tasks, approvals and comments. Push notifications cover alerts (`REPORT-006`), tasks (`CYCLE-001`, `CYCLE-002`), approvals and mentions. The apps hold no data offline beyond what the person may read, and sign-out wipes it.

*Acceptance:* a native test build on an iOS simulator and an Android emulator signs in against a running Easel, receives a push for a cash alert through a push fake, and approves a pending proposal.

*Status:* missing.

#### HOST-001 — Hosted operation on the buyer's Cloudflare account.
`rer deploy` puts Easel on the buyer's own Cloudflare account with D1, the scheduled refresh handler, encrypted connector secrets and real mail delivery. Hosted health, backups and restore are documented and exercised.

*Acceptance:* a deploy to a test Cloudflare account, a health check, a scheduled refresh run, a delivered invite email and a restore from backup.

*Status:* partial.

## Push further

Agents keep the plan feasible and honest, not just modelled. Each clause names what the agent does, on which data, and under what human control. Every agent action is governed by `AGENT-011`: it acts with a named person's authority and filtering, it is labelled and audited, and it never approves, closes, publishes, promotes, pays or hires on its own authority.

### Agents that keep the plan feasible

#### AGENT-001 — Constraint watch.
*What the agent does:* after every refresh and every promoted change, it recalculates the official forecast and checks each constraint finance agreed: the cash floor, runway minimum, covenant tests (`FIN-003`) and department budget limits. When a constraint breaks, it opens a decision item. The item names the crossing month, the size of the gap, and the source changes that caused it: a slipped deal, a hire starting early, a late customer payment or an unplanned vendor. Each cause is traced to its rows.

*Data:* refreshed actuals and bank balances (`CONNECT-*`), pipeline (`REV-001`), roster and requisitions (`PEOPLE-*`), committed spend (`SPEND-001`) and the official scenarios.

*Human control:* finance defines constraints and who owns each one. The agent only opens items and notifies their owners, and it changes nothing in the plan.

*Acceptance:* with provider fakes, a refresh that slips a large deal by two quarters breaks the cash floor; one decision item names the crossing month and cites the deal ID and stage change; the plan's revision is unchanged.

*Status:* partial.

#### AGENT-002 — Feasible responses for the owner to choose.
*What the agent does:* for an open decision item, it searches the levers finance has marked as adjustable, such as hire start dates by role, discretionary spend lines, collection terms, a credit-line draw and price changes. It returns three to five responses that restore the constraint, each with the least change it needs. Each response is a proposal bound to the forecast revision (`EASEL-012`), with its changed inputs, moved cells, the new lowest cash and runway, and what it costs (for example revenue forgone by a delayed sales hire).

*Data:* the model, the levers and bounds finance set, and the constraint.

*Human control:* the owner picks a response or rejects them all with a reason. Finance promotes the chosen proposal at its exact revision. Levers that are not marked adjustable are never touched.

*Acceptance:* for the `AGENT-001` item, the agent returns at least three proposals that each satisfy the floor in a recalculation; a lever not marked adjustable is unchanged in all of them; promotion of one goes through `EASEL-012`.

*Status:* partial.

#### AGENT-003 — Asking owners for uncertain assumptions.
*What the agent does:* when a response or forecast depends on an uncertain input (a deal's close date, a hire's start, a large customer's payment date or a vendor renewal), it asks the input's owner a structured question by email, Slack or [Nook](https://github.com/just-every/run-nook), for example "Will Acme sign before 30 November? Yes, No or a new date". It records the answer as a sourced assumption with the person and time, and recalculates.

*Data:* the deal, position or invoice behind the input, and its owner from the CRM, HRIS or ledger.

*Human control:* the answer is the owner's. Finance can override it with a note, and unanswered questions escalate to finance after a set time and never default to an answer.

*Acceptance:* with a Slack fake, the agent asks the deal owner, the answer "new date 15 January" becomes an assumption with its source, and the forecast moves; an unanswered question escalates without changing the assumption.

*Status:* missing.

#### AGENT-004 — Learning from the company's own forecast errors.
*What the agent does:* it compares every kept forecast with actual results by driver and period. It separates timing differences from permanent ones and from driver error, measures how this company's assumptions miss (stage probabilities, close-date slippage, hire slippage, collection lags, churn), and suggests revised assumptions with a backtest. The backtest shows how the revision would have performed on the last six to twelve kept forecasts.

*Data:* kept forecasts (`EASEL-013`), actuals, deal history, roster history and confirmed variance explanations.

*Human control:* finance approves each assumption change as a versioned proposal after seeing the backtest. Kept forecasts and snapshots stay reproducible.

*Acceptance:* a fixture history in which deals close on average 34 days late; the agent proposes a slippage assumption of about 34 days with a backtest showing lower error on past kept forecasts; nothing changes until finance promotes it.

*Status:* partial.

#### AGENT-005 — Source-change guard.
*What the agent does:* before a refresh completes, it detects new or renamed GL accounts, changed departments or classes, missing payroll rows, a CRM or billing feed that stopped updating, and sudden changes in a source's shape. It proposes mappings with its reasons and shows which reports, scenarios, packs and alerts would change.

*Data:* refresh previews, mapping rules (`CONNECT-006`) and freshness (`CONNECT-005`).

*Human control:* finance approves mappings and exclusions. Missing data blocks dependent conclusions and alerts rather than becoming zero.

*Acceptance:* a refresh with a new account named like an existing software line and a missing payroll run; the agent proposes the mapping with its reason, lists the affected reports, and the cash alert for that month is held as blocked rather than computed.

*Status:* partial.

#### AGENT-006 — Following decisions through to results.
*What the agent does:* it links each published decision and action (`EASEL-014`) to its forecast effect, owner and due date. It chases updates before the due date, and after the period closes it compares the realised cash, revenue, headcount and capacity with the assumption that was approved.

*Data:* packs, decisions, actions, later actuals and the proposals that implemented them.

*Human control:* owners can revise or stop an action, with a reason. Finance approves any change to a decision, and salary detail stays role-restricted.

*Acceptance:* a decision to delay two hires to July is published; the agent chases the hiring manager before the due date, and after July closes it reports the realised payroll saving against the approved assumption.

*Status:* partial.

### Agents that explain and model

#### AGENT-007 — Variance commentary grounded in sources.
*What the agent does:* after close, it drafts an explanation for each material variance. Each draft cites ledger rows, deals, roster changes, vendor bills and committed spend, and labels each claim as evidence-backed or a hypothesis.

*Data:* the variance view (`EASEL-013`) and connected sources, under the department's filtering.

*Human control:* drafts are drafts. The department owner confirms or rewrites each one, and finance publishes. An unconfirmed draft never appears in a published pack.

*Acceptance:* with a model fake at the API edge, the agent drafts an explanation that cites row IDs that exist; a citation to a row that does not exist is refused by the server; an unconfirmed draft is absent from the published pack.

*Status:* partial.

#### AGENT-008 — Modeler agent.
*What the agent does:* it turns a request in plain language ("add a second sales team in the Southeast ramping from April", "model a 5% price increase on annual plans from January") into a proposal. The proposal carries a structure and input diff, formulas (`MODEL-004`), the cells that move and a short test of expected values.

*Data:* the model and its scenarios, under the requester's authority.

*Human control:* the result is always a proposal. Finance promotes it at its exact revision (`EASEL-012`), and model-structure changes need a person with the model-structure permission (`ACCESS-001`).

*Acceptance:* with a model fake, the request produces a proposal whose diff adds the named positions and drivers; promotion by a person without model-structure permission is refused.

*Status:* partial.

#### AGENT-009 — Analyst with cited answers.
*What the agent does:* it answers questions about the plan and actuals ("why is Q3 burn higher than budget?", "what happens to runway if we lose our largest customer?"). Each answer cites cells, rows and deals, and a what-if becomes a private scenario (`CYCLE-004`).

*Data:* everything the asker may read, and nothing else.

*Human control:* the answer is read-only. What-ifs stay private until the asker shares or submits them, and a salary the asker cannot see never reaches the answer.

*Acceptance:* with a model fake, a viewer asks about payroll by department and receives totals only; a planted salary is absent from the request sent to the model fake and from the answer.

*Status:* missing.

#### AGENT-010 — Recurring missions.
*What the agent does:* a validated analysis (for example a weekly cash brief, a month-end flux review or a pipeline coverage check) is saved as a mission that runs on a schedule and delivers its result to named people. The result carries the same citations and labels as `AGENT-009`.

*Data:* as `AGENT-009`, under the mission owner's authority.

*Human control:* finance approves each mission and its audience. A mission whose sources are stale (`CONNECT-005`) says so instead of reporting.

*Acceptance:* with a fake clock, mail and model fakes, a weekly cash brief runs Monday, is delivered to two people, and reports stale sources when a connector is stale.

*Status:* missing.

#### AGENT-011 — Agent governance.
*What the agent does:* every in-product agent runs under a named person's or service's authority and filtering. It uses the owner's chosen model provider and key, within a monthly USD budget, and every action and model call is recorded in the audit trail (`AUDIT-001`). Agent output is labelled as agent work.

*Data:* the audit trail and agent settings.

*Human control:* finance enables each agent, sets its budget and can stop all agents at once. Agents can never approve, close, publish, promote, connect, pay or hire.

*Acceptance:* with a model fake, an agent run is recorded with its person, model and cost; at the budget, further runs are refused; the stop switch ends a running agent; an agent call to approve or promote is refused by the server.

*Status:* partial.

## Honest boundaries

Easel is a US-first FP&A product. These are the jobs it deliberately does not do, and how a buyer gets each one done.

- **The ledger and the close.** Easel is not the accounting system of record and never posts journals. Bookkeeping, the close, reconciliations and audited GAAP statements stay in [Pantry](https://github.com/just-every/run-pantry), QuickBooks Online, Xero or NetSuite, which Easel reads (`CONNECT-*`). Close-management tools such as FloQast and BlackLine stay separate.
- **Payroll and tax filing.** Easel estimates employer cost and taxes for planning (`FIN-006`, `PEOPLE-004`). It never runs payroll or files Form 941, Form 940, W-2 or 1099. That stays with Gusto, Rippling or ADP RUN; no Run Edit Run product owns payroll today. Income-tax figures are planning estimates; filings and tax advice come from the buyer's CPA (whose practice may run on [Blotter](https://github.com/just-every/run-blotter)).
- **Treasury and payments.** Easel recommends; it does not move money. Payments, transfers, credit-line draws and collections run in the bank, Bill.com or the ledger. Bank access through Plaid is read-only (`CONNECT-009`).
- **CRM, HRIS, ATS, billing, expenses and procurement.** These belong to [Orbit](https://github.com/just-every/run-orbit), [Willow](https://github.com/just-every/run-willow), [Lodge](https://github.com/just-every/run-lodge), [Nectar](https://github.com/just-every/run-nectar), [Coaster](https://github.com/just-every/run-coaster) and [Purse](https://github.com/just-every/run-purse), or their US incumbents. Easel reads them and never writes deals, employees, offers, invoices or purchase orders.
- **A full spreadsheet engine.** Easel does not re-implement every Excel function or VBA. Excel and Google Sheets stay the buyer's spreadsheets, connected live (`SHEET-001`, `SHEET-002`). Formulas Easel cannot translate are listed and kept as values with provenance (`SHEET-003`).
- **Statutory consolidation and disclosure.** Easel does management consolidation for a few entities (`ENTITY-001`). Statutory consolidation, minority interests, SEC reporting and audit-ready disclosure belong in the ledger or a specialist consolidation tool.
- **Warehouse-scale analytics.** Large event data is processed in Snowflake, BigQuery or Databricks and arrives as metrics (`REPORT-007`). Easel's models stay within `MODEL-007`'s scale, with larger work run as bounded background jobs.
- **Hosting frontier models.** Agents call the owner's chosen model provider under the owner's budget (`AGENT-011`). Easel hosts no model.
- **Native app distribution.** This needs Apple and Google developer accounts. That is release engineering (`MOBILE-002`), not a reason to drop the apps.
- **Region, currency and language.** US-first: USD by default, US English, US payroll and tax assumptions and the buyer's own Cloudflare account. Other currencies are planned through `ENTITY-002`. Localized interfaces and non-US payroll rules are not claimed.

## Scope coverage

How the owner-approved scope for Easel (16 October 2026) maps to clauses.

| Scope item | Clauses |
| --- | --- |
| Live actuals connectors for QuickBooks Online, Xero and NetSuite with account/department mapping and automatic monthly refresh | `CONNECT-001`, `CONNECT-002`, `CONNECT-003`, `CONNECT-005`, `CONNECT-006` |
| A flexible model: user-defined formulas, dimensions, configurable rolling horizon and multi-year plans | `MODEL-001`, `MODEL-002`, `MODEL-003`, `MODEL-004`, `CYCLE-006` |
| Linked P&L, balance sheet and cash-flow forecast covering AR/AP timing, debt, capex and runway | `FIN-001`, `FIN-002`, `FIN-003`, `FIN-004`, `FIN-005`, `FIN-007` |
| Headcount and compensation planning fed from Gusto/Rippling with restricted salary visibility | `PEOPLE-001`, `PEOPLE-002`, `PEOPLE-004`, `PEOPLE-005`, `EASEL-007` |
| Revenue and pipeline drivers from HubSpot/Salesforce (and Orbit) plus subscription metrics (ARR, churn, cohorts) from Stripe or Nectar | `REV-001`, `REV-002`, `REV-003`, `REV-004` |
| Two-way Excel and Google Sheets sync that keeps formulas live, plus board-pack dashboards and scheduled cash alerts | `SHEET-001`, `SHEET-002`, `SHEET-003`, `REPORT-002`, `REPORT-003`, `REPORT-006` |
| Push further: a planning agent that watches actuals, pipeline and hiring, flags broken cash or runway constraints, computes feasible responses and learns from past forecast errors | `AGENT-001`, `AGENT-002`, `AGENT-003`, `AGENT-004` |

## Status

Judged from the code and tests at commit `bcd262900b00fe8aaa4b33070700ce0753a7d4f0` (17 October 2026).

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 17 | 0 | 0 | 17 |
| Target and push further | 0 | 42 | 40 | 82 |
| All | 17 | 42 | 40 | 99 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `EASEL-001` | Setup, roles and membership | published | done | `tests/easel.test.mjs` |  |
| `EASEL-002` | Actuals preview that writes nothing | published | done | `tests/easel.test.mjs` |  |
| `EASEL-003` | Mapped, reconciled actuals acceptance | published | done | `tests/easel.test.mjs` `tests/review-fixes.test.mjs` |  |
| `EASEL-004` | Exact undo of an actuals import | published | done | `tests/easel.test.mjs` |  |
| `EASEL-005` | Labelled opening cash and explicit cash timing | published | done | `tests/easel.test.mjs` |  |
| `EASEL-006` | Exact revenue drivers with traces | published | done | `tests/easel.test.mjs` `tests/totals.test.mjs` |  |
| `EASEL-007` | Position costs and restricted pay detail | published | done | `tests/easel.test.mjs` |  |
| `EASEL-008` | Expenses, schedules and visible allocations | published | done | `tests/easel.test.mjs` `tests/totals.test.mjs` |  |
| `EASEL-009` | Department submissions | published | done | `tests/easel.test.mjs` `tests/review-fixes.test.mjs` |  |
| `EASEL-010` | Exact-revision budget approval | published | done | `tests/easel.test.mjs` |  |
| `EASEL-011` | Scenario branch and comparison | published | done | `tests/easel.test.mjs` |  |
| `EASEL-012` | Proposals promoted at exact revisions | published | done | `tests/easel.test.mjs` |  |
| `EASEL-013` | Month close and source-backed variance | published | done | `tests/easel.test.mjs` `tests/browser-journey.mjs` |  |
| `EASEL-014` | Published review pack with decisions | published | done | `tests/easel.test.mjs` |  |
| `EASEL-015` | Excel workbook move-in with provenance | published | done | `tests/easel.test.mjs` `tests/workbook-undo.test.mjs` |  |
| `EASEL-016` | Complete export and clean restore | published | done | `tests/browser.mjs` `tests/review-fixes.test.mjs` |  |
| `EASEL-017` | Owned runtime on Base | published | done | `tests/browser.mjs` `.github/workflows/verify.yml` |  |
| `CONNECT-001` | QuickBooks Online actuals connector | target | missing |  | No QuickBooks Online OAuth, pull, idempotent re-pull or trial-balance reconciliation; actuals arrive only as uploaded CSV files |
| `CONNECT-002` | Xero actuals connector | target | missing |  | No Xero connector or tracking-category mapping |
| `CONNECT-003` | NetSuite actuals connector | target | missing |  | No NetSuite SuiteQL connector or subsidiary mapping |
| `CONNECT-004` | Pantry actuals connector | target | missing |  | No Pantry API connector |
| `CONNECT-005` | Scheduled refresh with visible freshness | target | missing |  | No scheduled handler, freshness display, refresh failure state or restatement notice |
| `CONNECT-006` | Mapping rules that survive refresh | target | partial | `src/easel/actuals.ts` `tests/easel.test.mjs` | One-to-one account and department mappings are reused and unmapped accounts block acceptance; range, prefix and account-type rules and per-conclusion blocking are missing |
| `CONNECT-007` | Balance-sheet actuals and the trial balance | target | partial | `src/easel/actuals.ts` | Only the cash balance account maps to the balance sheet; other balance-sheet balances, a zero-sum trial balance and a forecast balance sheet opened from actuals are missing |
| `CONNECT-008` | Drill-through to the ledger transaction | target | partial | `src/easel/review.ts` `tests/easel.test.mjs` | Variance cells drill to accepted file rows with role filtering; links to the provider transaction need connectors |
| `CONNECT-009` | Bank balances for current cash | target | missing |  | No Plaid connection or bank-balance cash view |
| `CONNECT-010` | Connection custody and status | target | missing |  | No connector credential storage, Connections page or token revocation |
| `MODEL-001` | Configurable horizon and multi-year plans | target | partial | `src/easel/setup.ts` | Fiscal-year start is configurable and the workspace stores a horizon, but setup fixes it at twelve months; quarter and year roll-ups, multi-year plans and 4-4-5 calendars are missing |
| `MODEL-002` | A rolling forecast that extends itself | target | partial | `src/easel/cycle.ts` `tests/easel.test.mjs` | Closing a month keeps the forecast snapshot and substitutes actuals; the forecast does not extend beyond the fixed horizon |
| `MODEL-003` | Custom dimensions and hierarchies | target | partial | `src/easel/setup.ts` `tests/easel.test.mjs` | Lines and departments are the only dimensions; user-defined dimensions, hierarchies and account roll-ups are missing |
| `MODEL-004` | User-defined formulas and driver lines | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Fixed driver forms (revenue, positions, expenses, schedules, allocations) calculate exactly with traces; a user formula language with lookups and cycle refusal is missing |
| `MODEL-005` | Versioned model structure | target | partial | `src/easel/approved.ts` `tests/review-fixes.test.mjs` | Approved snapshots keep saved arithmetic when engine code changes; user-editable structure, structure diffs and moved-cell lists for structure changes are missing |
| `MODEL-006` | Starter models for US small businesses | target | missing |  | No starter models; setup starts from an empty plan |
| `MODEL-007` | Recalculation at small-business scale | target | partial | `src/easel/engine.ts` | Deterministic synchronous recalculation exists; no measured scale target, background calculation or calculating state |
| `FIN-001` | Linked P&L, balance sheet and cash flow | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Profit and cash are linked monthly; a forecast balance sheet, an indirect cash-flow statement and a balance check are missing |
| `FIN-002` | Working-capital timing | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Collection and payment lags with opening receivables and payables ship; DSO and DPO curves, deferred revenue, prepaids and accruals are missing |
| `FIN-003` | Debt and financing | target | missing |  | No loans, credit lines, interest, covenants or equity events |
| `FIN-004` | Capex and depreciation | target | missing |  | No asset purchases, depreciation or fixed-asset schedules |
| `FIN-005` | Runway, burn and an agreed cash floor | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Monthly closing cash per scenario ships; burn, runway, cash-zero date and an agreed floor checked across scenarios are missing |
| `FIN-006` | US tax estimates in the forecast | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | On-costs are one flat percentage of salary; US employer taxes with wage bases, income-tax estimates and sales-tax pass-through are missing |
| `FIN-007` | 13-week cash forecast | target | missing |  | No weekly direct cash view |
| `PEOPLE-001` | Roster and payroll actuals from Gusto | target | missing |  | No Gusto connector or roster reconciliation |
| `PEOPLE-002` | Roster from Rippling, Willow, BambooHR and ADP | target | missing |  | No HRIS connectors |
| `PEOPLE-003` | Open roles from the ATS | target | missing |  | No ATS connector or requisition-driven positions |
| `PEOPLE-004` | US compensation assumptions | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Salary × (1 + on-costs) by start and end month ships; hourly, W-2 or 1099 type, merit increases, bonus, commission, benefits per head and 401(k) match are missing |
| `PEOPLE-005` | Compensation access separate from finance | target | partial | `src/easel/views.ts` `tests/easel.test.mjs` | Server-side filtering limits pay detail to finance and the department's contributors; a separate compensation permission and filtering for add-ins and agents are missing |
| `PEOPLE-006` | Headcount plan against actual | target | partial | `src/easel/review.ts` `tests/easel.test.mjs` | Payroll-line cost variance ships; headcount against a roster, hiring slippage and attrition are missing |
| `REV-001` | Pipeline drivers from Orbit, HubSpot and Salesforce | target | missing |  | No CRM connectors or pipeline drivers |
| `REV-002` | Subscription metrics from Stripe Billing and Nectar | target | missing |  | No billing connectors, ARR bridge or cohorts |
| `REV-003` | A revenue driver library | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Volume × rate and customers × revenue per customer ship; seat, usage, utilization, milestone and formula drivers are missing |
| `REV-004` | Bookings, billings, revenue and cash | target | missing |  | No bookings, billing schedules or deferred revenue |
| `SPEND-001` | Committed and card spend | target | missing |  | No purchasing, expense or card connectors and no committed-spend view |
| `SHEET-001` | Excel add-in with live formulas | target | partial | `src/easel/workbook.ts` `tests/easel.test.mjs` | One-way .xlsx import with cell and formula provenance ships; an Excel add-in with live functions and proposal write-back is missing |
| `SHEET-002` | Google Sheets add-on with live formulas | target | missing |  | No Google Sheets add-on |
| `SHEET-003` | Model import that keeps formulas | target | partial | `src/easel/xlsx.ts` `tests/easel.test.mjs` | Cached values import with formula text kept as provenance; formula translation, an untranslated-cell report and total reconciliation are missing |
| `SHEET-004` | Excel exports with formulas | target | partial | `src/easel/pack-documents.ts` `tests/easel.test.mjs` | Packs download as HTML and CSV; .xlsx exports with live formulas are missing |
| `SHEET-005` | Scheduled spreadsheet pulls | target | missing |  | No linked-range scheduled pulls |
| `CYCLE-001` | Budget calendar, tasks and reminders | target | partial | `src/easel/cycle.ts` `tests/easel.test.mjs` | Submission requests, states and history ship; a planning calendar, due dates, reminders and escalation are missing |
| `CYCLE-002` | Metric-triggered tasks | target | missing |  | No rules or automatic task creation |
| `CYCLE-003` | Notifications from discussions and events | target | missing |  | No mention, approval or event notifications by email or chat |
| `CYCLE-004` | Private and shared scenarios | target | partial | `src/easel/views.ts` `tests/easel.test.mjs` | Contributor proposals are visible to their author and finance; private sandboxes for any planner, sharing grants and official-scenario marking are missing |
| `CYCLE-005` | Quarterly reforecasts and version comparison | target | partial | `src/easel/cycle.ts` `tests/easel.test.mjs` | The approved budget and kept forecasts are frozen; named reforecast versions and multi-version comparison are missing |
| `CYCLE-006` | Long-range plan linked to the operating plan | target | missing |  | No multi-year strategic plan or target reconciliation |
| `REPORT-001` | Report builder | target | partial | `src/ui/overview.tsx` `src/easel/views.ts` | Fixed overview, scenario and variance views ship; user-built, saved and scheduled reports are missing |
| `REPORT-002` | Dashboards | target | partial | `src/ui/overview.tsx` `src/ui/chart.tsx` | One fixed overview with a chart ships; configurable KPI dashboards, saved layouts and audience sharing are missing |
| `REPORT-003` | Board pack | target | partial | `src/easel/review.ts` `src/easel/pack-documents.ts` `tests/easel.test.mjs` | Immutable monthly review packs with decisions ship as HTML and CSV; templates, quarter packs, refresh before publish, PDF, PowerPoint and Excel exports and saving to file stores are missing |
| `REPORT-004` | Linked PowerPoint and Word reporting | target | missing |  | No PowerPoint or Word add-ins |
| `REPORT-005` | Department budget-owner reporting | target | partial | `src/easel/review.ts` `tests/easel.test.mjs` | Per-department variances with role filtering ship in the app; the scheduled statement by email after close is missing |
| `REPORT-006` | Scheduled cash alerts | target | missing |  | No alert rules, schedules or deliveries |
| `REPORT-007` | BI and warehouse feeds | target | missing |  | No warehouse inputs or BI dataset endpoint |
| `ACCESS-001` | Groups and per-dimension permissions | target | partial | `src/easel/access.ts` `tests/easel.test.mjs` | Finance, department-scoped contributor and viewer roles ship; groups, per-dimension and per-capability grants and an access report are missing |
| `ACCESS-002` | SSO and SCIM | target | missing |  | No SAML, OIDC or SCIM |
| `AUDIT-001` | Model audit trail | target | partial | `src/easel/views.ts` `tests/easel.test.mjs` | An append-only activity log with actor and revisions is shown to finance (last 300 entries); filters, changed values for every record type, CSV export and agent attribution are missing |
| `ERASE-001` | Person erasure | target | missing |  | No erasure command, pseudonymised snapshot reads or receipt |
| `API-001` | Public API with scoped tokens | target | partial | `src/easel/api.ts` `API.md` | The documented HTTP API works with a signed-in person's session; scoped personal and service tokens, expiry and rate limits are missing |
| `API-002` | Webhooks and automation apps | target | missing |  | No webhooks or published automation apps |
| `API-003` | MCP endpoint for outside agents | target | missing |  | No MCP endpoint |
| `ENTITY-001` | Multiple entities and management consolidation | target | missing |  | One entity per installation; no consolidation or eliminations |
| `ENTITY-002` | Multi-currency planning | target | missing |  | One reporting currency; no rate tables or translation |
| `US-001` | US defaults | target | partial | `src/easel/setup.ts` `src/easel/csv.ts` | Currency is chosen at setup and CSV dates accept MM/DD/YYYY; the default is AUD, `$` formatting applies only to AUD, and US time zones and tax defaults are missing |
| `MOVE-001` | Move in from Adaptive Planning | target | missing |  | No Adaptive Planning import |
| `MOVE-002` | Move in from Planful | target | missing |  | No Planful import |
| `MOVE-003` | Move in from Anaplan, Runway and Pigment | target | missing |  | No Anaplan, Runway or Pigment import |
| `MOVE-004` | A parallel month against the old tool | target | missing |  | No parallel-month comparison or sign-off |
| `PORT-001` | An export a buyer can open without Easel | target | partial | `tests/browser.mjs` | The complete `rer export` archive ships; an open per-table CSV, .xlsx and JSON export with a digest manifest is missing |
| `MOBILE-001` | Review and approve at phone width | target | partial | `tests/browser-journey.mjs` | Actuals move-in, month close and explanation are journeyed at 390 with overflow checks; submission, approval, promotion and dashboards at 390 are not journeyed |
| `MOBILE-002` | Native iOS and Android apps | target | missing |  | No native apps or push notifications |
| `HOST-001` | Hosted operation on the buyer's Cloudflare account | target | partial | `tests/browser.mjs` `deploy.json` | `rer deploy --dry-run` runs; a real deployment, scheduled handler, delivered mail and hosted backup and restore are not exercised |
| `AGENT-001` | Constraint watch | push-further | partial | `src/easel/engine.ts` `src/easel/views.ts` | Cash forecasts and scenario comparisons exist; constraints, refresh-triggered checks, decision items and cause tracing to sources are missing |
| `AGENT-002` | Feasible responses for the owner to choose | push-further | partial | `src/easel/plan.ts` `tests/easel.test.mjs` | Exact-revision proposals and promotion exist; lever bounds and an agent that searches for constraint-restoring responses are missing |
| `AGENT-003` | Asking owners for uncertain assumptions | push-further | missing |  | No structured owner questions, sourced assumptions or escalation |
| `AGENT-004` | Learning from the company's own forecast errors | push-further | partial | `src/easel/review.ts` `src/easel/cycle.ts` | Kept forecasts compare with actuals and carry confirmed explanations; error decomposition, backtests and suggested assumption revisions are missing |
| `AGENT-005` | Source-change guard | push-further | partial | `src/easel/actuals.ts` `tests/easel.test.mjs` | Unmapped accounts and departments block file acceptance; live-feed change detection, mapping proposals and impact lists are missing |
| `AGENT-006` | Following decisions through to results | push-further | partial | `src/easel/review.ts` `tests/easel.test.mjs` | Published decisions and actions keep owner, due date and progress; chasing and realised-outcome measurement are missing |
| `AGENT-007` | Variance commentary grounded in sources | push-further | partial | `src/easel/review.ts` `tests/easel.test.mjs` | Deterministic drafts cite accepted rows and mark timing hypotheses; model-drafted commentary over connected sources and server-checked citations are missing |
| `AGENT-008` | Modeler agent | push-further | partial | `src/easel/plan.ts` `API.md` | Outside agents can prepare proposals through the API as a signed-in person; in-product plain-language model changes are missing |
| `AGENT-009` | Analyst with cited answers | push-further | missing |  | No in-product analyst; Easel calls no model |
| `AGENT-010` | Recurring missions | push-further | missing |  | No saved or scheduled missions |
| `AGENT-011` | Agent governance | push-further | partial | `src/easel/access.ts` `src/easel/store.ts` | Every request runs with a person's role and a session-fenced save; model-provider settings, budgets, agent labels, a stop switch and an agent action refusal list are missing |
