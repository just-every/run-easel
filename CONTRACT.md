# Easel contract

Target edition: 17 October 2026. Easel is connected FP&A for small and mid-size finance teams. A US finance lead or fractional CFO buys it instead of Workday Adaptive Planning, Planful or Anaplan, and it has to beat what Runway, Pigment and Aleph offer the same buyer. It provides flexible driver models; rolling profit-and-loss, balance-sheet and cash forecasts; headcount and compensation planning; scenarios; and board reporting. All of it is fed live from the ledger, payroll and the CRM, with every number traceable to its source and every approval kept as an immutable record.

This contract describes the product Easel is being built towards, not only what exists today. The [Status](#status) table shows how close the current code is. The 17 published clauses (`EASEL-001` to `EASEL-017`) are the shipped monthly planning loop. The target clauses complete the category job, and the push-further clauses take agents beyond today's up-and-comers. Difficulty (provider OAuth apps, Office add-ins, payroll and CRM connectors, native apps) is engineering work recorded as a clause. It is never a reason to drop scope.

## Product target

| | |
| --- | --- |
| Category | FP&A (financial planning and analysis) software |
| Incumbents a buyer switches from | Workday Adaptive Planning, Planful, Anaplan, Runway, Pigment, Aleph |
| First buyer | A US finance lead or fractional CFO at a business with 25 to 250 employees, closing its books in QuickBooks Online, Xero, NetSuite or Sage Intacct, paying people through Gusto, Rippling or a PEO such as Justworks or TriNet, budgeting with department heads who enter their own numbers each autumn, selling through HubSpot or Salesforce, and planning in USD |

For that buyer, switching means that their ledger (with its history), payroll roster, pipeline and subscription data arrive through live connectors or mapped files; their budget owners enter numbers in a planning grid as they did in the incumbent's sheets; their Excel or Google Sheets model arrives with its formulas; every planning job they ran in the incumbent (budget, rolling forecast, headcount, scenarios, department submissions, board pack, cash alerts) has an Easel equivalent; and their old tool's versions are imported with a list of what did not map.

A buyer replacing an incumbent needs the whole job, so the target is the whole job:

- **Connected actuals.** QuickBooks Online, Xero, NetSuite, Sage Intacct and [Pantry](https://github.com/just-every/run-pantry) actuals backfill up to 36 months of history on first connection and refresh on a schedule, with reusable account, department and class mapping, balance-sheet balances, freshness and drill-through to the ledger transaction (`CONNECT-*`, `EASEL-002` to `EASEL-004`).
- **A flexible model.** A planning grid with paste, spreading, copy forward, split sub-rows and cell notes; plans built from prior-year actuals; user-defined formulas, dimensions and hierarchies, a configurable rolling horizon, multi-year plans and starter models for subscription, services and project businesses (`MODEL-*`, `EASEL-006`, `EASEL-008`).
- **Three statements and cash.** A linked P&L, balance sheet and cash-flow forecast with receivables and payables timing, deferred revenue, debt, capex and depreciation, runway, a 13-week cash view and US tax estimates (`FIN-*`, `EASEL-005`).
- **Headcount and compensation.** A roster from Gusto, Rippling or [Willow](https://github.com/just-every/run-willow), or a mapped roster and payroll-register file from any PEO or payroll provider, open roles from [Lodge](https://github.com/just-every/run-lodge) or Greenhouse, and US compensation assumptions (W-2 and 1099, employer payroll taxes with wage bases, benefits, bonus, commission), with salary visible only to those allowed (`PEOPLE-*`, `EASEL-007`).
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
| General ledger, bookkeeping and the close | [Pantry](https://github.com/just-every/run-pantry) (or QuickBooks Online, Xero, NetSuite, Sage Intacct) | Read-only actuals connectors and drill-through (`CONNECT-001` to `CONNECT-004`, `CONNECT-011`, `CONNECT-008`); Easel never posts a journal |
| Sales CRM and pipeline | [Orbit](https://github.com/just-every/run-orbit) (or HubSpot, Salesforce) | Pipeline drivers with finance-owned probabilities (`REV-001`) |
| Subscription billing | [Nectar](https://github.com/just-every/run-nectar) (or Stripe Billing, Chargebee) | Subscription metrics and cohorts as actuals and drivers (`REV-002`) |
| Core HR and the employee record | [Willow](https://github.com/just-every/run-willow) (or Rippling, BambooHR) | Roster and compensation sync (`PEOPLE-002`) |
| Recruiting | [Lodge](https://github.com/just-every/run-lodge) (or Greenhouse) | Open roles become planned positions (`PEOPLE-003`) |
| Payroll runs and tax filing | No sibling (Gusto, Rippling, ADP RUN, and PEOs such as Justworks, TriNet and Insperity) | Roster and payroll-cost actuals by connector or file (`PEOPLE-001`, `PEOPLE-007`); Easel estimates employer cost and never pays anyone |
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
Finance connects QuickBooks Online through Intuit OAuth 2.0 (accounting scope, read-only). Easel pulls the chart of accounts, classes, locations, departments, customers and vendors, and general-ledger detail by month for the profit-and-loss and balance-sheet accounts. The first connection backfills history: finance chooses 12 to 36 closed months (24 by default), and each backfilled month lands as its own reviewed batch with its own trial-balance reconciliation, so prior-year actuals are there to plan from (`MODEL-009`) and to report against (`REPORT-001`). Each pull is previewed as a reviewed batch: rows by month, new or changed accounts and dimensions, and anything unmapped. It lands through the import journal with the provider's transaction IDs, so a re-pull of the same month is idempotent and a provider-side edit shows as a change rather than a duplicate. Monthly totals reconcile to the QuickBooks trial balance for the same period, and the difference is shown when they do not.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

*Acceptance:* through the HTTP API against a recorded QuickBooks Online sandbox company (a fake only at the Intuit edge) holding 24 closed months, connect and see all 24 months backfilled and accepted, each with a reconciled trial balance; then pull two current months, map, accept, edit one transaction in the fake, pull again and see one changed row, no duplicates, and a reconciled trial balance; one recorded run against Intuit's live sandbox. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows.

*Status:* missing.

#### CONNECT-002 — Xero actuals connector.
Finance connects Xero through OAuth 2.0 (read-only accounting scopes). Easel pulls accounts, both tracking categories (mapped to departments or other dimensions under `MODEL-003`), contacts and journals by month, with the same history backfill, preview, idempotent re-pull, change detection and trial-balance reconciliation as `CONNECT-001`.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

*Acceptance:* the `CONNECT-001` journey, including the 24-month backfill, against a recorded Xero demo company, including two tracking categories mapped to two dimensions; one recorded run against Xero's live demo company. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows.

*Status:* missing.

#### CONNECT-003 — NetSuite actuals connector.
Finance connects NetSuite through token-based authentication or OAuth 2.0 with a read-only role. Easel pulls accounts, subsidiaries, departments, classes and locations and posted transaction lines by period through SuiteQL, with the same history backfill, preview, idempotent re-pull, change detection and trial-balance reconciliation. Subsidiaries map to entities under `ENTITY-001`.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

*Acceptance:* the `CONNECT-001` journey, including the 24-month backfill, against a recorded NetSuite SuiteQL fake with two subsidiaries; one recorded run against a NetSuite sandbox account. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows.

*Status:* missing.

#### CONNECT-004 — Pantry actuals connector.
A buyer on [Pantry](https://github.com/just-every/run-pantry) connects it through Pantry's API with a scoped read-only token, and gets the same history backfill, chart, dimension and journal pull, idempotency, change detection and reconciliation as `CONNECT-001`.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

*Acceptance:* two local installations (Pantry and Easel) where Easel backfills every closed month Pantry holds, pulls a current month, a Pantry correction shows as a changed row on the next pull, and trial balances agree. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows.

*Status:* missing.

#### CONNECT-011 — Sage Intacct actuals connector.
Finance connects Sage Intacct with a Web Services sender ID and a read-only web-services user, or through the Sage Intacct REST API with OAuth 2.0. Easel pulls the chart of accounts, entities (a multi-entity shared company maps its entities under `ENTITY-001`), the standard dimensions (location, department, class, project, customer and vendor), any user-defined dimensions, and general-ledger detail by period. Location and department map to Easel dimension members under `CONNECT-006` and `MODEL-003`. It has the same history backfill, preview, idempotent re-pull by the provider's record number, change detection and trial-balance reconciliation as `CONNECT-001`, and drill-through links to the Intacct entry (`CONNECT-008`).

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

*Acceptance:* the `CONNECT-001` journey, including the 24-month backfill, against a recorded Sage Intacct fake of Web Services or REST general-ledger detail with two entities, two locations and three departments, where locations and departments map to two Easel dimensions and each entity's trial balance reconciles; a variance cell's row links to the Intacct fake's entry URL (`CONNECT-008`); one recorded run against a Sage Intacct sandbox company. Also assert CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically; a new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; source account types and dimensions remain available to the resolver. Also exercise inherited CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL; a viewer reads amounts without restricted source rows.

*Status:* missing.

#### CONNECT-005 — Scheduled refresh with visible freshness.
Each connection refreshes on a schedule finance sets (hourly, nightly or weekly, in the company's US time zone) and on demand. Refresh pulls data and metadata together. Every view shows each source's last successful refresh, and a source older than its schedule is marked stale wherever its numbers appear. A failed refresh keeps the previous data, shows the provider error and notifies finance (`CYCLE-003`). A provider-side change to a month that is already closed never silently changes closed numbers: it opens a restatement notice that lists the affected lines, packs and kept forecasts, and finance accepts or rejects it.

*Acceptance:* a Workers journey with the scheduled handler, a provider fake and a mail fake: refresh on schedule; fail, and show the error with data unchanged while finance receives one refresh-failure notification naming the source and error (`CYCLE-003`); go stale; and post a change to a closed month that produces a restatement notice instead of a changed pack.

*Status:* missing.

#### CONNECT-006 — Mapping rules that survive refresh.
Account and dimension mappings are reusable rules, not only one-to-one picks. They cover a single account, an account-number range, a prefix or a provider account type to a planning line, the cash balance, a balance-sheet line or an exclusion, and a provider department, class or tracking option to an Easel dimension member. A new account that a rule covers is mapped automatically and listed. A new account that no rule covers blocks only the conclusions that depend on it, and is never treated as zero.

For current CSV sources, exact account picks override reusable rules. Number ranges are inclusive and compare digit-only account codes numerically, including leading zeros. Prefixes and account types match case sensitively after trimming surrounding spaces. Multiple rules with the same target agree; differing targets are ambiguous until finance resolves them, including by an exact pick. Optional account-type metadata comes from a selected CSV column. Each preview lists automatic rule matches and period completeness. EASEL-003 still requires the whole file to map before acceptance. An accepted period with unresolved account or department rows blocks calculations consuming that period, even when unresolved rows net to zero; its revenue and cost conclusions are absent, never zero. Earlier complete-period reviews and frozen snapshots remain available. Existing mappings continue to classify working actuals; changing rules never changes frozen arithmetic. Current CSV doors satisfy this obligation. CONNECT-001, CONNECT-002, CONNECT-003, CONNECT-004 and CONNECT-011 inherit provider refresh and metadata resolution; MODEL-003 inherits custom dimension mappings and finer line/dimension dependency blocking; CONNECT-007 inherits balance-sheet targets, each before shipping.

*Acceptance:* the API journey maps by range, pulls a month containing a new in-range account (mapped and listed) and a new out-of-range account, and sees the dependent month's reconciliation blocked until finance maps it.

*Status:* done. Acceptance: `tests/mapping-rules.test.mjs` and `tests/mapping-rules-browser.mjs` (CONNECT-006).

#### CONNECT-007 — Balance-sheet actuals and the trial balance.
Accepted actuals include month-end balance-sheet balances (cash, receivables, prepaid, fixed assets, payables, accrued liabilities, deferred revenue, debt and equity), not only profit-and-loss flows and the cash account. Each closed month shows a trial balance that sums to zero, and the forecast balance sheet (`FIN-001`) opens from the last closed month's actual balances.

Before balance-sheet actuals ship, CONNECT-007 inherits CONNECT-006: single-account, numeric-range, prefix and source-account-type rules can target every supported balance-sheet line, with automatic listing and dependency blocking for unresolved balances.

*Acceptance:* the API journey accepts a ledger month with balance-sheet accounts, reads a zero-sum trial balance, closes the month and sees the forecast balance sheet open from those balances. Also assert inherited CONNECT-006 rules targeting supported balance-sheet lines: a new in-range balance-sheet account maps automatically, and an unresolved balance blocks dependent balance-sheet conclusions until mapped.

*Status:* partial.

#### CONNECT-008 — Drill-through to the ledger transaction.
Every actual cell drills to the accepted rows behind it (as `EASEL-013` does for files). For a connected source, each row also links to the transaction in QuickBooks Online, Xero, NetSuite, Sage Intacct or Pantry, under the same role filtering as `EASEL-007`.

All accepted CSV rows behind each variance cell are available, without an evidence sample cap, under the existing department filtering. Current CSV doors satisfy CONNECT-008. CONNECT-001, CONNECT-002, CONNECT-003, CONNECT-004 and CONNECT-011 inherit provider transaction links and their provider-fake follow-link journeys before shipping.

*Acceptance:* in the browser at 1440 and 390, open a variance cell, see its rows, and follow a row's link to the provider-fake transaction URL; a viewer sees amounts without another department's rows.

*Status:* done. Acceptance: `tests/drillthrough.test.mjs`, `tests/easel.test.mjs` and `tests/mapping-rules-browser.mjs` (CONNECT-008).

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

*Acceptance:* the API journey sets a 36-month horizon starting in a fiscal year that begins in October, and reads monthly, quarterly and annual totals that agree to the cent; a second plan on a 4-4-5 calendar reads periods of 4, 4 and 5 weeks in each quarter, with each quarter's total equal to the sum of its three periods and the year equal to its four quarters, to the cent.

*Status:* partial.

#### MODEL-002 — A rolling forecast that extends itself.
Finance sets a rolling window (for example always 18 months ahead). Closing a month (`EASEL-013`) extends the forecast by one month and seeds the new month from its drivers, with the kept forecast snapshot taken first. Budgets keep their fixed fiscal horizon.

*Acceptance:* with an 18-month window, close two months in the API journey and see the forecast end move by two months, the new months calculated from drivers, and both kept forecasts unchanged.

*Status:* done. Acceptance: `tests/rolling-forecast.test.mjs` (MODEL-002).

#### MODEL-003 — Custom dimensions and hierarchies.
Beyond lines and departments, finance defines dimensions (for example entity, region, product, customer segment, project, class or location), each with a hierarchy of members and roll-ups. Inputs, actuals and reports can be cut by any dimension, and source dimensions map onto them (`CONNECT-006`). Lines get a chart-of-accounts hierarchy with subtotals.

Before custom dimensions ship, MODEL-003 inherits CONNECT-006: source departments, classes and tracking options map to their dimension members through reusable rules. Source dimension metadata also enables finer line/dimension-level dependency blocking, which remains a gap until this clause ships; unrelated conclusions remain available and unresolved inputs are never zero.

*Acceptance:* the API journey adds a Region dimension with a two-level hierarchy, enters inputs by region, maps a provider class to it, and reads a report that rolls regions up to the total without changing line totals; it then builds a chart-of-accounts hierarchy (for example Operating expense, then Sales and marketing, then Advertising and Events) and reads subtotals equal to the sum of their lines in every month. Also assert inherited CONNECT-006 source department/class/tracking-option rules for custom dimension members, and finer line/dimension-level blocking: an unresolved member blocks its dependent cells while unrelated cells remain available, with no invented zero.

*Status:* partial.

#### MODEL-004 — User-defined formulas and driver lines.
Finance writes driver lines and formulas over named drivers, lines, dimensions and time: arithmetic, prior-period and offset references (including references to the Actuals version and other versions at an offset, `MODEL-009`), growth, lookups by dimension member, IF, MIN, MAX, ROUND and SUM over a dimension. Evaluation keeps the published arithmetic rules: integer cents, counts in hundredths, one rounding half away from zero per division, and a trace per cell. Circular references are refused with the cycle named. Every formula change is a revision that a proposal can carry (`EASEL-012`).

*Acceptance:* the API journey defines a support-cost driver as tickets per customer × cost per ticket with a lookup by region, reads exact cells with traces, and is refused a circular formula with the cycle named.

*Status:* partial.

#### MODEL-005 — Versioned model structure.
Changes to model structure (dimensions, formulas, driver forms, mapping rules) are versioned with a readable diff of what changed and which cells moved. Approved budgets, kept forecasts and published packs keep the structure they were made with and never recompute.

*Acceptance:* change a formula in the API journey, read the structure diff and moved cells, and confirm the approved budget snapshot keeps its SHA-256 and cells.

*Status:* partial.

#### MODEL-006 — Starter models for US small businesses.
Setup offers starter models that a buyer edits rather than builds from nothing: SaaS (ARR, churn, CAC, seats), professional services (billable headcount, utilization, rate), project or backlog businesses, and wholesale or ecommerce (units, price, COGS, inventory days). Each comes with its drivers, lines, dimensions, dashboards and cash timing, in USD.

*Acceptance:* in the browser at 1440, create a company from each starter (SaaS, professional services, project or backlog, and wholesale or ecommerce) and, for each, see a three-statement forecast, a dashboard and a cash view without entering a formula; the services starter's revenue traces to billable headcount × utilization × rate, the project starter's to milestones and backlog, and the wholesale starter's cash to inventory days.

*Status:* missing.

#### MODEL-007 — Recalculation at small-business scale.
A model with 2,000 input rows, 5 dimensions and a 36-month horizon recalculates after an input change in under 2 seconds p95. Larger changes run as a visible background calculation, and the affected cells show as recalculating rather than stale-but-final.

*Acceptance:* a load fixture at the stated size through the API, timing 50 edits at p95, and a larger bulk import showing calculation state in the browser.

*Status:* partial.

#### MODEL-008 — Planning grid entry.
Finance and contributors enter budgets in a browser grid of lines (with their dimension members) by months for a scenario, limited to the cells they may edit (`EASEL-007`, `EASEL-009`, `ACCESS-001`). In the grid a person types into a cell or pastes a rectangular block copied from Excel or Google Sheets; the pasted cells are previewed, and any non-numeric or out-of-scope cell is refused with its address. They spread an amount across selected cells evenly, in proportion to the cells' current values, or in the shape of the same months' prior-year actuals (`MODEL-009`), with the cent remainder placed so the total is exact; or they change selected cells by a percent or an amount. They copy a value forward to later months. They split a cell into named sub-rows (for example one per vendor) that roll up to it, so the cell becomes their sum; sub-row detail follows the department's visibility, so finance and that department's contributors see it, and viewers and other departments see only the cell total. They add a note to a cell, kept with the cell's revision and shown in its trace. Cells that come from drivers or formulas show their trace and cannot be typed over. Each grid save is one revision fenced like every other save (a conflict returns 409), and undo restores the previous values of the cells it changed. At 390 pixels the grid scrolls inside its own frame with the line column pinned, and the page has no horizontal overflow.

*Acceptance:* in the browser at 1440 and 390, a contributor opens their department's budget during a requested submission, pastes a 3 × 12 block copied from a spreadsheet, spreads $120,000 across twelve months evenly ($10,000 a month) and then by prior-year actual shape (each cell in the prior-year proportion, summing to exactly $120,000), copies a value forward, splits one cell into two vendor sub-rows that total the cell, adds a note, and reads the cells and note back through the API. A proportional spread of $60,000 over three cells holding $1,000, $2,000 and $3,000 reads $10,000, $20,000 and $30,000; a 10% increase and then a $500 decrease on a selection read exactly; undo of the last grid save restores the previous values of exactly the cells it changed; a save at a stale revision returns 409 and changes nothing; a pasted block that reaches into another department's row lists that cell's address as refused and leaves that department's cell unchanged; typing over a driver-calculated cell is refused and its trace shows. Another department's contributor and a viewer read the same cell through the API and receive its total without the sub-rows or vendor names, and the page has no horizontal overflow at 390.

*Status:* partial.

#### MODEL-009 — Plans built from actuals history.
Accepted actuals (from connectors or files) form an Actuals version that every plan can read. A plan line or driver can be defined from it at a time offset, for example the same month last year × 1.05 or the trailing three-month average, under the `MODEL-004` arithmetic and trace rules; each cell's trace names the actual cells it read. Finance can seed a new budget scenario from prior-year actuals by line and department in one step, with a growth percent per line, and the seeded inputs stay editable in the grid (`MODEL-008`). Plan views and the grid can overlay actuals for closed and prior-year months beside the plan. A month with no accepted actuals is reported as missing, never read as zero.

*Acceptance:* with 24 closed months accepted, the API journey defines a line as prior-year same-month actual × 1.05 and reads each cell equal to that actual × 1.05 rounded once, with a trace citing the actual cell; defines a line as the trailing three-month average of actuals and reads each cell equal to the three prior months' actuals ÷ 3 rounded once, with a trace citing all three; seeds a budget scenario from prior-year actuals with 5% growth on one line and reads its inputs; and, for a month with no accepted actuals, is told which month is missing rather than given zero. In the browser at 1440, the grid and the scenario view of that budget show each closed and prior-year month's actual beside the plan cell, equal to the API's actual for that month and line.

*Status:* partial.

### Three statements and cash

#### FIN-001 — Linked P&L, balance sheet and cash flow.
Every scenario produces a monthly forecast profit and loss, balance sheet and indirect cash-flow statement that link: net income flows to retained earnings, working-capital, capex and financing movements flow to cash, and the balance sheet balances every month. A visible check marks any month that does not balance, and its cause is traced.

*Acceptance:* the API journey reads three statements for 24 months and asserts assets equal liabilities plus equity in every month and that cash-flow closing cash equals balance-sheet cash.

*Status:* partial.

#### FIN-002 — Working-capital timing.
Receivables follow days-sales-outstanding or a collection curve by revenue line, and payables follow days-payables-outstanding or payment terms by expense line. Annual-upfront billing creates deferred revenue that is recognised ratably, prepaid expenses amortise, and accrued payroll and bonuses settle on their pay dates. Opening balances come from actuals (`CONNECT-007`) or labelled estimates (`EASEL-005`).

*Acceptance:* the API journey sets 45-day DSO, a 30-day term on one vendor line and an annual-upfront plan, and reads receivables, payables, deferred revenue and cash that agree with the traces; a $24,000 annual insurance prepayment amortises at $2,000 a month with the prepaid balance declining to zero; payroll earned but unpaid at a month end is accrued and settles on the next pay date; and a quarterly bonus accrues monthly and settles in its pay month, with accrued liabilities and cash agreeing with the traces.

*Status:* partial.

#### FIN-003 — Debt and financing.
Term loans, lines of credit and venture debt carry principal, rate (fixed, or variable over a stated base rate), draws, repayments and amortisation schedules, with interest flowing to the P&L. Covenant tests (minimum cash, liquidity, debt-to-EBITDA) are computed every month. Equity raises are planned events.

*Acceptance:* the API journey adds a line of credit with a minimum-cash covenant, draws on it in a downside, and reads interest, balances and a covenant breach month; it then plans a $5,000,000 equity raise in a month and reads the cash inflow and the equity increase on the balance sheet with no profit-and-loss effect.

*Status:* missing.

#### FIN-004 — Capex and depreciation.
Planned asset purchases by category depreciate straight-line over a useful life set per category. Disposals and existing fixed assets (from `CONNECT-007`) continue their schedules. Capex reaches cash in its payment month. Current purchased and opening existing assets conform; `CONNECT-007` inherits asset-record mapping into these schedules before its imported fixed-asset capability ships. Category useful life is in whole months. With zero residual value, each ordinary month depreciates the opening depreciable balance divided by its life, rounded down to integer cents; the final month takes the remaining cents. For an existing asset that balance is cost minus entered opening accumulated depreciation, spread over its entered remaining life. Depreciation begins in the in-service month, inclusive. No depreciation is charged in the disposal month: book value is removed, proceeds reach cash and the book value minus proceeds is a gain or loss on the non-cash expense line. Non-cash lines, including accepted depreciation actuals, do not create cash payments. Purchases are paid in the explicit payment month (the in-service month when omitted). Categories and assets copy with scenarios and freeze with approvals; schedules appear in plan exports and published pack workbooks.

*Acceptance:* the API journey adds $120,000 of equipment over 5 years and reads $2,000 of monthly depreciation, net book value and the cash outflow.

*Status:* done.

#### FIN-005 — Runway, burn and an agreed cash floor.
Every scenario shows, by month, gross burn (cash paid out), net burn (cash paid out less cash received), months of runway (closing cash divided by the trailing three-month average net burn), the lowest cash month, and the cash-zero date (the first forecast month whose closing cash falls below zero). Finance records an agreed cash floor and runway minimum, which every scenario, proposal and comparison checks and marks where they are crossed. Money is in integer cents. The trailing window includes the current month and up to two preceding available plan months; no unavailable history is invented. Runway is rounded half away from zero once to hundredths of a month from the unrounded average; a negative ratio means cash is already exhausted. Nonpositive average net burn has no finite runway and is labelled “Not burning” for positive cash or “Cash exhausted” otherwise. Minimum checks use the unrounded ratio; equality meets the minimum. The earliest tied month is the lowest-cash month, and cash-zero searches only months after actuals-through. Current finance-agreed thresholds apply to saved and working cash without changing approved snapshots; a currency mismatch is explicitly not assessed.

*Acceptance:* the API and browser journeys set a $500,000 floor, branch a downside that crosses it, and see the crossing month and runway on the scenario, the comparison and the dashboard. Through the API, each month's gross burn, net burn and runway equal values computed by hand from that month's cash in and out, and a scenario whose cash runs out reads its cash-zero date as the first month with closing cash below zero.

*Status:* done. Acceptance: `tests/cash-health.test.mjs` and `tests/cash-health-browser-journey.mjs` (FIN-005).

#### FIN-006 — US tax estimates in the forecast.
Employer payroll taxes are calculated per person under US rules with annual wage bases: Social Security, Medicare, FUTA, and SUTA at a state rate and wage base finance enters. Income tax is estimated at the federal rate plus a state rate, with a loss carryforward. Sales tax collected is a pass-through to cash that never counts as revenue. These are planning estimates, labelled as such, and never filings.

*Acceptance:* the API journey plans one $180,000 W-2 position and reads Social Security stopping at the wage base within the year, Medicare continuing, FUTA on the first $7,000, SUTA at an entered 2.7% state rate stopping at an entered state wage base, and an income-tax line on a profitable month; a loss in an early month is carried forward and reduces income tax in a later profitable month; and sales tax collected on an invoice flows into cash and out through a sales-tax payable without changing revenue.

*Status:* partial.

#### FIN-007 — 13-week cash forecast.
A weekly direct cash view for the next 13 weeks is built from open receivables by due date and expected payment behaviour (each customer's average days late from its paid-invoice history, or a collection curve finance sets), open payables and bills by due date, payroll on its run dates (from the payroll connection or file, `PEOPLE-001` and `PEOPLE-007`, or a pay schedule finance sets), debt service on its schedule (`FIN-003`) and planned spend in its planned week. Finance can override any week with a note, and the view reconciles to the monthly forecast at month ends.

*Acceptance:* with ledger, payroll and bank fakes holding open invoices and bills, a semimonthly pay schedule, a term-loan payment and a planned spend line, the API journey reads 13 weeks in which each invoice lands in the week its customer's paid-invoice history puts it (a customer averaging 12 days late lands 12 days after its due date), each bill on its due date, each payroll run on its run date, the loan payment in its scheduled week and the planned spend in its planned week; the month-end weeks agree with the monthly cash forecast, and an override keeps its note.

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

*Acceptance:* the API journey plans a salaried W-2 engineer with a merit increase, a commissioned salesperson tied to pipeline bookings, a 1099 contractor with no employer tax, an hourly W-2 position at $40 × 120 hours a month, and a salaried position carrying a 10% bonus paid in March, $1,200 a month of benefits, a 4% 401(k) match and a department on-cost default overridden on that position; each monthly cost reads as traced components (salary or hours × rate, merit, bonus, commission, benefits, 401(k) match and each employer tax) that sum to the cell.

*Status:* partial.

#### PEOPLE-005 — Compensation access separate from finance.
Compensation detail (names, salaries, bonus and commission) is a permission of its own. Finance can grant a finance analyst plan access without pay access. Department heads see their department's totals and, only when granted, their own people's detail. Exports, packs, API responses, agent answers and Excel or Sheets pulls apply the same server-side filtering.

*Acceptance:* through the API and the Excel add-in fake, an analyst without pay access, a department head and a viewer each read the same plan, and none receives a salary they are not granted; a planted salary never appears in their exports.

*Status:* partial.

#### PEOPLE-006 — Headcount plan against actual.
Monthly headcount, hires, departures and payroll cost are compared between plan and roster actual by department. Hiring slippage (planned start against actual start), backfills and an attrition assumption are shown, and the slippage history feeds `AGENT-004`.

*Acceptance:* after a roster pull with one late hire and one departure, the API and browser journeys show plan against actual headcount and cost by department, with the slippage in days.

*Status:* partial.

#### PEOPLE-007 — Roster and payroll-register file import.
A buyer whose PEO or payroll provider has no connector (for example Justworks, TriNet, Insperity, ADP TotalSource, Paychex, Paylocity or Paycom) imports a roster file and a payroll-register file as CSV or .xlsx. Finance maps columns once: employee ID, name, department, title, W-2 or 1099, salary or hourly rate, and start and termination dates; and, per pay run, gross wages, employer taxes, benefits and fees. The mapping is saved per provider. The import previews without writing, lands through the import journal with the original bytes, undoes exactly, and reconciles to planned positions in the same four buckets as `PEOPLE-001`: matched, unplanned hire, planned but not hired, and changed salary. Payroll-register totals reconcile to the ledger's payroll lines. Pay detail follows `EASEL-007` and `PEOPLE-005`.

*Acceptance:* through the API, import a Justworks-shaped roster CSV and an .xlsx payroll register: the preview writes nothing; the accepted import shows the four reconciliation buckets and a register total reconciled to the ledger's payroll lines; a viewer receives headcount and cost totals without names or salaries; a second file in the same shape needs no column choices; and undo removes exactly what the import wrote.

*Status:* missing.

### Revenue and pipeline

#### REV-001 — Pipeline drivers from Orbit, HubSpot and Salesforce.
Finance connects [Orbit](https://github.com/just-every/run-orbit), HubSpot or Salesforce (OAuth, read-only) and pulls open and closed deals with stage, amount, owner, close date and product. From Salesforce, Easel reads Opportunities with their stage and that stage's probability (custom stages included), their OpportunityLineItems (product, quantity, unit price and term), and the org's fiscal periods, so a close date lands in the fiscal period Salesforce assigns it, custom fiscal years included. A deal with line items is split by product, and each product follows its own deal-to-revenue rule. From Orbit, Easel reads deals through Orbit's API with a scoped read-only token. Finance owns the assumptions, which are explicit and versioned: probability by stage (or the CRM's own probability, labelled), close-date slippage by stage, and the deal-to-revenue rule (one-time, ratable over term, or subscription start). Weighted bookings feed revenue, deferred revenue, commissions and cash. Each revenue cell traces to the deals behind it, under role filtering.

Before pipeline capability ships, REV-001 inherits CYCLE-002: next-quarter pipeline coverage is a rule metric with a finance-set threshold, evaluated on refresh/close to create cited owned/due tasks, with no duplicate while open. Existing task authority, blocking and evidence rules apply.

*Acceptance:* a HubSpot fake with deals at three stages; the API journey sets probabilities and slippage, reads weighted bookings and revenue traced to deal IDs, moves a deal's close date in the fake, refreshes, and sees the revenue move; one recorded run against a HubSpot developer test account. The same journey against a recorded Salesforce fake of Opportunity, OpportunityLineItem and fiscal-period records: a custom stage whose CRM probability is 60% is overridden by finance to 40%, and weighted bookings use 40% with the trace labelling the override; an opportunity with a one-time setup product and a 12-month subscription product recognises the first in its close month and the second ratably over 12 months; a close date inside a custom fiscal period lands in that period; one recorded run against a Salesforce Developer Edition org. Two local installations (Orbit and Easel), as in `CONNECT-004`: Easel pulls Orbit's deals, a deal's close date changed in Orbit moves its revenue on Easel's next refresh, and the trace cites the Orbit deal ID.

Also assert inherited CYCLE-002 next-quarter coverage rules: a below-threshold refresh creates a cited owned/due task, a second unchanged refresh does not duplicate it while open, and live task visibility, owner authority and blocked-source handling hold.

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
A Microsoft Excel add-in (Office.js, Windows, Mac and Excel on the web) signs in as the person and provides worksheet functions, for example `=EASEL.VALUE("Revenue","Sales","2027-01","Forecast")`, plus pull-a-report ranges. Values refresh on demand (a Refresh command for the workbook or the selection) and when the workbook opens, and each refresh pulls every change made in Easel since the last one, under server-side role filtering for the person refreshing. Write-back follows the same rules as the browser. While a contributor's department submission is requested or returned (`EASEL-009`), their write to that department's budget inputs lands directly as their own entry at the next plan revision, as an entry in the grid (`MODEL-008`) would, and their later submission includes it. Once the department is submitted, a write to its working plan becomes a proposal bound to the current revision (`EASEL-012`). A write to an approved budget, a kept forecast or another department's cells is refused with the reason. The workbook's own formulas around Easel cells stay live: a formula that references an Easel function cell (for example a `SUM` over them) recalculates whenever a refresh changes that cell, as any Excel dependency does.

*Acceptance:* an Office.js test host loads the add-in against a running Easel, in a workbook holding `=EASEL.VALUE(...)` cells and a plain `=SUM(...)` over them: the functions return role-filtered values; a value changed in Easel through the browser or the API, followed by an on-demand refresh, shows the new value in its function cell and the new total in the `SUM`; after a second Easel change, closing and reopening the workbook refreshes on open and shows that change in the cell and the `SUM`; a viewer refreshing the same workbook receives role-filtered values without restricted detail; during a requested submission a contributor's write to their own department lands directly at the next revision and reads back in the browser and the API; after they submit, the same write returns as a proposal bound to the revision; a write to the approved budget and a write to another department are refused; one recorded run in Excel on the web.

*Status:* partial.

#### SHEET-002 — Google Sheets add-on with live formulas.
The same functions, refresh, role filtering and write-back rules as `SHEET-001` (direct entry during an open submission, a proposal once submitted, refusal on approved budgets, kept forecasts and other departments), as a Google Workspace add-on with custom functions. Refresh runs on demand from the add-on menu and when the spreadsheet opens, and scheduled refresh runs through an installable time-driven trigger that pulls Easel changes without the spreadsheet being open. Sheet formulas over Easel cells recalculate after each refresh.

*Acceptance:* an Apps Script test harness against a running Easel replays the `SHEET-001` journey, including the on-demand refresh, the refresh on open and a `SUM` over Easel cells recalculating after each, and the viewer's role-filtered refresh; the harness then fires the installable time-driven trigger with the spreadsheet closed, and on reopening the sheet shows an Easel change made before the trigger ran; one recorded run in a Google Workspace test domain.

*Status:* missing.

#### SHEET-003 — Model import that keeps formulas.
Importing an existing Excel or Google Sheets model translates supported formulas (arithmetic, SUM, IF, references across sheets and months, growth and lookups) into Easel formulas (`MODEL-004`). Every formula it cannot translate is listed with its sheet and cell, and that cell keeps its cached value with provenance (`EASEL-015`). Totals reconcile to the workbook's own totals before anything is accepted, and undo works through the journal.

*Acceptance:* import a fixture workbook model with cross-sheet formulas and one unsupported function; the import report lists the unsupported cell, Easel totals equal the workbook totals, a driver change recalculates the translated formulas, and undo removes the import.

*Status:* partial.

#### SHEET-004 — Excel exports with formulas.
Any report, plan or pack exports as .xlsx with live subtotal, total and variance formulas and one sheet per statement, not values only. CSV exports remain. Pay detail follows `PEOPLE-005`. This obligation applies to every report and statement that exists today (scenario/overview P&L and cash, scenario comparisons, monthly variances, published packs, actuals reconciliation and filtered activity), using the same server-filtered views and immutable snapshots as the app. Future report, statement and plan capabilities (`REPORT-001` to `REPORT-007`, `FIN-001` to `FIN-007`, `MODEL-001` to `MODEL-009`) inherit this export obligation before they ship. Workbook amounts are integer minor units, labelled with their currency; differences are actual minus budget or comparison-to minus comparison-from. Unavailable comparison periods or different currencies have no difference value. A department-filtered plan exports that department's P&L and visible inputs, without a company-wide cash statement.

*Acceptance:* download a report as .xlsx through the browser, open it with a spreadsheet library in the test, and assert that subtotal cells hold formulas that evaluate to Easel's totals.

*Status:* done.

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
Finance writes rules such as "a department's actual spend exceeds budget by 10% and $5,000 in a closed month", "runway falls below 12 months" or "pipeline coverage for next quarter falls below 3×". When a refresh or close meets a rule, Easel creates a task with an owner and due date that cites the numbers, and does not create a duplicate while the task is open. Current actuals and runway metrics conform (ct, 19 October); before pipeline capability ships, REV-001 inherits the pipeline-coverage metric, rule evaluation on refresh/close, cited tasks and open-task deduplication. Finance creates, revises and disables rules. Closed-month spend is the department's natural-sign cost-of-sales plus operating expense, including non-cash costs, against the approved budget in the same currency and covered period. Both percentage and amount bounds are strict; equality does not trigger. A nonpositive budget has no finite overspend percentage: positive actual expense above the amount bound meets the percentage condition. Runway uses FIN-005's exact unrounded ratio and the earliest future breach; non-burning positive cash does not breach. Rules evaluate after accepted CSV refreshes and month closes, on save and on an explicit check. Incomplete imports, unresolved consumed mappings, unavailable owners, absent approved periods and currency mismatches are visibly blocked, never replaced with zero. Overspend tasks are deduplicated per rule/month, runway per rule/forecast while open; completing a task permits a new task on a subsequent check. Each task captures its rule revision and numeric/source evidence, owner and due date (N UTC calendar days after trigger). An overspend owner must be an active contributor of that department; runway owners must be active finance owners/admins. Finance sees/completes all tasks; an assignee sees/completes only their own tasks while their role and department remain valid. Rules are finance-only. Tasks are in-app records; CYCLE-003 carries notification delivery. Disabling a rule preserves existing tasks and their captured evidence.

*Acceptance:* `tests/metric-tasks.test.mjs` and `tests/metric-tasks-browser.mjs` (`CYCLE-002`): the API journey sets a 10% overspend rule, accepts and closes a month that breaks it, sees one task for the department contributor with actual/budget/variance/source citations and due date, and refreshes again without a duplicate. Assert strict percentage/amount boundaries, zero-budget spend, automatic late-refresh checks, immutable open-task evidence, all live authority restrictions, explicit blocking, runway arithmetic/earliest future breach and completion/retrigger semantics. At 1440/390 finance creates/checks/disables a rule, reads cited tasks and the assignee completes them with persisted attribution; viewers see neither rules nor tasks. REV-001 carries future pipeline metric/evaluation/dedup acceptance before shipping.

*Status:* done. Acceptance: `tests/metric-tasks.test.mjs` and `tests/metric-tasks-browser.mjs` (`CYCLE-002`).

#### CYCLE-003 — Notifications from discussions and events.
Mentioning a person in a comment or explanation, a returned submission, a pending approval, a restatement notice, a failed refresh and a triggered task each notify the person by email and, if connected, in Slack, Microsoft Teams or Nook. The notification links to the exact cell or record. Each person sets their channels, and a daily digest is the default.

*Acceptance:* with mail, Slack, Microsoft Teams and Nook fakes and a fake clock, the API journey produces one notification per event type, each linking to its record: a mention in a variance explanation (email and Slack), a returned submission to its contributor (email and Teams), a pending approval to finance, a restatement notice to finance, a failed refresh to finance, and a triggered task to its owner (Nook). A person who chose Teams only receives no email, and a digest-only person receives all their events in the next daily digest instead.

*Status:* missing.

#### CYCLE-004 — Private and shared scenarios.
Any planner can make a private sandbox scenario that only they can see, share it with named people or groups as read or edit, and submit it as a proposal. Finance sets which scenarios are official (budget, forecast, board case). Scenario-specific access rights are enforced on every read, comparison and export.

*Acceptance:* the API journey creates a private scenario for a contributor, confirms another contributor and a viewer get 404 for it, shares it read-only with the viewer, and confirms the viewer can compare but not edit.

*Status:* partial.

#### CYCLE-005 — Quarterly reforecasts and version comparison.
Besides the approved budget and the rolling forecast, finance saves named reforecast versions (for example Q2 reforecast), each frozen like a budget. Reports and variances can compare actual, budget, each reforecast and the current forecast. Finance saves the exact reviewed revision of a working forecast or scenario without changing its source. Names are trimmed and unique without regard to case among saved reforecasts. Each version retains its metadata, model structure, inputs and saved arithmetic through later edits, month closes, deletion of its working source and export/restore. Plan and comparison reports, monthly variances and published review packs use those saved figures. For a closed month, the current forecast includes accepted actuals. Version variance is actual minus version in integer minor units; a period outside a version's horizon has no amount or variance, and differing currencies have no variance.

*Acceptance:* the named `CYCLE-005` API journey freezes Q2 and Q3 reforecasts at their reviewed source revisions, refuses a stale revision and duplicate names, closes a month, and asserts actual against budget, both named reforecasts and the current forecast for the same line. It asserts every captured model and calculation remains unchanged after source edits, live metadata changes and source deletion; frozen edits are refused, and reads and exports retain existing role filtering. Named tests assert report and published-pack Excel formulas, HTML and CSV saved values, differing horizons and currency semantics. The real CLI export/restore journey retains exact snapshot bodies and SHA-256 values and refuses tampered lineage or arithmetic. A `CYCLE-005` browser journey at 1440 and 390 saves versions, edits the working forecast, closes, reads frozen plans and comparisons, and downloads the variance report as finance and a viewer.

*Status:* done.

#### CYCLE-006 — Long-range plan linked to the operating plan.
A 3-to-5-year annual plan holds top-down targets (revenue growth, margin, headcount, cash). Year one comes from the operating budget, and later years come from annual drivers. A reconciliation shows where the bottom-up budget misses the long-range target. Finance saves named plans linked to the operating budget at the reviewed budget and annual-plan revisions. Year one is the first twelve budget months: revenue, operating costs and profit sum those months, while headcount and cash use the final month. Working-budget edits flow through; an approved budget uses its saved arithmetic and snapshot digest. Annual periods start in the budget’s first fiscal month. Later years apply entered revenue growth, operating margin, whole-person headcount change and an explicit net cash change independent of profit. Money is integer minor units; divisions round half away from zero once. Revenue growth cannot be below −100%, margin cannot exceed 100%, and projected headcount cannot be negative. Revenue targets compound the entered prior-year revenue by the target growth rate (including year one); profit targets apply the target operating margin to target revenue. Headcount and cash targets are fixed year-end targets for each year. Gaps are budget or projection minus target. Members read aggregate plans and Excel exports; existing finance authority governs edits, and no position-level pay data is included.

*Acceptance:* `tests/long-range.test.mjs` (`CYCLE-006`) sets a five-year plan with a 40% growth target and asserts year one equals the twelve-month operating budget, every later annual driver, all four target gaps, three-year editing, exact rounding, stale-save refusal, existing role filtering and approved-budget immutability. Its Excel formulas independently evaluate to the API’s amounts and gaps. `tests/long-range-browser.mjs` (`CYCLE-006`) creates plans and reads the reconciliation and Excel download as finance and board at 1440 and 390 without page overflow.

*Status:* done.

### Reporting

#### REPORT-001 — Report builder.
Finance and permitted members build reports. Rows are lines, dimensions or hierarchies. Columns are months, quarters, years, year-to-date or trailing twelve months, across versions (actual, prior-year actual, budget, each reforecast and the forecast), with variance and year-over-year change in dollars and percent. Filters by any dimension member and conditional highlighting (for example a variance over 10% in red) are available. Reports are saved, shared, and scheduled for email delivery to named people daily, weekly or monthly in the company's time zone. They are always role-filtered on the server, and each recipient of a scheduled report gets the copy they would see if they opened it.

*Acceptance:* in the browser at 1440, build a department-by-quarter report of actual against budget with year-to-date, trailing-twelve-month, prior-year actual and year-over-year % columns, a department filter and a highlight rule; save it, share it with a viewer, and confirm through the API that the viewer's copy omits restricted detail. Year-to-date and trailing-twelve-month cells equal the sum of their months, and year-over-year % equals (actual − prior-year actual) ÷ prior-year actual, to the cent. With a mail fake and a fake clock, schedule the report weekly for Monday 8:00 Eastern to finance and a viewer: on Monday each receives one email, and the viewer's copy omits restricted detail.

*Status:* partial.

#### REPORT-002 — Dashboards.
Dashboards hold KPI tiles, charts and tables from saved reports and metrics, such as revenue, gross margin, burn, runway, ARR, headcount and pipeline coverage. Layouts are saved per person and shared per audience (leadership, board, departments) and work at phone width.

*Acceptance:* in the browser at 1440 and 390, build a dashboard with runway, ARR and headcount tiles, share it with the board persona, and see the same numbers in the API without horizontal overflow.

*Status:* partial.

#### REPORT-003 — Board pack.
A board pack template contains statements, KPIs, charts, variance commentary, decisions and appendix tables. It is generated for a closed month or quarter, refreshed until published, and published as an immutable snapshot (as in `EASEL-014`). It exports as PDF, PowerPoint (.pptx) and Excel, and can be saved to [Chest](https://github.com/just-every/run-chest), Google Drive or SharePoint. Refreshing keeps the commentary that people wrote.

*Acceptance:* generate a quarter pack in the browser, refresh it after a late adjustment with commentary kept, publish, download PDF, .pptx and .xlsx, and confirm through the API that the published numbers do not change after a later refresh; save the published pack to a Chest folder, a Google Drive folder and a SharePoint library through fakes, each holding a PDF with the same digest.

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

*Acceptance:* with a fake clock, a bank fake and mail and Slack fakes: a refresh that drops forecast lowest cash below the floor sends one alert with the crossing month; bank cash $60,000 below plan under a $50,000 rule sends one alert, and a 10% rule fires the same way; runway falling to 11 months under a 12-month rule sends one alert; a second refresh with no change sends none; a refresh that worsens the breach re-alerts once; an unchanged breach re-alerts after the set interval (for example seven days) on the fake clock; and acknowledgement is recorded.

*Status:* missing.

#### REPORT-007 — BI and warehouse feeds.
Operational metrics flow in from Snowflake, BigQuery or Databricks as driver actuals (for example active users or shipments), by a read-only query that finance reviews. Easel's actuals, plans and versions flow out to Power BI, Looker and Tableau through a read-only, role-scoped dataset endpoint and scheduled CSV or Parquet drops.

*Acceptance:* a warehouse fake supplies a monthly metric that drives a revenue line; a BI client fake reads the dataset endpoint with a scoped token and receives no pay detail; a scheduled nightly drop writes CSV and Parquet files to a storage fake whose rows equal the dataset endpoint's, with no pay detail.

*Status:* missing.

### Access, audit and governance

#### ACCESS-001 — Groups and per-dimension permissions.
Finance creates groups (for example FP&A team, department heads, board) and grants read or edit by dimension member (department, entity, region), by scenario (`CYCLE-004`) and by capability: compensation (`PEOPLE-005`), connections, model structure, approvals and publishing. Every server route enforces the grants, and an access report shows who can see what.

*Acceptance:* the API journey makes a group with edit on two departments and no pay access, adds a person, and confirms reads, writes and exports respect it; the access report lists it.

*Status:* partial.

#### ACCESS-002 — SSO and SCIM.
Easel is a SAML 2.0 and OIDC relying party for Okta, Microsoft Entra ID, Google Workspace and [Auth](https://github.com/just-every/run-auth), and a SCIM 2.0 server that provisions and deprovisions people and group membership. Deprovisioning ends the person's sessions at once and keeps their historical attribution.

*Acceptance:* with an IdP fake, sign in one person by SAML and another by OIDC; provision a person and a group by SCIM, add the person to the group by a SCIM group update and see the group's grants (`ACCESS-001`) apply, remove them and see the grants end; deprovision the person and see their session refused on the next request while their past submissions still show their name.

*Status:* missing.

#### AUDIT-001 — Model audit trail.
Every change to setup, inputs, formulas, mappings, connections, permissions, submissions, approvals, closes and packs is recorded with actor (person or agent), time, record, scenario, revision before and after, and the changed values. Finance filters the trail by person, record, scenario and date, and exports it. The trail is append-only and survives `rer export` and restore.

*Acceptance:* through the API, make changes as three people, filter the trail by one person and one scenario, export it as CSV, and confirm the database refuses to update or delete a trail row.

*Status:* done.

#### ERASE-001 — Person erasure.
Finance can erase a former member's personal data: their name, email and membership details, and, for an employee record from `PEOPLE-*`, their name and identifiers. Planning amounts stay, attributed to a stable pseudonym. Immutable snapshots keep their recorded digest, and every read and export of them shows the pseudonym in place of the erased name. The erasure returns a receipt with counts and time, and the audit trail records it without the erased data. Erasing the last finance member is refused.

*Acceptance:* through the API, erase a contributor who submitted and commented; their name is absent from live views, pack downloads and `rer export`, their submissions show the pseudonym, the snapshot digest is unchanged, and the receipt and audit row exist.

*Status:* missing.

#### API-001 — Public API with scoped tokens.
The HTTP API (`API.md`) is available to integrations through personal and service tokens with read or write scopes, the issuing person's role and an expiry. Requests are rate-limited, every write is fenced by revision as today, and token use enters the audit trail.

*Acceptance:* issue a read-only token, read a scenario, be refused a write, revoke the token and be refused a read.

*Status:* done.

#### API-002 — Webhooks and automation apps.
Signed webhooks fire on approval, close, publish, refresh failure, alert and task events. Published apps for [Crank](https://github.com/just-every/run-crank), Zapier and Make expose those triggers and the proposal and comment actions.

*Acceptance:* register a webhook receiver fake, approve a budget, and receive one signed event with a verifiable signature; replaying it is detectable by its ID. The Crank, Zapier and Make apps each run against a running Easel in that platform's developer test tooling (a local Crank installation, the Zapier Platform CLI, and a Make custom app in a test organisation): a trigger receives an approval event, and a create-proposal action creates a proposal bound to the revision.

*Status:* missing.

#### API-003 — MCP endpoint for outside agents.
An MCP endpoint exposes Easel's reads (scenarios, comparisons, variances, metrics) and its proposal, comment and explanation commands to the person's own agent (for example Claude). It uses that person's authority and filtering, and it can never approve, close, publish or promote.

*Acceptance:* an MCP client signed in as a contributor lists tools, reads a variance, creates a proposal, and is refused the approve and promote tools.

*Status:* done. Acceptance: `tests/mcp.test.mjs` (API-003).

### Entities, currency and US defaults

#### ENTITY-001 — Multiple entities and management consolidation.
A company plans several entities (for example a US C-corp and a services subsidiary), each with its own ledger connection (`CONNECT-001` to `CONNECT-004`, `CONNECT-011`), or several entities from one connection: a Sage Intacct multi-entity shared company (`CONNECT-011`) or NetSuite subsidiaries (`CONNECT-003`). Easel shows consolidated P&L, balance sheet and cash with intercompany balances and charges eliminated by rules finance sets. Entity-level access uses `ACCESS-001`.

*Acceptance:* two entities with an intercompany management fee; the API journey reads entity and consolidated statements in which the fee and the intercompany balance are eliminated and consolidated totals equal the sum less eliminations; the same holds when both entities arrive from one Sage Intacct multi-entity connection fake (`CONNECT-011`).

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
Easel imports a Workday Adaptive Planning export (levels, accounts, dimensions and attributes, versions with their data, sheet exports, and the rows of modeled sheets), together with the buyer's mapping. The rows of the personnel or workforce modeled sheet, read through `exportConfigurableModelData`, become Easel positions under `EASEL-007` and `PEOPLE-004`: employees and to-be-hired rows alike, each with its level (mapped to a department), title, start and end dates, salary or hourly rate with hours, and the row's own bonus, benefits and merit assumptions where present. The account totals that the personnel sheet calculates (from `exportData`) are the check: the imported positions' monthly cost per payroll account must equal them for the same version, and any difference is shown before anything is accepted. Pay detail on imported positions is restricted under `EASEL-007` and `PEOPLE-005` from the moment of import, the preview included. Rows of other modeled sheets (for example a capital-asset sheet) are listed, and their account totals still arrive through `exportData`. The import previews what will be created, lists everything that did not map (formulas it cannot translate, modeled-sheet columns with no Easel equivalent, other modeled-sheet rows, access rules), and lands through the journal with undo.

*Acceptance:* a fixture export in the shapes of Adaptive's documented API calls (`exportLevels`, `exportAccounts`, `exportDimensions`, `exportAttributes`, `exportVersions`, `exportData` and `exportConfigurableModelData` for a personnel sheet) and a sheet export; the import report lists created levels, accounts and versions and the unmapped items; budget totals equal the export's totals. The personnel-sheet fixture holds three employees and two to-be-hired rows, one row carrying a 10% bonus and a merit increase on a date, and one custom column with no Easel equivalent: the import creates five positions, two of them to be hired, whose monthly cost per payroll account equals the export's payroll-account totals for the same version to the cent, with the bonus and merit as traced components (`PEOPLE-004`); the custom column is listed as unmapped; a viewer reads headcount and payroll totals through the API without names or salaries, in the preview and after acceptance; undo removes the import, the positions included.

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
For one closed month, Easel compares its actuals, budget and forecast with the buyer's old tool or spreadsheet for the same month, line by line. Each difference is classified (mapping, timing, formula or source data), and finance signs the comparison off before switching. Finance alone creates, reads, classifies and signs these comparison records (ct, 19 October). A normalized CSV uses existing planning line and department IDs and natural-sign decimal actual, budget and forecast amounts in the reporting currency; a blank department is allowed. Easel compares the union of line/department rows, treating an absent side as zero, to accepted actuals, the approved budget and the forecast kept before close. Finance supplies each classification and its explanation; Easel does not infer the cause. Preview writes nothing and save checks the reviewed content digest. Saved comparisons capture their values; signing checks the exact revision and SHA-256 and requires every difference to be classified, then freezes the values, classifications, original CSV and source digest with the signer and time. Later model edits do not alter the sign-off. The sign-off records finance's decision before an external switch; Easel does not switch tools.

*Acceptance:* `tests/parallel-month.test.mjs` and `tests/parallel-month-browser.mjs` (`MOVE-004`): with a fixture month from the old tool that differs on one mapping and one formula, the comparison lists exactly those two differences and records finance's sign-off. The API asserts actual, budget and kept-forecast amounts, zero/missing rows, all four explicit classifications with explanations, no-write preview, exact digest/revision fences, restricted access, and signed persistence after model edits. Finance uploads, previews, classifies and signs at 1440 and 390, then reloads the frozen record with source/comparison digests and attribution.

*Status:* done. Acceptance: `tests/parallel-month.test.mjs` and `tests/parallel-month-browser.mjs` (`MOVE-004`).

#### PORT-001 — An export a buyer can open without Easel.
Besides the `rer export` archive (`EASEL-016`), finance can download the whole plan as open files: one CSV per table, an .xlsx per scenario with formulas (`SHEET-004`), the model definition as JSON, and every snapshot and original file, with a manifest of digests.

*Acceptance:* download the open export, unzip it in the test, check every manifest digest, and open a scenario workbook whose totals equal Easel's.

*Status:* done.

### Anywhere

#### MOBILE-001 — Review and approve at phone width.
Every review, approval, submission, comment, explanation, dashboard and alert works in the browser at 390 pixels without horizontal scrolling. That includes approving a budget and promoting a proposal. This applies to every capability that exists today; future review, approval, submission, comment, explanation, dashboard and alert capabilities (`CYCLE-001` to `CYCLE-006`, `REPORT-001` to `REPORT-007`, `AGENT-001` to `AGENT-011`) inherit the same 390-pixel obligation before they ship.

*Acceptance:* the browser journeys at 390 move in actuals, close a month and confirm an explanation (as today), and also submit a department, approve the budget, promote a proposal and read a dashboard, with an overflow check on every page.

*Status:* done. Acceptance: `tests/mobile.mjs` and `tests/browser-journey.mjs` (MOBILE-001).

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

- **The ledger and the close.** Easel is not the accounting system of record and never posts journals. Bookkeeping, the close, reconciliations and audited GAAP statements stay in [Pantry](https://github.com/just-every/run-pantry), QuickBooks Online, Xero, NetSuite or Sage Intacct, which Easel reads (`CONNECT-*`). Close-management tools such as FloQast and BlackLine stay separate.
- **Payroll and tax filing.** Easel estimates employer cost and taxes for planning (`FIN-006`, `PEOPLE-004`). It never runs payroll or files Form 941, Form 940, W-2 or 1099. That stays with Gusto, Rippling, ADP RUN or the buyer's PEO; no Run Edit Run product owns payroll today. Income-tax figures are planning estimates; filings and tax advice come from the buyer's CPA (whose practice may run on [Blotter](https://github.com/just-every/run-blotter)).
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
| Live actuals connectors for QuickBooks Online, Xero and NetSuite with account/department mapping and automatic monthly refresh | `CONNECT-001`, `CONNECT-002`, `CONNECT-003`, `CONNECT-005`, `CONNECT-006`, `CONNECT-011` |
| A flexible model: user-defined formulas, dimensions, configurable rolling horizon and multi-year plans | `MODEL-001`, `MODEL-002`, `MODEL-003`, `MODEL-004`, `MODEL-008`, `MODEL-009`, `CYCLE-006` |
| Linked P&L, balance sheet and cash-flow forecast covering AR/AP timing, debt, capex and runway | `FIN-001`, `FIN-002`, `FIN-003`, `FIN-004`, `FIN-005`, `FIN-007` |
| Headcount and compensation planning fed from Gusto/Rippling with restricted salary visibility | `PEOPLE-001`, `PEOPLE-002`, `PEOPLE-004`, `PEOPLE-005`, `PEOPLE-007`, `EASEL-007` |
| Revenue and pipeline drivers from HubSpot/Salesforce (and Orbit) plus subscription metrics (ARR, churn, cohorts) from Stripe or Nectar | `REV-001`, `REV-002`, `REV-003`, `REV-004` |
| Two-way Excel and Google Sheets sync that keeps formulas live, plus board-pack dashboards and scheduled cash alerts | `SHEET-001`, `SHEET-002`, `SHEET-003`, `REPORT-002`, `REPORT-003`, `REPORT-006` |
| Push further: a planning agent that watches actuals, pipeline and hiring, flags broken cash or runway constraints, computes feasible responses and learns from past forecast errors | `AGENT-001`, `AGENT-002`, `AGENT-003`, `AGENT-004` |

## Status

Judged from the code and tests at commit `1086527233bf9ee39094c8b6c60c3e7257fa0780` (17 October 2026).

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 17 | 0 | 0 | 17 |
| Target and push further | 15 | 34 | 37 | 86 |
| All | 32 | 34 | 37 | 103 |

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
| `CONNECT-001` | QuickBooks Online actuals connector | target | missing |  | No QuickBooks Online OAuth, history backfill, pull, idempotent re-pull or trial-balance reconciliation; actuals arrive only as uploaded CSV files |
| `CONNECT-002` | Xero actuals connector | target | missing |  | No Xero connector or tracking-category mapping |
| `CONNECT-003` | NetSuite actuals connector | target | missing |  | No NetSuite SuiteQL connector or subsidiary mapping |
| `CONNECT-004` | Pantry actuals connector | target | missing |  | No Pantry API connector |
| `CONNECT-011` | Sage Intacct actuals connector | target | missing |  | No Sage Intacct connector, dimension mapping or entity mapping |
| `CONNECT-005` | Scheduled refresh with visible freshness | target | missing |  | No scheduled handler, freshness display, refresh failure state or restatement notice |
| `CONNECT-006` | Mapping rules that survive refresh | target | done | `src/easel/account-rules.ts`, `src/easel/actuals-read.ts`, `tests/mapping-rules.test.mjs`, `tests/mapping-rules-browser.mjs` | Current CSV exact/range/prefix/type rules, automatic match listing, reviewed fingerprints and period-dependent blocking; future connectors, balance-sheet targets and dimensions inherit the obligation in their clauses |
| `CONNECT-007` | Balance-sheet actuals and the trial balance | target | partial | `src/easel/actuals.ts` | Only the cash balance account maps to the balance sheet; other balance-sheet balances, a zero-sum trial balance and a forecast balance sheet opened from actuals are missing |
| `CONNECT-008` | Drill-through to the ledger transaction | target | done | `src/easel/actuals-read.ts`, `src/easel/review.ts`, `tests/drillthrough.test.mjs`, `tests/mapping-rules-browser.mjs` | Every accepted CSV row is drillable under inherited department filtering; future connectors carry provider links and browser assertions before shipping |
| `CONNECT-009` | Bank balances for current cash | target | missing |  | No Plaid connection or bank-balance cash view |
| `CONNECT-010` | Connection custody and status | target | missing |  | No connector credential storage, Connections page or token revocation |
| `MODEL-001` | Configurable horizon and multi-year plans | target | partial | `src/easel/setup.ts` | Fiscal-year start is configurable and the workspace stores a horizon, but setup fixes it at twelve months; quarter and year roll-ups, multi-year plans and 4-4-5 or 5-4-4 calendars are missing |
| `MODEL-002` | A rolling forecast that extends itself | target | done | `tests/rolling-forecast.test.mjs` (MODEL-002) |  |
| `MODEL-003` | Custom dimensions and hierarchies | target | partial | `src/easel/setup.ts` `tests/easel.test.mjs` | Lines and departments are the only dimensions; user-defined dimensions, hierarchies and account roll-ups are missing |
| `MODEL-004` | User-defined formulas and driver lines | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Fixed driver forms (revenue, positions, expenses, schedules, allocations) calculate exactly with traces; a user formula language with lookups and cycle refusal is missing |
| `MODEL-005` | Versioned model structure | target | partial | `src/easel/approved.ts` `tests/review-fixes.test.mjs` | Approved snapshots keep saved arithmetic when engine code changes; user-editable structure, structure diffs and moved-cell lists for structure changes are missing |
| `MODEL-006` | Starter models for US small businesses | target | missing |  | No starter models; setup starts from an empty plan |
| `MODEL-007` | Recalculation at small-business scale | target | partial | `src/easel/engine.ts` | Deterministic synchronous recalculation exists; no measured scale target, background calculation or calculating state |
| `MODEL-008` | Planning grid entry | target | partial | `src/easel/model.ts` `tests/easel.test.mjs` | Schedule inputs hold entered monthly values per line and department through the API; a grid, paste, spreading, copy forward, split sub-rows and cell notes are missing |
| `MODEL-009` | Plans built from actuals history | target | partial | `src/easel/actuals.ts` `tests/easel.test.mjs` | Accepted actuals are kept by month for any period, including months before the plan year; plan lines that read actuals at an offset, seeding a budget from prior-year actuals and an actuals overlay are missing |
| `FIN-001` | Linked P&L, balance sheet and cash flow | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Profit and cash are linked monthly; a forecast balance sheet, an indirect cash-flow statement and a balance check are missing |
| `FIN-002` | Working-capital timing | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Collection and payment lags with opening receivables and payables ship; DSO and DPO curves, deferred revenue, prepaids and accruals are missing |
| `FIN-003` | Debt and financing | target | missing |  | No loans, credit lines, interest, covenants or equity events |
| `FIN-004` | Capex and depreciation | target | done | `src/easel/assets.ts`, `tests/assets.test.mjs`, `tests/assets-browser-journey.mjs` | Category useful lives, purchased/opening assets, cent-exact depreciation and book values, disposals, non-cash expense lines, explicit cash timing, immutable snapshots and formula exports |
| `FIN-005` | Runway, burn and an agreed cash floor | target | done | `tests/cash-health.test.mjs` and `tests/cash-health-browser-journey.mjs` (FIN-005): monthly hand-computed burn/runway, floor and runway crossings, lowest cash, forecast cash-zero, current agreement on immutable cash, proposals/comparisons and Excel; 1440/390 finance and board journeys |  |
| `FIN-006` | US tax estimates in the forecast | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | On-costs are one flat percentage of salary; US employer taxes with wage bases, income-tax estimates and sales-tax pass-through are missing |
| `FIN-007` | 13-week cash forecast | target | missing |  | No weekly direct cash view |
| `PEOPLE-001` | Roster and payroll actuals from Gusto | target | missing |  | No Gusto connector or roster reconciliation |
| `PEOPLE-002` | Roster from Rippling, Willow, BambooHR and ADP | target | missing |  | No HRIS connectors |
| `PEOPLE-003` | Open roles from the ATS | target | missing |  | No ATS connector or requisition-driven positions |
| `PEOPLE-004` | US compensation assumptions | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Salary × (1 + on-costs) by start and end month ships; hourly, W-2 or 1099 type, merit increases, bonus, commission, benefits per head and 401(k) match are missing |
| `PEOPLE-005` | Compensation access separate from finance | target | partial | `src/easel/views.ts` `tests/easel.test.mjs` | Server-side filtering limits pay detail to finance and the department's contributors; a separate compensation permission and filtering for add-ins and agents are missing |
| `PEOPLE-006` | Headcount plan against actual | target | partial | `src/easel/review.ts` `tests/easel.test.mjs` | Payroll-line cost variance ships; headcount against a roster, hiring slippage and attrition are missing |
| `PEOPLE-007` | Roster and payroll-register file import | target | missing |  | No roster or payroll-register file import or roster reconciliation |
| `REV-001` | Pipeline drivers from Orbit, HubSpot and Salesforce | target | missing |  | No Orbit, HubSpot or Salesforce connector, stage probabilities, line-item revenue rules or pipeline drivers |
| `REV-002` | Subscription metrics from Stripe Billing and Nectar | target | missing |  | No billing connectors, ARR bridge or cohorts |
| `REV-003` | A revenue driver library | target | partial | `src/easel/engine.ts` `tests/easel.test.mjs` | Volume × rate and customers × revenue per customer ship; seat, usage, utilization, milestone and formula drivers are missing |
| `REV-004` | Bookings, billings, revenue and cash | target | missing |  | No bookings, billing schedules or deferred revenue |
| `SPEND-001` | Committed and card spend | target | missing |  | No purchasing, expense or card connectors and no committed-spend view |
| `SHEET-001` | Excel add-in with live formulas | target | partial | `src/easel/workbook.ts` `tests/easel.test.mjs` | One-way .xlsx import with cell and formula provenance ships; an Excel add-in with live functions, on-demand and on-open refresh, direct entry during an open submission and proposal write-back is missing |
| `SHEET-002` | Google Sheets add-on with live formulas | target | missing |  | No Google Sheets add-on, refresh on open or installable-trigger refresh |
| `SHEET-003` | Model import that keeps formulas | target | partial | `src/easel/xlsx.ts` `tests/easel.test.mjs` | Cached values import with formula text kept as provenance; formula translation, an untranslated-cell report and total reconciliation are missing |
| `SHEET-004` | Excel exports with formulas | target | done | `src/easel/report-workbooks.ts`, `src/easel/pack-workbook.ts`, `tests/spreadsheet-export.test.mjs`, `tests/export-browser-journey.mjs` | Every current plan/report/pack exports XLSX with live subtotal, total and variance formulas; statement sheets, scoped detail, immutable packs and CSV retained |
| `SHEET-005` | Scheduled spreadsheet pulls | target | missing |  | No linked-range scheduled pulls |
| `CYCLE-001` | Budget calendar, tasks and reminders | target | partial | `src/easel/cycle.ts` `tests/easel.test.mjs` | Submission requests, states and history ship; a planning calendar, due dates, reminders and escalation are missing |
| `CYCLE-002` | Metric-triggered tasks | target | done | `tests/metric-tasks.test.mjs` `tests/metric-tasks-browser.mjs` |  |
| `CYCLE-003` | Notifications from discussions and events | target | missing |  | No mention, approval or event notifications by email or chat |
| `CYCLE-004` | Private and shared scenarios | target | partial | `src/easel/views.ts` `tests/easel.test.mjs` | Contributor proposals are visible to their author and finance; private sandboxes for any planner, sharing grants and official-scenario marking are missing |
| `CYCLE-005` | Quarterly reforecasts and version comparison | target | done | `src/easel/reforecasts.ts` `src/easel/version-comparison.ts` `tests/reforecasts.test.mjs` `tests/reforecasts-browser.mjs` `tests/restore-flow.mjs` | Exact-revision named frozen models, every-version reports and immutable pack exports; native-role filtering, differing horizons/currencies, source deletion and real CLI restore |
| `CYCLE-006` | Long-range plan linked to the operating plan | target | done | `src/easel/long-range.ts`, `src/ui/long-range.tsx`, `tests/long-range.test.mjs`, `tests/long-range-browser.mjs` | Named 3–5-year plans link operating-budget arithmetic, annual drivers and four target reconciliations; exact-revision saves, aggregate member reads and formula Excel at desktop/phone widths |
| `REPORT-001` | Report builder | target | partial | `src/ui/overview.tsx` `src/easel/views.ts` | Fixed overview, scenario and variance views ship; user-built and saved reports, year-to-date, trailing-twelve-month, prior-year and year-over-year columns, filters, highlighting and scheduled email delivery are missing |
| `REPORT-002` | Dashboards | target | partial | `src/ui/overview.tsx` `src/ui/chart.tsx` | One fixed overview with a chart ships; configurable KPI dashboards, saved layouts and audience sharing are missing |
| `REPORT-003` | Board pack | target | partial | `src/easel/review.ts` `src/easel/pack-documents.ts` `tests/easel.test.mjs` | Immutable monthly review packs with decisions ship as HTML and CSV; templates, quarter packs, refresh before publish, PDF, PowerPoint and Excel exports and saving to file stores are missing |
| `REPORT-004` | Linked PowerPoint and Word reporting | target | missing |  | No PowerPoint or Word add-ins |
| `REPORT-005` | Department budget-owner reporting | target | partial | `src/easel/review.ts` `tests/easel.test.mjs` | Per-department variances with role filtering ship in the app; the scheduled statement by email after close is missing |
| `REPORT-006` | Scheduled cash alerts | target | missing |  | No alert rules, schedules, re-alert rules or deliveries |
| `REPORT-007` | BI and warehouse feeds | target | missing |  | No warehouse inputs or BI dataset endpoint |
| `ACCESS-001` | Groups and per-dimension permissions | target | partial | `src/easel/access.ts` `tests/easel.test.mjs` | Finance, department-scoped contributor and viewer roles ship; groups, per-dimension and per-capability grants and an access report are missing |
| `ACCESS-002` | SSO and SCIM | target | missing |  | No SAML, OIDC or SCIM |
| `AUDIT-001` | Model audit trail | target | done | `src/easel/audit.ts` `src/easel/audit-write.ts` `tests/audit.test.mjs` `tests/restore-flow.mjs` | Atomic before/after values for native and imported records, person or agent attribution, finance filters and complete CSV export; append-only database guards and real CLI restore preserve the trail |
| `ERASE-001` | Person erasure | target | missing |  | No erasure command, pseudonymised snapshot reads or receipt |
| `API-001` | Public API with scoped tokens | target | done | `src/easel/token-admin.ts` `src/easel/token-auth.ts` `tests/api-tokens.test.mjs` `API.md` | Personal and named service bearers use Base credentials, read/write scopes, expiry, revocation, issuer role and department ceilings, durable rate limits, atomic write fences and token-use audit events; credentials stay out of exports |
| `API-002` | Webhooks and automation apps | target | missing |  | No webhooks or published automation apps |
| `API-003` | MCP endpoint for outside agents | target | done | `tests/mcp.test.mjs` (API-003) |  |
| `ENTITY-001` | Multiple entities and management consolidation | target | missing |  | One entity per installation; no consolidation or eliminations |
| `ENTITY-002` | Multi-currency planning | target | missing |  | One reporting currency; no rate tables or translation |
| `US-001` | US defaults | target | partial | `src/easel/setup.ts` `src/easel/csv.ts` | Currency is chosen at setup and CSV dates accept MM/DD/YYYY; the default is AUD, `$` formatting applies only to AUD, and US time zones and tax defaults are missing |
| `MOVE-001` | Move in from Adaptive Planning | target | missing |  | No Adaptive Planning import, including personnel modeled-sheet rows as positions |
| `MOVE-002` | Move in from Planful | target | missing |  | No Planful import |
| `MOVE-003` | Move in from Anaplan, Runway and Pigment | target | missing |  | No Anaplan, Runway or Pigment import |
| `MOVE-004` | A parallel month against the old tool | target | done | `tests/parallel-month.test.mjs` `tests/parallel-month-browser.mjs` |  |
| `PORT-001` | An export a buyer can open without Easel | target | done | `src/easel/open-export.ts`, `tests/open-export.test.mjs`, `tests/open-export-browser-journey.mjs` | Finance downloads product and import-journal table CSVs, scenario formula workbooks, model JSON, every immutable snapshot and retained original, with digest manifest; existing credential exclusions preserved |
| `MOBILE-001` | Review and approve at phone width | target | done | `tests/mobile.mjs` and `tests/browser-journey.mjs` (MOBILE-001): complete planning/review journeys at 390, persisted exact-revision approval/promotion, dashboard cash equals API, page overflow checks |  |
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
