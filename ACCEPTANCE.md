<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Easel installation

The primary journey: configure the company, bring in ledger and workforce data and the existing model, prepare department budgets, approve the exact plan, compare alternatives, close with actuals, explain the variances, publish the review pack and preserve the installation.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 6 | 107 | 6 | 119 |
| Agent surface | 0 | 1 | 4 | 5 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 6 | 108 | 10 | 124 |

Judged from the code and tests at commit `2f6274c485ec86e514899f029856e7138e2ab13e` (23 October 2026). Field proof register: 7 rows; 0 passed, 0 failed, 7 not run.

## Core

### The planning loop

#### EASEL-001 — Setup, roles and membership

Core · published · **partial** · Cites BASE-SIGNIN-001, BASE-ROLE-001

**Requirement.** Finance configures the planning company, its calendar, departments and planning membership. [Detailed semantics](docs/planning-semantics.md#easel-001).

**Acceptance.**
1. Finance saves and reads back the company name, reporting currency, fiscal-year start and first plan month for a twelve-month plan.
2. Shared and ordinary departments and revenue, cost-of-sales and operating-expense lines retain their payroll classification.
3. The planning membership distinguishes company finance, contributors assigned to named departments and viewers.
4. A signed-in person without active planning membership receives no plan data.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 2 audited outcomes. Complete assertion mapping remains owed for point 1: Finance saves; point 1: reads back the company name; point 1: fiscal-year start; point 1: first plan month for a twelve-month plan; point 2: Shared; point 2: ordinary departments; point 2: revenue; point 2: cost-of-sales; point 2: operating-expense lines retain their payroll classification; point 3: The planning membership distinguishes company finance; point 3: viewers; point 4: A signed-in person without active planning membership receives no plan data. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-002 — Actuals preview that writes nothing

Core · published · **partial** · Cites BASE-INPUT-003

**Requirement.** Finance previews an actuals CSV with explicit column, sign and date choices before accepting it. [Detailed semantics](docs/planning-semantics.md#easel-002).

**Acceptance.**
1. The preview shows covered months, per-account totals and sign checks, and department totals.
2. Malformed dates, malformed amounts, missing accounts, simultaneous debit and credit, repeated lines and already-accepted rows each appear as rejected rows with line number and reason.
3. The preview creates no actuals, journal jobs or other stored changes.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 4 audited outcomes. Complete assertion mapping remains owed for point 1: per-account totals; point 1: and department totals; point 2: Malformed dates; point 2: malformed amounts; point 2: missing accounts; point 2: simultaneous debit; point 2: credit; point 2: already-accepted rows each appear as rejected rows with line number; point 2: reason; point 3: journal jobs or other stored changes. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-003 — Mapped, reconciled actuals acceptance

Core · published · **partial** · Cites BASE-INPUT-003

**Requirement.** Finance accepts only the reviewed, fully mapped actuals file and reads its complete monthly classification reconciliation. [Detailed semantics](docs/planning-semantics.md#easel-003).

**Acceptance.**
1. Acceptance requires every account to map to a planning line, cash or an explicit exclusion, every department to map, and the reviewed fingerprint still to match.
2. Rejected rows remain excluded only after finance confirms them.
3. The journal retains the exact original bytes of the accepted file.
4. For every month, imported amounts equal mapped plus excluded plus cash plus unmapped amounts.
5. The reconciliation lists the unmapped accounts.

**Evidence.** `tests/easel.test.mjs`; `tests/review-fixes.test.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Acceptance requires every account to map to a planning line; point 1: cash or an explicit exclusion; point 1: every department to map; point 1: and the reviewed fingerprint still to match; point 2: Rejected rows remain excluded only after finance confirms them; point 3: The journal retains the exact original bytes of the accepted file; point 4: For every month; point 4: imported amounts equal mapped plus excluded plus cash plus unmapped amounts; point 5: The reconciliation lists the unmapped accounts. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-004 — Exact undo of an actuals import

Core · published · **partial** · Cites BASE-INPUT-003

**Requirement.** Finance reverses an accepted actuals import without removing unrelated actuals. [Detailed semantics](docs/planning-semantics.md#easel-004).

**Acceptance.**
1. Undo removes exactly the rows written by the selected import and keeps unrelated rows.
2. An import used by a closed forecast month cannot be undone.
3. A correcting file can instead be reviewed and imported.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 2 audited outcomes. Complete assertion mapping remains owed for point 2: An import used by a closed forecast month cannot be undone; point 3: A correcting file can instead be reviewed; point 3: imported. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-005 — Labeled opening cash and explicit cash timing

Core · published · **partial** · Rules D-1

**Requirement.** Each scenario's opening cash is either an estimate the person enters or the balance imported from accepted rows mapped to the cash balance before the first plan month, and every cash figure says which. Collections and payments follow explicit lags (months) plus opening receivables and payables; payroll is paid in its month. Each month's cash shows its arithmetic. [Detailed semantics](docs/planning-semantics.md#easel-005).

**Acceptance.**
1. Each scenario's opening cash is either an estimate the person enters or the balance imported from accepted rows mapped to the cash balance before the first plan month, and every cash figure says which.
2. Collections and payments follow explicit lags (months) plus opening receivables and payables; payroll is paid in its month.
3. Each month's cash shows its arithmetic.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 3 audited outcomes. Complete assertion mapping remains owed for point 2: payments follow explicit lags (months) plus opening receivables; point 2: payables; point 2: payroll is paid in its month; point 3: Each month's cash shows its arithmetic. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-006 — Exact revenue drivers with traces

Core · published · **partial** · Rules D-1

**Requirement.** Volume and customer drivers produce reproducible revenue cells with their arithmetic. [Detailed semantics](docs/planning-semantics.md#easel-006).

**Acceptance.**
1. Volume times rate includes monthly growth.
2. Customer revenue includes churn, new customers per month and customers per hire in a named department, using the recorded hiring ramp.
3. Every revenue cell carries its arithmetic trace.
4. Repeated calculation of identical inputs produces identical cells.

**Evidence.** `tests/easel.test.mjs`; `tests/totals.test.mjs`
**Gap.** Carried evidence establishes 1 audited outcomes. Complete assertion mapping remains owed for point 1: Volume times rate includes monthly growth; point 2: Customer revenue includes churn; point 2: new customers per month; point 2: customers per hire in a named department; point 2: using the recorded hiring ramp; point 3: Every revenue cell carries its arithmetic trace. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-007 — Position costs and restricted pay detail

Core · published · **partial** · Rules D-1

**Requirement.** Named and planned positions contribute the salary schedule while the separate Pay detail grant controls position visibility. [Detailed semantics](docs/planning-semantics.md#easel-007).

**Acceptance.**
1. From the entered start through end month, salary divided by twelve plus entered on-costs equals each position's monthly cost.
2. Owner-granted Pay detail exposes all departments to finance and only assigned departments to contributors.
3. Viewers and other departments retain aggregate amounts without individual position inputs, salaries or restricted source detail.
4. A contributor cannot change another department's inputs through any planning door.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 2 audited outcomes. Complete assertion mapping remains owed for point 2: Owner-granted Pay detail exposes all departments to finance; point 2: only assigned departments to contributors; point 3: Viewers; point 3: other departments retain aggregate amounts without individual position inputs; point 3: salaries or restricted source detail; point 4: A contributor cannot change another department's inputs through any planning door. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-008 — Expenses, schedules and visible allocations

Core · published · **partial** · Rules D-1

**Requirement.** Expenses and imported schedules feed department totals, with source-preserving shared-cost allocations. [Detailed semantics](docs/planning-semantics.md#easel-008).

**Acceptance.**
1. Recurring expenses, one-off expenses and monthly schedules post to their entered line and department.
2. Headcount and fixed-share allocation rules distribute shared costs and identify the rule on each allocated amount.
3. Fixed shares total exactly one hundred percent, and allocation preserves the original line total.
4. Self, chained and unshared allocations are refused.
5. Unknown lines or departments and deletion of an in-use line or department are refused.

**Evidence.** `tests/easel.test.mjs`; `tests/totals.test.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Recurring expenses; point 1: one-off expenses; point 1: monthly schedules post to their entered line; point 1: department; point 2: Headcount; point 2: fixed-share allocation rules distribute shared costs; point 2: identify the rule on each allocated amount; point 3: Fixed shares total exactly one hundred percent; point 3: and allocation preserves the original line total; point 4: Self; point 4: chained; point 4: unshared allocations are refused; point 5: Unknown lines or departments; point 5: deletion of an in-use line or department are refused. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-009 — Department submissions

Core · published · **partial**

**Requirement.** Finance requests submissions from departments. A contributor revises only their own department's budget inputs while its submission is requested or returned, comments on their own department, and submits; a submitted department is locked until finance returns it with a reason. The full request/submit/return history is kept. [Detailed semantics](docs/planning-semantics.md#easel-009).

**Acceptance.**
1. Finance requests submissions from departments.
2. A contributor revises only their own department's budget inputs while its submission is requested or returned, comments on their own department, and submits
3. A submitted department is locked until finance returns it with a reason.
4. The full request/submit/return history is kept.

**Evidence.** `tests/easel.test.mjs`; `tests/review-fixes.test.mjs`
**Gap.** Carried evidence establishes 1 audited outcomes. Complete assertion mapping remains owed for point 1: Finance requests submissions from departments; point 2: A contributor revises only their own department's budget inputs while its submission is requested or returned; point 2: comments on their own department; point 2: and submits; point 3: A submitted department is locked until finance returns it with a reason. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-010 — Exact-revision budget approval

Core · published · **partial** · Rules D-2, D-1

**Requirement.** The reviewed budget becomes a frozen planning decision from which the forecast opens. [Detailed semantics](docs/planning-semantics.md#easel-010).

**Acceptance.**
1. Budget approval requires the exact reviewed revision and every requested department to be submitted.
2. The snapshot contains inputs, outputs, approver, time, revision, submissions and digest.
3. The approved snapshot cannot be changed or deleted.
4. The forecast opens with the approved budget's arithmetic.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 5 audited outcomes. Complete assertion mapping remains owed for point 1: Budget approval requires the exact reviewed revision; point 1: every requested department to be submitted; point 2: The snapshot contains inputs; point 2: outputs; point 2: time; point 2: submissions. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-011 — Scenario branch and comparison

Core · published · **partial**

**Requirement.** Finance branches plans and compares their assumptions and results. [Detailed semantics](docs/planning-semantics.md#easel-011).

**Acceptance.**
1. A downside branch can delay hiring or change churn without changing its source.
2. The comparison shows monthly profit and closing cash side by side.
3. Every changed assumption and every moved cell is listed.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 2 audited outcomes. Complete assertion mapping remains owed for point 1: A downside branch can delay hiring or change churn without changing its source; point 3: Every changed assumption; point 3: every moved cell is listed. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-012 — Proposals promoted at exact revisions

Core · published · **partial**

**Requirement.** A proposal carries a working plan's reviewed revision into exact-revision promotion. [Detailed semantics](docs/planning-semantics.md#easel-012).

**Acceptance.**
1. A new proposal copies its source and binds that source revision.
2. Contributors change only assigned departments; finance can prepare changes across departments.
3. Promotion requires the reviewed proposal revision and the unchanged bound target revision.
4. A stale proposal or target changes nothing.
5. Successful promotion records the target revision before and after.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 1 audited outcomes. Complete assertion mapping remains owed for point 1: A new proposal copies its source; point 1: binds that source revision; point 2: Contributors change only assigned departments; point 2: finance can prepare changes across departments; point 3: Promotion requires the reviewed proposal revision; point 3: the unchanged bound target revision; point 4: A stale proposal or target changes nothing. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-013 — Month close and source-backed variance

Core · published · **partial** · Rules D-2

**Requirement.** Finance closes the next month on the forecast once accepted actuals cover it. The forecast as it stood is kept as an immutable snapshot first; closed months then use actuals. For a closed month, each line and department shows actual against the approved budget and the kept forecast, with the accepted rows behind it, the budget sources, and a draft that marks any timing explanation as an unconfirmed hypothesis. Finance or the department's contributor writes and confirms the business explanation. [Detailed semantics](docs/planning-semantics.md#easel-013).

**Acceptance.**
1. Finance closes the next month on the forecast once accepted actuals cover it.
2. The forecast as it stood is kept as an immutable snapshot first; closed months then use actuals.
3. For a closed month, each line and department shows actual against the approved budget and the kept forecast, with the accepted rows behind it, the budget sources, and a draft that marks any timing explanation as an unconfirmed hypothesis.
4. Finance or the department's contributor writes and confirms the business explanation.

**Evidence.** `tests/easel.test.mjs`; `tests/browser-journey.mjs`
**Gap.** Carried evidence establishes 2 audited outcomes. Complete assertion mapping remains owed for point 2: The forecast as it stood is kept as an immutable snapshot first; point 2: closed months then use actuals; point 3: For a closed month; point 3: each line; point 3: department shows actual against the approved budget; point 3: the kept forecast; point 3: with the accepted rows behind it; point 3: the budget sources; point 4: Finance or the department's contributor writes; point 4: confirms the business explanation. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-014 — Published review pack with decisions

Core · published · **partial** · Rules D-2

**Requirement.** Finance publishes a closed-month review pack binding numbers, explanations and decisions. [Detailed semantics](docs/planning-semantics.md#easel-014).

**Acceptance.**
1. Publication captures numbers, budget and forecast revisions, source files and their digests, explanations, decisions and actions.
2. Every member, including a viewer, downloads the published HTML and CSV.
3. Published outputs contain no individual pay detail.
4. Recording action progress leaves the published pack unchanged.

**Evidence.** `tests/easel.test.mjs`
**Gap.** Carried evidence establishes 1 audited outcomes. Complete assertion mapping remains owed for point 1: Publication captures numbers; point 1: budget; point 1: forecast revisions; point 1: source files; point 1: their digests; point 1: explanations; point 1: decisions; point 1: actions; point 2: Every member; point 2: including a viewer; point 2: downloads the published HTML; point 2: CSV; point 3: Published outputs contain no individual pay detail. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-015 — Excel workbook move-in with provenance

Core · published · **partial** · Cites BASE-INPUT-003 · Rules D-1

**Requirement.** Finance imports cached Excel planning cells as a separate scenario with cell provenance. [Detailed semantics](docs/planning-semantics.md#easel-015).

**Acceptance.**
1. Line, Department and month columns are read from an Excel worksheet, using cached values and visibly rounded cents.
2. Every value retains sheet, row, cell address and formula text as provenance.
3. Total rows are skipped, and every planning line and department must match or be mapped.
4. Acceptance stages a separate scenario through the import journal.
5. Undo removes imported rows while retaining subsequently edited rows and their dependencies.

**Evidence.** `tests/easel.test.mjs`; `tests/workbook-undo.test.mjs`
**Gap.** Carried evidence establishes 2 audited outcomes. Complete assertion mapping remains owed for point 1: Line; point 1: Department; point 1: month columns are read from an Excel worksheet; point 1: using cached values; point 1: visibly rounded cents; point 2: Every value retains sheet; point 2: row; point 3: Total rows are skipped; point 3: and every planning line; point 3: department must match or be mapped; point 4: Acceptance stages a separate scenario through the import journal; point 5: Undo removes imported rows while retaining subsequently edited rows; point 5: their dependencies. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Portability and runtime

#### EASEL-016 — Complete export and clean restore

Core · published · **partial** · Cites BASE-DATA-001 · Rules D-2

**Requirement.** The Base export and restore journey preserves Easel's complete planning loop. [Detailed semantics](docs/planning-semantics.md#easel-016).

**Acceptance.**
1. After export and clean restore, the same model, actuals, journal originals, approvals, kept forecasts, packs and activity are present.
2. The restored installation shows identical scenario outputs and pack downloads and re-exports identical planning rows.
3. A non-empty destination and a corrupt archive are refused without changing the destination.

**Evidence.** `tests/browser.mjs`; `tests/review-fixes.test.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: After export; point 1: clean restore; point 1: the same model; point 1: actuals; point 1: journal originals; point 1: approvals; point 1: kept forecasts; point 1: packs; point 1: activity are present; point 2: The restored installation shows identical scenario outputs; point 2: pack downloads; point 2: re-exports identical planning rows; point 3: A non-empty destination; point 3: a corrupt archive are refused without changing the destination. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### EASEL-017 — Owned runtime on Base

Core · published · **partial** · Cites BASE-INSTALL-001, BASE-OPS-002 · Register R-1, R-2

**Requirement.** Easel's Base runtime presents its own theme, self-hosted IBM Plex Sans and planning personas. [Detailed semantics](docs/planning-semantics.md#easel-017).

**Acceptance.**
1. The installer and sign-in pages use the Easel theme and self-hosted IBM Plex Sans.
2. Finance, sales, engineering and board development personas complete their corresponding planning jobs.
3. A production build refuses the development identity layer.

**Evidence.** `tests/browser.mjs`; `tests/approval-chains-browser.mjs`; `.github/workflows/verify.yml`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: The installer; point 1: sign-in pages use the Easel theme; point 1: self-hosted IBM Plex Sans; point 2: Finance; point 2: sales; point 2: engineering; point 2: board development personas complete their corresponding planning jobs; point 3: A production build refuses the development identity layer. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Connected actuals

#### CONNECT-001 — QuickBooks Online actuals connector

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004

**Requirement.** Finance connects QuickBooks Online through Intuit OAuth 2.0 (accounting scope, read-only). Easel pulls the chart of accounts, classes, locations, departments, customers and vendors, and general-ledger detail by month for the profit-and-loss and balance-sheet accounts. The first connection backfills history: finance chooses 12 to 36 closed months (24 by default), and each backfilled month lands as its own reviewed batch with its own trial-balance reconciliation, so prior-year actuals are there to plan from and to report against. Each pull is previewed as a reviewed batch: rows by month, new or changed accounts and dimensions, and anything unmapped. It lands through the import journal with the provider's transaction IDs, so a re-pull of the same month is idempotent and a provider-side edit shows as a change rather than a duplicate. Monthly totals reconcile to the QuickBooks trial balance for the same period, and the difference is shown when they do not. The connector also satisfies mapping, drill-through, custody and balance-opening duties in CONNECT-006, CONNECT-008, CONNECT-010 and CONNECT-007 on its own source data. [Detailed semantics](docs/planning-semantics.md#connect-001).

**Acceptance.**
1. Through the HTTP API against a recorded QuickBooks Online sandbox company (a fake only at the Intuit edge) holding 24 closed months, connect and see all 24 months backfilled and accepted, each with a reconciled trial balance
2. Then pull two current months, map, accept, edit one transaction in the fake, pull again and see one changed row, no duplicates, and a reconciled trial balance
3. One recorded run against Intuit's live sandbox.
4. CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically
5. A new out-of-range or ambiguous account blocks only its dependent conclusions until mapped
6. Source account types and dimensions remain available to the resolver.
7. CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL
8. A viewer reads amounts without restricted source rows.

**Evidence.** `tests/qbo.test.mjs`; `tests/mapping-rules.test.mjs`; `tests/connectors-browser.mjs`; `tests/qbo-live.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Through the HTTP API against a recorded QuickBooks Online sandbox company (a fake only at the Intuit edge) holding 24 closed months; point 1: connect; point 1: see all 24 months backfilled; point 1: accepted; point 1: each with a reconciled trial balance; point 2: Then pull two current months; point 2: map; point 2: accept; point 2: edit one transaction in the fake; point 2: pull again; point 2: see one changed row; point 2: no duplicates; point 2: and a reconciled trial balance; point 3: One recorded run against Intuit's live sandbox; point 4: CONNECT-006 on initial backfill; point 4: a later refresh: a new in-range account is mapped; point 4: listed automatically; point 5: A new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; point 6: Source account types; point 6: dimensions remain available to the resolver; point 7: CONNECT-008 in the browser at 1440/390: open a variance cell; point 7: read all its accepted rows; point 7: follow a row link to this provider fake's transaction URL; point 8: A viewer reads amounts without restricted source rows. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CONNECT-002 — Xero actuals connector

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004 · Register R-5

**Requirement.** Finance connects Xero through OAuth 2.0 (read-only accounting scopes). Easel pulls accounts, both tracking categories (mapped to departments or other dimensions under `MODEL-003`), contacts and journals by month, with the same history backfill, preview, idempotent re-pull, change detection and trial-balance reconciliation as `CONNECT-001`. The connector also satisfies mapping, drill-through, custody and balance-opening duties in CONNECT-006, CONNECT-008, CONNECT-010 and CONNECT-007 on its own source data. [Detailed semantics](docs/planning-semantics.md#connect-002).

**Acceptance.**
1. The `CONNECT-001` journey, including the 24-month backfill, against a recorded Xero demo company, including two tracking categories mapped to two dimensions
2. CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically
3. A new out-of-range or ambiguous account blocks only its dependent conclusions until mapped
4. Source account types and dimensions remain available to the resolver.
5. CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL
6. A viewer reads amounts without restricted source rows.

**Evidence.** `tests/xero.test.mjs`; `tests/mapping-rules.test.mjs`; `tests/connectors-browser.mjs`
**Gap.** Reviewed Xero pulls and both tracking dimensions are delivered. Full inherited source reconciliation, refresh and downstream-freshness proof remains incomplete; live tenant proof is R-5.

#### CONNECT-003 — NetSuite actuals connector

Core · target · **missing** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004

**Requirement.** Finance connects NetSuite through token-based authentication or OAuth 2.0 with a read-only role. Easel pulls accounts, subsidiaries, departments, classes and locations and posted transaction lines by period through SuiteQL, with the same history backfill, preview, idempotent re-pull, change detection and trial-balance reconciliation. Subsidiaries map to entities under `ENTITY-001`. The connector also satisfies mapping, drill-through, custody and balance-opening duties in CONNECT-006, CONNECT-008, CONNECT-010 and CONNECT-007 on its own source data. Its provider entity mapping satisfies ENTITY-001, including source partitions, currencies and current entity/department grants. [Detailed semantics](docs/planning-semantics.md#connect-003).

**Acceptance.**
1. The `CONNECT-001` journey, including the 24-month backfill, against a recorded NetSuite SuiteQL fake with two subsidiaries
2. One recorded run against a NetSuite sandbox account.
3. CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically
4. A new out-of-range or ambiguous account blocks only its dependent conclusions until mapped
5. Source account types and dimensions remain available to the resolver.
6. CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL
7. A viewer reads amounts without restricted source rows.

**Evidence.** None.
**Gap.** No NetSuite SuiteQL connector or subsidiary mapping

#### CONNECT-004 — Pantry actuals connector

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004

**Requirement.** A buyer on [Pantry](https://github.com/just-every/run-pantry) connects it through Pantry's API with a scoped read-only token, and gets the same history backfill, chart, dimension and journal pull, idempotency, change detection and reconciliation as `CONNECT-001`. The connector also satisfies mapping, drill-through, custody and balance-opening duties in CONNECT-006, CONNECT-008, CONNECT-010 and CONNECT-007 on its own source data. [Detailed semantics](docs/planning-semantics.md#connect-004).

**Acceptance.**
1. Two local installations (Pantry and Easel) where Easel backfills every closed month Pantry holds, pulls a current month, a Pantry correction shows as a changed row on the next pull, and trial balances agree.
2. CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically
3. A new out-of-range or ambiguous account blocks only its dependent conclusions until mapped
4. Source account types and dimensions remain available to the resolver.
5. CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL
6. A viewer reads amounts without restricted source rows.

**Evidence.** `tests/pantry-live.mjs`; `tests/mapping-rules.test.mjs`; `tests/pantry-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Two local installations (Pantry; point 1: Easel) where Easel backfills every closed month Pantry holds; point 1: pulls a current month; point 1: a Pantry correction shows as a changed row on the next pull; point 1: and trial balances agree; point 2: CONNECT-006 on initial backfill; point 2: a later refresh: a new in-range account is mapped; point 2: listed automatically; point 3: A new out-of-range or ambiguous account blocks only its dependent conclusions until mapped; point 4: Source account types; point 4: dimensions remain available to the resolver; point 5: CONNECT-008 in the browser at 1440/390: open a variance cell; point 5: read all its accepted rows; point 5: follow a row link to this provider fake's transaction URL; point 6: A viewer reads amounts without restricted source rows. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CONNECT-011 — Sage Intacct actuals connector

Core · target · **missing** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004

**Requirement.** Finance connects Sage Intacct with a Web Services sender ID and a read-only web-services user, or through the Sage Intacct REST API with OAuth 2.0. Easel pulls the chart of accounts, entities (a multi-entity shared company maps its entities under `ENTITY-001`), the standard dimensions (location, department, class, project, customer and vendor), any user-defined dimensions, and general-ledger detail by period. Location and department map to Easel dimension members under `CONNECT-006` and `MODEL-003`. It has the same history backfill, preview, idempotent re-pull by the provider's record number, change detection and trial-balance reconciliation as `CONNECT-001`, and drill-through links to the Intacct entry. The connector also satisfies mapping, drill-through, custody and balance-opening duties in CONNECT-006, CONNECT-008, CONNECT-010 and CONNECT-007 on its own source data. Its provider entity mapping satisfies ENTITY-001, including source partitions, currencies and current entity/department grants. [Detailed semantics](docs/planning-semantics.md#connect-011).

**Acceptance.**
1. The `CONNECT-001` journey, including the 24-month backfill, against a recorded Sage Intacct fake of Web Services or REST general-ledger detail with two entities, two locations and three departments, where locations and departments map to two Easel dimensions and each entity's trial balance reconciles
2. A variance cell's row links to the Intacct fake's entry URL
3. One recorded run against a Sage Intacct sandbox company.
4. CONNECT-006 on initial backfill and a later refresh: a new in-range account is mapped and listed automatically
5. A new out-of-range or ambiguous account blocks only its dependent conclusions until mapped
6. Source account types and dimensions remain available to the resolver.
7. CONNECT-008 in the browser at 1440/390: open a variance cell, read all its accepted rows and follow a row link to this provider fake's transaction URL
8. A viewer reads amounts without restricted source rows.

**Evidence.** None.
**Gap.** No Sage Intacct connector, dimension mapping or entity mapping

#### CONNECT-005 — Scheduled refresh with visible freshness

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004 · Rules D-2

**Requirement.** Finance schedules source refreshes and sees freshness and errors wherever those sources inform a planning conclusion; closed figures change only through an explicit restatement decision. [Detailed semantics](docs/planning-semantics.md#connect-005).

**Acceptance.**
1. Hourly, nightly and weekly schedules and on-demand refresh read data and metadata together in the saved company time zone.
2. Every consuming view shows the last successful source refresh and marks data older than its schedule as stale.
3. A failed refresh retains previous data, displays its error and notifies finance once under CYCLE-003.
4. A closed-month source change opens a notice naming affected lines, packs and kept forecasts instead of changing a pack.
5. Finance accepts or rejects the restatement.
6. Payroll and HR refresh retain PEOPLE-006 dates, backfills, attrition and history and ERASE-001 identity erasure.

**Evidence.** `tests/gauge-utilization.test.mjs`; `tests/gauge-schedule-browser.mjs`
**Gap.** Gauge month observations and health overlays are delivered. Closed-month restatement review and affected-line/pack/forecast notices, non-Gauge/payroll refresh and qualified Base resolved-address/pinned-egress remain incomplete.

#### CONNECT-006 — Mapping rules that survive refresh

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004 · Rules D-2

**Requirement.** Account and dimension rules survive refresh and resolve only the conclusions their inputs support. [Detailed semantics](docs/planning-semantics.md#connect-006).

**Acceptance.**
1. Single-account, numeric-range, prefix and source-account-type rules map to a planning line, cash, a balance-sheet line or exclusion.
2. Department, class and tracking-option rules map source dimensions to model members.
3. A newly covered account is automatically mapped and listed.
4. An uncovered or ambiguous account blocks only dependent conclusions until resolved and is never counted as zero.
5. Existing completed-period reviews and frozen values remain available after a rule change.

**Evidence.** `src/easel/account-rules.ts`; `src/easel/actuals-read.ts`; `tests/mapping-rules.test.mjs`; `tests/mapping-rules-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Single-account; point 1: numeric-range; point 1: prefix; point 1: source-account-type rules map to a planning line; point 1: cash; point 1: a balance-sheet line or exclusion; point 2: Department; point 2: class; point 2: tracking-option rules map source dimensions to model members; point 3: A newly covered account is automatically mapped; point 3: listed; point 4: An uncovered or ambiguous account blocks only dependent conclusions until resolved; point 4: is never counted as zero; point 5: Existing completed-period reviews; point 5: frozen values remain available after a rule change. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CONNECT-007 — Balance-sheet actuals and the trial balance

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004

**Requirement.** Accepted ledger balances open the forecast from the last closed month, with complete mapping and visible reconciliation. [Detailed semantics](docs/planning-semantics.md#connect-007).

**Acceptance.**
1. Accepted cash, receivables, prepaid, fixed assets, payables, accrued liabilities, deferred revenue, debt and equity contribute to a zero-sum month-end trial balance.
2. Closing that ledger month opens the forecast balance sheet from accepted balances instead of the corresponding estimates.
3. New balance-sheet accounts use CONNECT-006 rules; unresolved balances block dependent conclusions until mapped.
4. The three statements reconcile and show traced differences without balancing plugs.

**Evidence.** `src/easel/balance-actuals.ts`; `src/easel/ledger-statements.ts`; `src/easel/ledger-allocation.ts`; `tests/mapping-rules.test.mjs`; `tests/balance-actuals-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Accepted cash; point 1: receivables; point 1: prepaid; point 1: fixed assets; point 1: payables; point 1: accrued liabilities; point 1: deferred revenue; point 1: debt; point 1: equity contribute to a zero-sum month-end trial balance; point 2: Closing that ledger month opens the forecast balance sheet from accepted balances instead of the corresponding estimates; point 3: New balance-sheet accounts use CONNECT-006 rules; point 3: unresolved balances block dependent conclusions until mapped; point 4: The three statements reconcile; point 4: show traced differences without balancing plugs. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CONNECT-012 — Source-attributed opening schedules

Core · target · **partial** · From CONNECT-007 · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004 · Rules D-1, D-2

**Requirement.** Finance attributes imported opening balances to the operating and asset schedules that consume them. [Detailed semantics](docs/planning-semantics.md#connect-007).

**Acceptance.**
1. Explicit prepaid, accrued payroll/bonus and deferred-revenue origin allocations replace estimated amortization, settlement and recognition with source attribution.
2. An imported net fixed-asset balance and entered remaining life produce straight-line depreciation from the following month; disposal removes remaining book value and includes proceeds.
3. Allocations equal the accepted target balance to the cent.
4. Statements and formula Excel reconcile to these source-attributed schedules.
5. Frozen captures remain unchanged, and viewers receive no allocation inputs or restricted source detail.

**Evidence.** `src/easel/balance-actuals.ts`; `src/easel/ledger-statements.ts`; `src/easel/ledger-allocation.ts`; `tests/mapping-rules.test.mjs`; `tests/balance-actuals-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Explicit prepaid; point 1: accrued payroll/bonus; point 1: deferred-revenue origin allocations replace estimated amortization; point 1: settlement; point 1: recognition with source attribution; point 2: An imported net fixed-asset balance; point 2: entered remaining life produce straight-line depreciation from the following month; point 2: disposal removes remaining book value; point 2: includes proceeds; point 3: Allocations equal the accepted target balance to the cent; point 4: Statements; point 4: formula Excel reconcile to these source-attributed schedules; point 5: Frozen captures remain unchanged; point 5: and viewers receive no allocation inputs or restricted source detail. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CONNECT-008 — Drill-through to the ledger transaction

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004

**Requirement.** Actual cells expose every accepted source row the reader is entitled to inspect, including a connected provider's transaction link. [Detailed semantics](docs/planning-semantics.md#connect-008).

**Acceptance.**
1. At desktop and phone widths, a variance cell lists all accepted rows behind it without an evidence sample cap.
2. A connected row links to the corresponding QuickBooks Online, Xero, NetSuite, Sage Intacct or Pantry transaction.
3. A viewer receives aggregate amounts without another department's source rows.

**Evidence.** `src/easel/actuals-read.ts`; `src/easel/review.ts`; `tests/drillthrough.test.mjs`; `tests/mapping-rules-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: At desktop; point 1: phone widths; point 1: a variance cell lists all accepted rows behind it without an evidence sample cap; point 2: A connected row links to the corresponding QuickBooks Online; point 2: Xero; point 2: NetSuite; point 2: Sage Intacct or Pantry transaction; point 3: A viewer receives aggregate amounts without another department's source rows. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CONNECT-009 — Bank balances for current cash

Core · target · **partial** · Cites BASE-INPUT-001, BASE-SECRET-001, BASE-DATA-004

**Requirement.** Finance can connect bank accounts read-only through Plaid (balances and transactions). Current cash position and daily balance movement then feed the cash alerts and the 13-week view between ledger closes, labeled as bank balances rather than ledger actuals. Easel never initiates a payment or transfer. Under RL-102, only current company-wide finance authority and its explicit scoped finance reads see bank observations, bank-basis cash and bank alerts; other readers receive planned cash without bank data. Credential administration remains native finance-only, and bank outputs remain aggregate-only. [Detailed semantics](docs/planning-semantics.md#connect-009).

**Acceptance.**
1. A Plaid sandbox fake supplies two accounts
2. The 13-week view and a cash alert use the bank balance and label it as such; no payment route exists.
3. Current finance-only reads and scoped reads obey RL-102 without exposing bank data to other readers.
4. Bank credentials remain sealed, archive-excluded and outside the aggregate output; bank access grants no payroll or other private-data authority.

**Evidence.** `src/easel/plaid-provider.ts`; `src/easel/plaid-connection.ts`; `tests/plaid-cash.test.mjs`; `tests/plaid-cash-browser.mjs`
**Gap.** Sealed Plaid reads and aggregate weekly cash/alerts are delivered. RL-102 settles the audience; exact-head acceptance of the complete adopted audience and all source-failure outcomes remains to be rejudged without promotion in this rewrite.

#### CONNECT-010 — Connection custody and status

Core · target · **partial** · Cites BASE-SECRET-001, BASE-AUDIT-001, BASE-INPUT-001, BASE-DATA-004 · Rules D-2

**Requirement.** Connections retain sealed provider custody and an honest source-status and disconnect outcome; finance administers the credential. [Detailed semantics](docs/planning-semantics.md#connect-010).

**Acceptance.**
1. Credentials are encrypted at rest, excluded from installation archives, masked by suffix and deleted locally on disconnect.
2. The source status includes scopes, owner, schedule, last refresh, row counts, errors and rate-limit state.
3. Native finance can connect, inspect, check and disconnect; contributors and API tokens cannot administer credentials.
4. Each administration action has an audit record.
5. Disconnect reports confirmed, refused, redirected and unreachable provider outcomes accurately and performs supported remote revocation.
6. An unsupported or unconfirmed revocation displays the exact remaining owner action without claiming success.
7. Local deletion on every provider outcome leaves imported values and frozen captures unchanged.
8. At desktop and phone widths, Gauge status, export exclusion, revoked-key refusal and the unreachable-provider warning are observable.

**Evidence.** `tests/gauge-utilization.test.mjs`; `tests/gauge-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Credentials are encrypted at rest; point 1: excluded from installation archives; point 1: masked by suffix; point 1: deleted locally on disconnect; point 2: The source status includes scopes; point 2: owner; point 2: schedule; point 2: last refresh; point 2: row counts; point 2: errors; point 2: rate-limit state; point 3: Native finance can connect; point 3: inspect; point 3: check; point 3: disconnect; point 3: contributors; point 3: API tokens cannot administer credentials; point 4: Each administration action has an audit record; point 5: Disconnect reports confirmed; point 5: refused; point 5: redirected; point 5: unreachable provider outcomes accurately; point 5: performs supported remote revocation; point 6: An unsupported or unconfirmed revocation displays the exact remaining owner action without claiming success; point 7: Local deletion on every provider outcome leaves imported values; point 7: frozen captures unchanged; point 8: At desktop; point 8: phone widths; point 8: Gauge status; point 8: export exclusion; point 8: revoked-key refusal; point 8: the unreachable-provider warning are observable. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Flexible model

#### MODEL-001 — Fiscal horizons and roll-ups

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-1, D-2

**Requirement.** Finance chooses the fiscal start and twelve-to-sixty-period planning horizon, with monthly, quarterly and annual views. [Detailed semantics](docs/planning-semantics.md#model-001).

**Acceptance.**
1. A thirty-six-month plan beginning in October has monthly, quarterly and annual totals agreeing to the cent.
2. Every fiscal start month and horizons from twelve to sixty periods are supported.
3. Budgets may cover one fiscal year or several, while frozen versions retain their captured horizon.

**Evidence.** `src/easel/fiscal-calendar.ts`; `src/easel/fiscal-summary.ts`; `tests/fiscal-calendar.test.mjs`; `tests/fiscal-calendar-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A thirty-six-month plan beginning in October has monthly; point 1: quarterly; point 1: annual totals agreeing to the cent; point 2: Every fiscal start month; point 2: horizons from twelve to sixty periods are supported; point 3: Budgets may cover one fiscal year or several; point 3: while frozen versions retain their captured horizon. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-010 — Retail accounting calendars

Core · target · **partial** · From MODEL-001 · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** Finance can choose a 4-4-5 or 5-4-4 calendar instead of calendar months. [Detailed semantics](docs/planning-semantics.md#model-001).

**Acceptance.**
1. Each quarter follows the selected four/four/five or five/four/four-week pattern, with consecutive accounting-period boundaries.
2. Every quarter equals its three periods and the year equals its four quarters to the cent.
3. Dated imports, service recognition, payroll and settlements follow the selected accounting boundaries without changing the Gregorian service and tax conventions documented for the calendar.

**Evidence.** `src/easel/fiscal-calendar.ts`; `src/easel/fiscal-summary.ts`; `tests/fiscal-calendar.test.mjs`; `tests/fiscal-calendar-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Each quarter follows the selected four/four/five or five/four/four-week pattern; point 1: with consecutive accounting-period boundaries; point 2: Every quarter equals its three periods; point 2: the year equals its four quarters to the cent; point 3: Dated imports; point 3: service recognition; point 3: payroll; point 3: settlements follow the selected accounting boundaries without changing the Gregorian service; point 3: tax conventions documented for the calendar. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-002 — A rolling forecast that extends itself

Core · target · **done** · Cites BASE-INPUT-001 · Rules D-2

**Requirement.** Finance sets a rolling window (for example always 18 months ahead). Closing a month extends the forecast by one month and seeds the new month from its drivers, with the kept forecast snapshot taken first. Budgets keep their fixed fiscal horizon. [Detailed semantics](docs/planning-semantics.md#model-002).

**Acceptance.**
1. With an 18-month window, close two months in the API journey and see the forecast end move by two months, the new months calculated from drivers, and both kept forecasts unchanged.

**Evidence.** `tests/rolling-forecast.test.mjs`
**Gap.** None.

#### MODEL-003 — Custom dimensions and hierarchies

Core · target · **partial** · Cites BASE-INPUT-001

**Requirement.** Finance defines hierarchical dimensions such as entity, region, product, customer segment, project, class and location, and cuts inputs, actuals and reports by them. [Detailed semantics](docs/planning-semantics.md#model-003).

**Acceptance.**
1. A two-level Region hierarchy rolls entered regional inputs into an unchanged line total.
2. A source provider class maps to Region; department, class and tracking-option rules resolve source members.
3. An unresolved member blocks dependent line/dimension cells while unrelated cells remain available, with no invented zero.
4. Custom dimension-member presets exist in every starter with grid/report parity at desktop and phone widths.
5. Dimension grid rows, paste, selection tools, splits, notes and undo obey the current member grants at both widths.

**Evidence.** `tests/dimensions.test.mjs`; `tests/dimensions-browser.mjs`; `tests/grid-browser.mjs`; `tests/starters.test.mjs`; `tests/starters-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A two-level Region hierarchy rolls entered regional inputs into an unchanged line total; point 2: A source provider class maps to Region; point 2: department; point 2: class; point 2: tracking-option rules resolve source members; point 3: An unresolved member blocks dependent line/dimension cells while unrelated cells remain available; point 3: with no invented zero; point 4: Custom dimension-member presets exist in every starter with grid/report parity at desktop; point 4: phone widths; point 5: Dimension grid rows; point 5: paste; point 5: selection tools; point 5: splits; point 5: notes; point 5: undo obey the current member grants at both widths. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-011 — Account hierarchies and dimension versions

Core · target · **partial** · From MODEL-003 · Cites BASE-INPUT-001 · Rules D-1, D-2

**Requirement.** Finance reads account subtotals and exact structure histories for dimension and hierarchy changes. [Detailed semantics](docs/planning-semantics.md#model-003).

**Acceptance.**
1. An Operating expense hierarchy containing Sales and marketing, Advertising and Events has monthly subtotals equal to its component lines.
2. Every custom-dimension or hierarchy change has an exact version, readable diff and moved-cell list.
3. Approved budgets, kept forecasts and published packs retain their captured definitions and arithmetic.

**Evidence.** `tests/dimensions.test.mjs`; `tests/dimensions-browser.mjs`; `tests/grid-browser.mjs`; `tests/starters.test.mjs`; `tests/starters-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: An Operating expense hierarchy containing Sales; point 1: marketing; point 1: Advertising; point 1: Events has monthly subtotals equal to its component lines; point 2: Every custom-dimension or hierarchy change has an exact version; point 2: readable diff; point 2: moved-cell list; point 3: Approved budgets; point 3: kept forecasts; point 3: published packs retain their captured definitions; point 3: arithmetic. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-004 — User-defined formulas and driver lines

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-1, D-2

**Requirement.** Finance defines driver formulas over named drivers, lines, dimensions, versions and time, with growth, lookups, conditions, arithmetic and dimension sums. [Detailed semantics](docs/planning-semantics.md#model-004).

**Acceptance.**
1. A tickets-per-customer times cost-per-ticket support formula with a regional lookup produces exact cells and traces.
2. Prior-period and offset references, including Actuals and other versions, and IF, MIN, MAX, ROUND and SUM retain their specified calculation semantics.
3. A circular formula is refused with its cycle named.
4. Formula-driven revenue works through the planning and proposal doors.
5. Grid formula cells display their traces and refuse typing.
6. Formula changes have exact structure versions, readable diffs and moved-cell lists; frozen definitions and arithmetic remain unchanged.

**Evidence.** `tests/revenue-drivers.test.mjs`; `tests/revenue-drivers-browser.mjs`; `tests/native-formulas-journey.mjs`
**Gap.** Carried evidence establishes 4 audited outcomes. Complete assertion mapping remains owed for point 2: Prior-period; point 2: offset references; point 2: including Actuals; point 2: other versions; point 2: and IF; point 2: MIN; point 2: MAX; point 2: ROUND; point 2: SUM retain their specified calculation semantics; point 3: A circular formula is refused with its cycle named; point 4: Formula-driven revenue works through the planning; point 4: proposal doors; point 6: Formula changes have exact structure versions; point 6: readable diffs; point 6: moved-cell lists; point 6: frozen definitions; point 6: arithmetic remain unchanged. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-005 — Versioned model structure

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-2

**Requirement.** A structure revision explains the definitions and cells changed while preserving the structure captured by approved and kept versions. [Detailed semantics](docs/planning-semantics.md#model-005).

**Acceptance.**
1. Changing rate or growth parameters, dimensions, lines, mappings and rules records exact definitions, field differences and every moved cell.
2. Approved budgets, kept forecasts, reforecasts and published packs retain both their bodies and digests after structure changes.
3. The structure history is append-only; filtered API, CSV, Excel and open exports obey their audience.
4. A failed write is atomic and a tool-originated write retains its attribution.
5. Workbook preview changes nothing; acceptance and exact undo add the corresponding structure versions.
6. At desktop and phone widths, Plan edits and Activity expose definitions, moved cells and filtered Excel without page overflow.

**Evidence.** `src/easel/structure-versions.ts`; `tests/structure-versions.test.mjs`; `tests/workbook-undo.test.mjs`; `tests/structure-versions-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Changing rate or growth parameters; point 1: dimensions; point 1: lines; point 1: mappings; point 1: rules records exact definitions; point 1: field differences; point 1: every moved cell; point 2: Approved budgets; point 2: kept forecasts; point 2: reforecasts; point 2: published packs retain both their bodies; point 2: digests after structure changes; point 3: The structure history is append-only; point 3: filtered API; point 3: CSV; point 3: Excel; point 3: open exports obey their audience; point 4: A failed write is atomic; point 4: a tool-originated write retains its attribution; point 5: Workbook preview changes nothing; point 5: acceptance; point 5: exact undo add the corresponding structure versions; point 6: At desktop; point 6: phone widths; point 6: Plan edits; point 6: Activity expose definitions; point 6: moved cells; point 6: filtered Excel without page overflow. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-006 — Starter models for US small businesses

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** Setup offers starter models that a buyer edits rather than builds from nothing: SaaS (ARR, churn, CAC, seats), professional services (billable headcount, utilization, rate), project or backlog businesses, and wholesale or ecommerce (units, price, COGS, inventory days). Each comes with its drivers, lines, dimensions, dashboards and cash timing, in USD. [Detailed semantics](docs/planning-semantics.md#model-006).

**Acceptance.**
1. In the browser at 1440, create a company from each starter (SaaS, professional services, project or backlog, and wholesale or ecommerce) and, for each, see a three-statement forecast, a dashboard and a cash view without entering a formula
2. The services starter's revenue traces to billable headcount × utilization × rate, the project starter's to milestones and backlog, and the wholesale starter's cash to inventory days.

**Evidence.** `src/easel/starter-models.ts`; `src/easel/commercial-costs.ts`; `tests/starters.test.mjs`; `tests/starters-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: In the browser at 1440, create a company from each starter (SaaS; point 1: professional services; point 1: project or backlog; point 1: and wholesale or ecommerce) and; point 1: for each; point 1: see a three-statement forecast; point 1: a dashboard; point 1: a cash view without entering a formula; point 2: The services starter's revenue traces to billable headcount × utilization × rate; point 2: the project starter's to milestones; point 2: backlog; point 2: and the wholesale starter's cash to inventory days. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-007 — Measured model recalculation

Core · target · **partial** · Cites BASE-INPUT-001

**Requirement.** A model with 2,000 input rows, five dimensions and a thirty-six-month horizon recalculates after an input edit in under two seconds at p95. [Detailed semantics](docs/planning-semantics.md#model-007).

**Acceptance.**
1. Fifty API edits at the declared fixture size meet the under-two-second p95 bar, including the save and fresh filtered recalculation.
2. The measured result includes exact structure-version effects rather than omitting them from timing.

**Evidence.** `tests/model-scale.mjs`; `tests/calculation-background.mjs`; `tests/calculation-browser.mjs`; `.github/workflows/model-recalculation.yml`
**Gap.** Carried evidence establishes 3 audited outcomes. Complete assertion mapping remains owed for point 2: The measured result includes exact structure-version effects rather than omitting them from timing. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-012 — Visible background calculations

Core · target · **done** · From MODEL-007 · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** Larger changes expose a background calculation instead of presenting stale cells as final. [Detailed semantics](docs/planning-semantics.md#model-007).

**Acceptance.**
1. A larger bulk import shows calculation state in the browser.
2. Affected cells remain visibly recalculating and have no stale-but-final amount.
3. An interrupted or paused import retains an inspectable job and remains unavailable until explicitly continued or undone.

**Evidence.** `tests/model-scale.mjs`; `tests/calculation-background.mjs`; `tests/calculation-browser.mjs`; `.github/workflows/model-recalculation.yml`
**Gap.** None.

#### MODEL-008 — Planning grid paste and selection edits

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** Finance and contributors enter authorized scenario cells by typing or pasting with an explicit preview. [Detailed semantics](docs/planning-semantics.md#model-008).

**Acceptance.**
1. At desktop and phone widths, a contributor in a requested budget submission pastes a three-by-twelve spreadsheet block and reads the entered values through the API.
2. Non-numeric or out-of-scope pasted cells are refused with their addresses; another department's cells remain unchanged.
3. An even spread of $120,000 over twelve months yields $10,000 each; a prior-year-shaped spread keeps the exact $120,000 total and source proportions.
4. A proportional $60,000 spread over $1,000, $2,000 and $3,000 yields $10,000, $20,000 and $30,000.
5. A ten-percent increase, a $500 decrease and copy-forward each yield the selected exact values.

**Evidence.** `src/easel/grid.ts`; `tests/grid.test.mjs`; `tests/grid-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: At desktop; point 1: phone widths; point 1: a contributor in a requested budget submission pastes a three-by-twelve spreadsheet block; point 1: reads the entered values through the API; point 2: Non-numeric or out-of-scope pasted cells are refused with their addresses; point 2: another department's cells remain unchanged; point 3: An even spread of $120,000 over twelve months yields $10,000 each; point 3: a prior-year-shaped spread keeps the exact $120,000 total; point 3: source proportions; point 4: A proportional $60,000 spread over $1,000, $2,000; point 4: $3,000 yields $10,000, $20,000; point 4: $30,000; point 5: A ten-percent increase; point 5: a $500 decrease; point 5: copy-forward each yield the selected exact values. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-013 — Planning grid detail and recovery

Core · target · **partial** · From MODEL-008 · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** Grid sub-rows and notes retain their source cell's visibility and revision while conflict handling and undo preserve exact edits. [Detailed semantics](docs/planning-semantics.md#model-008).

**Acceptance.**
1. Two named vendor sub-rows sum to their parent cell; a note is read back from the cell's revision and trace.
2. Other departments and viewers receive the parent total without sub-row detail.
3. A stale save changes nothing; undo restores exactly the cells changed by its save.
4. A calculated driver or formula cell refuses typing and shows its exact trace.
5. At phone width the line column stays pinned in an internally scrolling frame, with no page overflow.

**Evidence.** `src/easel/grid.ts`; `tests/grid.test.mjs`; `tests/grid-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Two named vendor sub-rows sum to their parent cell; point 1: a note is read back from the cell's revision; point 1: trace; point 2: Other departments; point 2: viewers receive the parent total without sub-row detail; point 3: A stale save changes nothing; point 3: undo restores exactly the cells changed by its save; point 4: A calculated driver or formula cell refuses typing; point 4: shows its exact trace; point 5: At phone width the line column stays pinned in an internally scrolling frame; point 5: with no page overflow. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MODEL-009 — Plans built from actuals history

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** Accepted actuals (from connectors or files) form an Actuals version that every plan can read. A plan line or driver can be defined from it at a time offset, for example the same month last year × 1.05 or the trailing three-month average, under the `MODEL-004` arithmetic and trace rules; each cell's trace names the actual cells it read. Finance can seed a new budget scenario from prior-year actuals by line and department in one step, with a growth percent per line, and the seeded inputs stay editable in the grid. Plan views and the grid can overlay actuals for closed and prior-year months beside the plan. A month with no accepted actuals is reported as missing, never read as zero. [Detailed semantics](docs/planning-semantics.md#model-009).

**Acceptance.**
1. accept 24 posted months and assert every same-month prior-year × 1.05 cell, every trailing-three average, one half-away division and every source citation; seed a genuine budget with per-line growth, read/edit its monthly inputs, refuse a stale save atomically, and name missing months rather than zero.
2. Accepted zero, consumed historical mapping/import blocking, existing target/source authority, unchanged source budgets and captured overlays/arithmetic after later historical corrections.
3. At 1440/390 create the forms, seed/edit/reload the grid, compare its current/prior actuals with the API and Overview, and select the alternative in Budget cycle.
4. Independently evaluate actual-history Excel formulas.
5. MODEL-004/MODEL-008 keep the further formula/grid obligations named above.

**Evidence.** `src/easel/history-schedules.ts`; `tests/history.test.mjs`; `tests/history-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: accept 24 posted months; point 1: assert every same-month prior-year × 1.05 cell; point 1: every trailing-three average; point 1: one half-away division; point 1: every source citation; point 1: seed a genuine budget with per-line growth; point 1: read/edit its monthly inputs; point 1: refuse a stale save atomically; point 1: and name missing months rather than zero; point 2: Accepted zero; point 2: consumed historical mapping/import blocking; point 2: existing target/source authority; point 2: unchanged source budgets; point 2: captured overlays/arithmetic after later historical corrections; point 3: At 1440/390 create the forms; point 3: seed/edit/reload the grid; point 3: compare its current/prior actuals with the API; point 3: Overview; point 3: and select the alternative in Budget cycle; point 4: Independently evaluate actual-history Excel formulas; point 5: MODEL-004/MODEL-008 keep the further formula/grid obligations named above. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Three statements and cash

#### FIN-001 — Linked P&L, balance sheet and cash flow

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** The forecast links profit and loss, balance sheet and direct and indirect cash through visible opening balances and movements. [Detailed semantics](docs/planning-semantics.md#fin-001).

**Acceptance.**
1. Across twenty-four months, assets equal liabilities plus equity in every month.
2. Cash-flow closing cash equals balance-sheet cash in every month.
3. Entered opening equity is identified as an estimate, and unresolved source or statement differences remain visible instead of being plugged.

**Evidence.** `src/easel/statements.ts`; `tests/statements.test.mjs`; `tests/statements-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Across twenty-four months; point 1: assets equal liabilities plus equity in every month; point 2: Cash-flow closing cash equals balance-sheet cash in every month; point 3: Entered opening equity is identified as an estimate; point 3: and unresolved source or statement differences remain visible instead of being plugged. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-002 — Receivables and deferred-revenue timing

Core · target · **partial** · Cites BASE-INPUT-001

**Requirement.** Finance plans receivable collections and deferred recognition with explicit days and curves. [Detailed semantics](docs/planning-semantics.md#fin-002).

**Acceptance.**
1. Forty-five-day DSO and collection curves date customer collections exactly.
2. Annual-upfront ratable revenue recognizes through deferred balances without inventing an immediate cash receipt.
3. Exact traces and direct and indirect statement identities reconcile over calendar-day and short-period boundaries.
4. Conflicting aggregate timing blocks instead of choosing an invented allocation.

**Evidence.** `tests/working-capital.test.mjs`; `tests/working-capital-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Forty-five-day DSO; point 1: collection curves date customer collections exactly; point 2: Annual-upfront ratable revenue recognizes through deferred balances without inventing an immediate cash receipt; point 3: Exact traces; point 3: direct; point 3: indirect statement identities reconcile over calendar-day; point 3: short-period boundaries; point 4: Conflicting aggregate timing blocks instead of choosing an invented allocation. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-008 — Vendor terms and prepaid schedules

Core · target · **partial** · From FIN-002 · Cites BASE-INPUT-001 · Rules D-1, D-2

**Requirement.** Finance plans operating payables and prepaid amortization as distinct recognition and settlement schedules. [Detailed semantics](docs/planning-semantics.md#fin-002).

**Acceptance.**
1. Thirty-day vendor terms date payments and operating payable balances exactly.
2. A $24,000 insurance prepayment amortizes $2,000 monthly until its remaining balance is zero.
3. Prior-horizon estimated openings, exact-cent remainders and statement identities reconcile without an invented source opening.
4. Native and proposal edits and formula Excel carry the same timing, current visibility and frozen arithmetic.

**Evidence.** `tests/working-capital.test.mjs`; `tests/working-capital-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Thirty-day vendor terms date payments; point 1: operating payable balances exactly; point 2: A $24,000 insurance prepayment amortizes $2,000 monthly until its remaining balance is zero; point 3: Prior-horizon estimated openings; point 3: exact-cent remainders; point 3: statement identities reconcile without an invented source opening; point 4: Native; point 4: proposal edits; point 4: formula Excel carry the same timing; point 4: current visibility; point 4: frozen arithmetic. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-009 — Payroll accrual and settlement schedules

Core · target · **partial** · From FIN-002 · Cites BASE-INPUT-001 · Rules D-1, D-2

**Requirement.** Earned payroll and bonuses settle on their entered pay dates rather than being confused with recognition. [Detailed semantics](docs/planning-semantics.md#fin-002).

**Acceptance.**
1. Earned payroll paid on next-month day five leaves an accrual until settlement.
2. A quarterly bonus accrues monthly and settles in its selected pay month.
3. Prior-horizon accruals, clamped dates and cent conservation retain exact cash and statement traces.
4. Invalid timing is refused atomically, and pay-filtered reads and frozen captures retain the same amounts.

**Evidence.** `tests/working-capital.test.mjs`; `tests/working-capital-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Earned payroll paid on next-month day five leaves an accrual until settlement; point 2: A quarterly bonus accrues monthly; point 2: settles in its selected pay month; point 3: Prior-horizon accruals; point 3: clamped dates; point 3: cent conservation retain exact cash; point 3: statement traces; point 4: Invalid timing is refused atomically; point 4: and pay-filtered reads; point 4: frozen captures retain the same amounts. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-003 — Debt schedules and covenants

Core · target · **partial** · Cites BASE-INPUT-001 · Rules D-1, D-2

**Requirement.** Finance plans fixed or variable term and venture debt, amortization, early repayment and explicit cash/liquidity/leverage covenants. [Detailed semantics](docs/planning-semantics.md#fin-003).

**Acceptance.**
1. Fixed-term and variable venture schedules have exact principal, interest and cent remainders, including early repayment.
2. All three monthly covenant kinds expose the first breach and the corresponding traced values.
3. Operating payables stay distinct from financing; accepted actual interest is not charged again.
4. Frozen versions and published funding retain captured debt arithmetic, with finance-only terms in reads, comparisons and formula Excel.

**Evidence.** `src/easel/financing.ts`; `tests/financing.test.mjs`; `tests/financing-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Fixed-term; point 1: variable venture schedules have exact principal; point 1: interest; point 1: cent remainders; point 1: including early repayment; point 2: All three monthly covenant kinds expose the first breach; point 2: the corresponding traced values; point 3: Operating payables stay distinct from financing; point 3: accepted actual interest is not charged again; point 4: Frozen versions; point 4: published funding retain captured debt arithmetic; point 4: with finance-only terms in reads; point 4: comparisons; point 4: formula Excel. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-010 — Credit facilities and equity financing

Core · target · **partial** · From FIN-003 · Cites BASE-INPUT-001 · Rules D-1

**Requirement.** Finance models credit draws and equity raises without treating financing proceeds as operating revenue. [Detailed semantics](docs/planning-semantics.md#fin-003).

**Acceptance.**
1. A downside credit line draws only the required amount and reports exact draw, interest, principal and covenant breach.
2. A $5,000,000 equity raise increases cash and contributed equity without changing profit and loss.
3. Linked statements and formula Excel reconcile, and invalid financing inputs leave no partial change.

**Evidence.** `src/easel/financing.ts`; `tests/financing.test.mjs`; `tests/financing-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A downside credit line draws only the required amount; point 1: reports exact draw; point 1: interest; point 1: principal; point 1: covenant breach; point 2: A $5,000,000 equity raise increases cash; point 2: contributed equity without changing profit and loss; point 3: Linked statements; point 3: formula Excel reconcile; point 3: and invalid financing inputs leave no partial change. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-004 — Capex and depreciation

Core · target · **done** · Cites BASE-INPUT-001

**Requirement.** Finance plans asset purchases, straight-line depreciation, disposals and imported remaining book value. [Detailed semantics](docs/planning-semantics.md#fin-004).

**Acceptance.**
1. A $120,000 equipment purchase over five years produces $2,000 monthly depreciation, the corresponding net book value and the purchase cash outflow.
2. A $17,500 imported net asset allocated over thirty-five remaining months depreciates $500 in the following month.
3. Disposal charges no depreciation in its month, removes remaining book value and includes its proceeds.

**Evidence.** `src/easel/assets.ts`; `tests/assets.test.mjs`; `tests/assets-browser-journey.mjs`; `tests/mapping-rules.test.mjs`
**Gap.** None.

#### FIN-005 — Runway, burn and an agreed cash floor

Core · target · **partial** · Cites BASE-INPUT-001

**Requirement.** Finance agrees a cash floor and reads gross burn, net burn, runway and the first breach from the forecast. [Detailed semantics](docs/planning-semantics.md#fin-005).

**Acceptance.**
1. A downside crossing a $500,000 floor shows the crossing month and runway in the scenario, comparison and dashboard.
2. Every month's gross burn, net burn and runway equal its hand-computed cash-in and cash-out values.
3. Cash-zero date is the first month whose closing cash is below zero.

**Evidence.** `tests/cash-health.test.mjs`; `tests/cash-health-browser-journey.mjs`
**Gap.** Carried evidence establishes 4 audited outcomes. Complete assertion mapping remains owed for point 1: A downside crossing a $500,000 floor shows the crossing month; point 1: runway in the scenario; point 1: comparison; point 1: dashboard. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-006 — US tax estimates in the forecast

Core · target · **partial** · Cites BASE-INPUT-001

**Requirement.** Employer payroll taxes are calculated per person under US rules with annual wage bases: Social Security, Medicare, FUTA, and SUTA at a state rate and wage base finance enters. Income tax is estimated at the federal rate plus a state rate, with a loss carryforward. Sales tax collected is a pass-through to cash that never counts as revenue. These are planning estimates, labeled as such, and never filings. [Detailed semantics](docs/planning-semantics.md#fin-006).

**Acceptance.**
1. Plans one $180,000 W-2 position and reads Social Security stopping at the wage base within the year, Medicare continuing, FUTA on the first $7,000, SUTA at an entered 2.7% state rate stopping at an entered state wage base, and an income-tax line on a profitable month
2. A loss in an early month is carried forward and reduces income tax in a later profitable month
3. sales tax collected on an invoice flows into cash and out through a sales-tax payable without changing revenue.

**Evidence.** `src/easel/payroll-taxes.ts`; `src/easel/tax-input.ts`; `src/easel/tax-calculation.ts`; `tests/taxes.test.mjs`; `tests/taxes-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Plans one $180,000 W-2 position; point 1: reads Social Security stopping at the wage base within the year; point 1: Medicare continuing; point 1: FUTA on the first $7,000, SUTA at an entered 2.7% state rate stopping at an entered state wage base; point 1: and an income-tax line on a profitable month; point 2: A loss in an early month is carried forward; point 2: reduces income tax in a later profitable month; point 3: sales tax collected on an invoice flows into cash; point 3: out through a sales-tax payable without changing revenue. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### FIN-007 — 13-week cash forecast

Core · target · **partial** · Cites BASE-INPUT-001

**Requirement.** A weekly direct cash view for the next 13 weeks is built from open receivables by due date and expected payment behavior (each customer's average days late from its paid-invoice history, or a collection curve finance sets), open payables and bills by due date, payroll on its run dates (from the payroll connection or file, `PEOPLE-001` and `PEOPLE-007`, or a pay schedule finance sets), debt service on its schedule and planned spend in its planned week. Finance can override any week with a note, and the view reconciles to the monthly forecast at month ends. [Detailed semantics](docs/planning-semantics.md#fin-007).

**Acceptance.**
1. With ledger, payroll and bank fakes holding open invoices and bills, a semimonthly pay schedule, a term-loan payment and a planned spend line, the API journey reads 13 weeks in which each invoice lands in the week its customer's paid-invoice history puts it (a customer averaging 12 days late lands 12 days after its due date), each bill on its due date, each payroll run on its run date, the loan payment in its scheduled week and the planned spend in its planned week
2. The month-end weeks agree with the monthly cash forecast, and an override keeps its note.

**Evidence.** `tests/weekly-cash.test.mjs`; `tests/plaid-cash.test.mjs`; `tests/plaid-cash-browser.mjs`; `tests/weekly-cash-browser.mjs`
**Gap.** Dated planned cash and reviewed Pantry/bank combinations are delivered. Connected payroll-provider run dates and the complete ledger/payroll/bank end-to-end reconciliation remain unproved. Bank audience follows CONNECT-009 and RL-102.

### Headcount and compensation

#### PEOPLE-001 — Roster and payroll actuals from Gusto

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Finance connects Gusto (OAuth, read-only). Easel pulls employees and contractors, with department, title, employment type (W-2 or 1099), compensation, start and termination dates, and payroll run totals by employee. The roster is reconciled to planned positions: matched, unplanned hires, planned but not hired, and changed salaries. Payroll actuals reconcile to the ledger's payroll lines. Pay detail stays under `EASEL-007` and `PEOPLE-005`. [Detailed semantics](docs/planning-semantics.md#people-001).

**Acceptance.**
1. A recorded Gusto demo-company fake
2. Connects, sees reconciliation buckets, accepts matches, and confirms a viewer receives headcount totals without names or salaries
3. One recorded run against Gusto's demo environment.

**Evidence.** `src/easel/gusto-provider.ts`; `tests/headcount.test.mjs`; `tests/gusto-roster-browser.mjs`
**Gap.** Manual Gusto employee/payroll observations are delivered. OAuth, contractors, full reconciliation and accepted matches, and demo-environment qualification remain incomplete.

#### PEOPLE-002 — Roster from Rippling, Willow, BambooHR and ADP

Core · target · **missing** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** The same roster pull, reconciliation and restriction as `PEOPLE-001` from Rippling, [Willow](https://github.com/just-every/run-willow), BambooHR and ADP Workforce Now, with each provider's own fields mapped and anything unmapped listed. [Detailed semantics](docs/planning-semantics.md#people-002).

**Acceptance.**
1. The `PEOPLE-001` journey against a fake for each provider, with an unmapped custom field listed rather than dropped.

**Evidence.** None.
**Gap.** No HRIS connectors

#### PEOPLE-003 — Open roles from the ATS

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Open requisitions from [Lodge](https://github.com/just-every/run-lodge) or Greenhouse become to-be-hired positions with department, level and target start. An accepted offer updates the position's name, salary and start date as a proposal for finance, and a closed requisition proposes removing the position. [Detailed semantics](docs/planning-semantics.md#people-003).

**Acceptance.**
1. An ATS fake opens a requisition, then marks an offer accepted with a later start
2. Sees a proposal with the changed start and cost and promotes it.

**Evidence.** `tests/headcount.test.mjs`; `tests/greenhouse-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: An ATS fake opens a requisition; point 1: then marks an offer accepted with a later start; point 2: Sees a proposal with the changed start; point 2: cost; point 2: promotes it. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### PEOPLE-004 — Base compensation assumptions

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Salary or hourly W-2 and 1099 positions retain traced base wages, benefits, employer match and department on-cost assumptions. [Detailed semantics](docs/planning-semantics.md#people-004).

**Acceptance.**
1. A salaried engineer and an hourly W-2 position at $40 for 120 expected hours produce exact monthly base costs.
2. A 1099 contractor has no employer payroll tax.
3. Entered $1,200 monthly benefits and a four-percent employer match appear as separate traced components; the match base excludes bonus and commission.
4. An explicit position on-cost, including zero, overrides the department default; changing that default alone changes no existing position.
5. Each monthly cost equals its traced base-pay, benefit, match, on-cost and FIN-006 employer-tax components.
6. US-001 statutory assumptions carry the effective tax year, planning-estimate labels and retained finance overrides.

**Evidence.** `tests/people-comp.test.mjs`; `tests/people-comp-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A salaried engineer; point 1: an hourly W-2 position at $40 for 120 expected hours produce exact monthly base costs; point 2: A 1099 contractor has no employer payroll tax; point 3: Entered $1,200 monthly benefits; point 3: a four-percent employer match appear as separate traced components; point 3: the match base excludes bonus; point 3: commission; point 4: An explicit position on-cost; point 4: including zero; point 4: overrides the department default; point 4: changing that default alone changes no existing position; point 5: Each monthly cost equals its traced base-pay; point 5: benefit; point 5: match; point 5: on-cost; point 5: FIN-006 employer-tax components; point 6: US-001 statutory assumptions carry the effective tax year; point 6: planning-estimate labels; point 6: retained finance overrides. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### PEOPLE-008 — Merit and salary bonuses

Core · target · **partial** · From PEOPLE-004 · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1, D-2

**Requirement.** Finance enters dated merit and an explicitly timed salary bonus without inferring payroll execution. [Detailed semantics](docs/planning-semantics.md#people-004).

**Acceptance.**
1. A salaried engineer's merit increase applies on its inclusive entered date, including leap and retail periods.
2. A ten-percent salary bonus paid in March appears once with its incremental employer tax and correct cash date.
3. Merit, bonus, base wages and employer taxes reconcile to each position's monthly cell and trace.
4. Frozen captures retain their dates and compensation arithmetic.

**Evidence.** `tests/people-comp.test.mjs`; `tests/people-comp-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A salaried engineer's merit increase applies on its inclusive entered date; point 1: including leap; point 1: retail periods; point 2: A ten-percent salary bonus paid in March appears once with its incremental employer tax; point 2: correct cash date; point 3: Merit; point 3: bonus; point 3: base wages; point 3: employer taxes reconcile to each position's monthly cell; point 3: trace; point 4: Frozen captures retain their dates; point 4: compensation arithmetic. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### PEOPLE-009 — Commission quotas and accelerators

Core · target · **partial** · From PEOPLE-004 · Cites BASE-ROLE-001, BASE-INPUT-001 · Rules D-1

**Requirement.** Explicit contract-position links generate commission planning estimates; pipeline commissions use the same rules when REV-001 ships. [Detailed semantics](docs/planning-semantics.md#people-004).

**Acceptance.**
1. The contract salesperson's commission equals the explicitly linked booking times its rate, rounded once, expensed at booking start and paid through the payroll schedule.
2. W-2 commission enters employer-tax wages and caps; 1099 commission adds no employer tax, and neither commission has on-costs.
3. Missing, cross-scenario, inactive or orphaned position links refuse atomically.
4. Quota attainment and marginal accelerators reset per accounting period and retain deterministic contract ordering, exact thresholds, slices and rounding.
5. Commission rate, link and per-position trace remain Pay detail while totals remain readable.
6. Every output identifies a planning estimate without inferring capitalization, payment or statutory filing.

**Evidence.** `tests/people-comp.test.mjs`; `tests/people-comp-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: The contract salesperson's commission equals the explicitly linked booking times its rate; point 1: rounded once; point 1: expensed at booking start; point 1: paid through the payroll schedule; point 2: W-2 commission enters employer-tax wages; point 2: caps; point 2: 1099 commission adds no employer tax; point 2: and neither commission has on-costs; point 3: Missing; point 3: cross-scenario; point 3: inactive or orphaned position links refuse atomically; point 4: Quota attainment; point 4: marginal accelerators reset per accounting period; point 4: retain deterministic contract ordering; point 4: exact thresholds; point 4: slices; point 4: rounding; point 5: Commission rate; point 5: link; point 5: per-position trace remain Pay detail while totals remain readable; point 6: Every output identifies a planning estimate without inferring capitalization; point 6: payment or statutory filing. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### PEOPLE-005 — Compensation access separate from finance

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** The owner's separate Pay detail grant controls compensation detail independently of planning membership and preserves aggregate planning reads. [Detailed semantics](docs/planning-semantics.md#people-005).

**Acceptance.**
1. An analyst without Pay detail, a department head and a viewer retain aggregate planning reads but receive no salary outside their explicit grants.
2. A planted salary is absent from their API responses, add-in pulls and exports.
3. Only the owner grants or revokes Pay detail; contributors' detail grants remain limited to their departments and viewers cannot receive one.
4. Reclassifying payroll or moving a protected input cannot bypass the Pay detail requirement.
5. Complete archives and unfiltered Activity refuse a reader without Pay detail rather than returning an incomplete archive.
6. Department app statements, workbooks and every recipient's email recheck the same pay audience; a pending stale-detail message cannot be sent.

**Evidence.** `tests/compensation-access.test.mjs`; `tests/compensation-access-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: An analyst without Pay detail; point 1: a department head; point 1: a viewer retain aggregate planning reads but receive no salary outside their explicit grants; point 2: A planted salary is absent from their API responses; point 2: add-in pulls; point 2: exports; point 3: Only the owner grants or revokes Pay detail; point 3: contributors' detail grants remain limited to their departments; point 3: viewers cannot receive one; point 4: Reclassifying payroll or moving a protected input cannot bypass the Pay detail requirement; point 5: Complete archives; point 5: unfiltered Activity refuse a reader without Pay detail rather than returning an incomplete archive; point 6: Department app statements; point 6: workbooks; point 6: every recipient's email recheck the same pay audience; point 6: a pending stale-detail message cannot be sent. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### PEOPLE-006 — Headcount plan against actual

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Monthly headcount, hires, departures and payroll cost are compared between plan and roster actual by department. Hiring slippage (planned start against actual start), backfills and an attrition assumption are shown, and the slippage history feeds `AGENT-004`. [Detailed semantics](docs/planning-semantics.md#people-006).

**Acceptance.**
1. After a roster pull with a late hire and departure, API and browser reads show monthly planned and actual headcount and payroll cost by department.
2. Explicit start dates produce exact slippage in days; month-only starts show that day slippage is unavailable.
3. Backfills, attrition assumptions and retained observation history remain visible under the current pay and scenario grants.
4. Connected Gusto observations retain the same date/history rules, and provider identity erasure follows ERASE-001.

**Evidence.** `tests/headcount.test.mjs`; `tests/gusto-roster-browser.mjs`; `tests/headcount-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: After a roster pull with a late hire; point 1: departure; point 1: API; point 1: browser reads show monthly planned; point 1: actual headcount; point 1: payroll cost by department; point 2: Explicit start dates produce exact slippage in days; point 2: month-only starts show that day slippage is unavailable; point 3: Backfills; point 3: attrition assumptions; point 3: retained observation history remain visible under the current pay; point 3: scenario grants; point 4: Connected Gusto observations retain the same date/history rules; point 4: and provider identity erasure follows ERASE-001. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### PEOPLE-007 — Roster and payroll-register file import

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** A buyer whose PEO or payroll provider has no connector (for example Justworks, TriNet, Insperity, ADP TotalSource, Paychex, Paylocity or Paycom) imports a roster file and a payroll-register file as CSV or .xlsx. Finance maps columns once: employee ID, name, department, title, W-2 or 1099, salary or hourly rate, and start and termination dates; and, per pay run, gross wages, employer taxes, benefits and fees. The mapping is saved per provider. The import previews without writing, lands through the import journal with the original bytes, undoes exactly, and reconciles to planned positions in the same four buckets as `PEOPLE-001`: matched, unplanned hire, planned but not hired, and changed salary. Payroll-register totals reconcile to the ledger's payroll lines. Pay detail follows `EASEL-007` and `PEOPLE-005`. [Detailed semantics](docs/planning-semantics.md#people-007).

**Acceptance.**
1. Through the API, import a Justworks-shaped roster CSV and an .xlsx payroll register: the preview writes nothing
2. The accepted import shows the four reconciliation buckets and a register total reconciled to the ledger's payroll lines
3. A viewer receives headcount and cost totals without names or salaries
4. A second file in the same shape needs no column choices
5. undo removes exactly what the import wrote.

**Evidence.** `src/easel/payroll-import.ts`; `src/easel/payroll-file.ts`; `src/easel/payroll-reconciliation.ts`; `tests/payroll-files.test.mjs`; `tests/payroll-erasure.test.mjs`; `tests/payroll-files-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Through the API; point 1: import a Justworks-shaped roster CSV; point 1: an .xlsx payroll register: the preview writes nothing; point 2: The accepted import shows the four reconciliation buckets; point 2: a register total reconciled to the ledger's payroll lines; point 3: A viewer receives headcount; point 3: cost totals without names or salaries; point 4: A second file in the same shape needs no column choices; point 5: undo removes exactly what the import wrote. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Revenue and pipeline

#### REV-001 — Pipeline drivers from Orbit, HubSpot and Salesforce

Core · target · **missing** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Finance connects [Orbit](https://github.com/just-every/run-orbit), HubSpot or Salesforce (OAuth, read-only) and pulls open and closed deals with stage, amount, owner, close date and product. From Salesforce, Easel reads Opportunities with their stage and that stage's probability (custom stages included), their OpportunityLineItems (product, quantity, unit price and term), and the org's fiscal periods, so a close date lands in the fiscal period Salesforce assigns it, custom fiscal years included. A deal with line items is split by product, and each product follows its own deal-to-revenue rule. From Orbit, Easel reads deals through Orbit's API with a scoped read-only token. Finance owns the assumptions, which are explicit and versioned: probability by stage (or the CRM's own probability, labeled), close-date slippage by stage, and the deal-to-revenue rule (one-time, ratable over term, or subscription start). Weighted bookings feed revenue, deferred revenue, commissions and cash. Each revenue cell traces to the deals behind it, under role filtering. [Detailed semantics](docs/planning-semantics.md#rev-001).

**Acceptance.**
1. A HubSpot fake with deals at three stages
2. Sets probabilities and slippage, reads weighted bookings and revenue traced to deal IDs, moves a deal's close date in the fake, refreshes, and sees the revenue move
3. One recorded run against a HubSpot developer test account.
4. The same journey against a recorded Salesforce fake of Opportunity, OpportunityLineItem and fiscal-period records: a custom stage whose CRM probability is 60% is overridden by finance to 40%, and weighted bookings use 40% with the trace labeling the override
5. An opportunity with a one-time setup product and a 12-month subscription product recognizes the first in its close month and the second ratably over 12 months
6. A close date inside a custom fiscal period lands in that period
7. One recorded run against a Salesforce Developer Edition org.
8. Two local installations (Orbit and Easel), as in `CONNECT-004`: Easel pulls Orbit's deals, a deal's close date changed in Orbit moves its revenue on Easel's next refresh, and the trace cites the Orbit deal ID.

**Evidence.** None.
**Gap.** No Orbit, HubSpot or Salesforce connector, stage probabilities, line-item revenue rules or pipeline drivers

#### REV-002 — Subscription metrics from Stripe Billing and Nectar

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Finance connects Stripe Billing (restricted read-only key) or [Nectar](https://github.com/just-every/run-nectar). Easel computes MRR and ARR movements (new, expansion, contraction, churn and reactivation), customer counts, gross and net revenue retention, and monthly cohorts. These serve as actuals for the subscription drivers in `EASEL-006` and `REV-003`, and reconcile to ledger revenue with the difference explained (deferred revenue, refunds, tax). [Detailed semantics](docs/planning-semantics.md#rev-002).

**Acceptance.**
1. A Stripe fake with subscriptions, upgrades, downgrades and cancellations across three months
2. Reads an ARR bridge and a cohort table that agree with hand-computed values, and a reconciliation to ledger revenue
3. One recorded run against Stripe test mode.

**Evidence.** `tests/billing.test.mjs`; `tests/connectors-browser.mjs`
**Gap.** Read-only subscription observations and their retained metrics are delivered. Complete bridge/cohort reconciliation and the recorded Stripe test-mode journey remain incomplete.

#### REV-003 — A revenue driver library

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-2

**Requirement.** Beyond volume × rate and customers × revenue per customer, revenue can come from seats × price with expansion, usage × unit price, billable headcount × utilization × rate (with actuals from [Gauge](https://github.com/just-every/run-gauge) or Harvest), project milestones and backlog burn-down, and the formula lines of `MODEL-004`. Every driver traces. [Detailed semantics](docs/planning-semantics.md#rev-003). MODEL-004 carries formula-line revenue through its formula and proposal doors.

**Acceptance.**
1. Volume, customers, seats, usage, services, milestones and backlog lines have hand-computed monthly cents, complete traces and their exact collection timing.
2. Active headcount boundaries, invalid-save atomicity, role filtering, proposal editing, structure differences and live Excel formulas preserve frozen approvals, reforecasts, kept forecasts and packs.
3. At desktop and phone widths, the fixed forms are entered and edited, traced cells read and Excel downloaded without page overflow.
4. A reviewed Gauge import conserves source seconds and rounding, changes nothing during preview and handles source, period, capacity, replay, correction and undo outcomes without changing frozen values.
5. Two local installations approve time through Gauge's public door and import it through Easel with exact traced cents, reload and undo at both widths.

**Evidence.** `tests/revenue-drivers.test.mjs`; `tests/revenue-drivers-browser.mjs`; `tests/gauge-utilization.test.mjs`; `tests/gauge-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Volume; point 1: customers; point 1: seats; point 1: usage; point 1: services; point 1: milestones; point 1: backlog lines have hand-computed monthly cents; point 1: complete traces; point 1: their exact collection timing; point 2: Active headcount boundaries; point 2: invalid-save atomicity; point 2: role filtering; point 2: proposal editing; point 2: structure differences; point 2: live Excel formulas preserve frozen approvals; point 2: reforecasts; point 2: kept forecasts; point 2: packs; point 3: At desktop; point 3: phone widths; point 3: the fixed forms are entered; point 3: edited; point 3: traced cells read; point 3: Excel downloaded without page overflow; point 4: A reviewed Gauge import conserves source seconds; point 4: rounding; point 4: changes nothing during preview; point 4: handles source; point 4: period; point 4: capacity; point 4: replay; point 4: correction; point 4: undo outcomes without changing frozen values; point 5: Two local installations approve time through Gauge's public door; point 5: import it through Easel with exact traced cents; point 5: reload; point 5: undo at both widths. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### REV-004 — Bookings, billings, revenue and cash

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-2

**Requirement.** For contract revenue, a booking carries term, billing frequency (monthly, quarterly, annual upfront) and start date. Billings, deferred revenue, recognized revenue and collections follow from it and appear on the three statements (`FIN-001`, `FIN-002`). [Detailed semantics](docs/planning-semantics.md#rev-004).

**Acceptance.**
1. Asserts a $120,000 annual-upfront booking creates a $120,000 billing, $10,000 monthly revenue, declining deferred revenue, and exact-day DSO collection; it also asserts monthly and quarterly schedules, partial terms, anniversary/day allocation and cent remainders, linked statement identities, role filtering, proposals, frozen arithmetic and independently evaluated formula Excel.
2. Creates and edits a contract through Plan and reads billing, revenue, collection and reconciled statements at 1440/390 without page overflow.

**Evidence.** `tests/revenue-drivers.test.mjs`; `tests/contracts-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Asserts a $120,000 annual-upfront booking creates a $120,000 billing; point 1: $10,000 monthly revenue; point 1: declining deferred revenue; point 1: and exact-day DSO collection; point 1: it also asserts monthly; point 1: quarterly schedules; point 1: partial terms; point 1: anniversary/day allocation; point 1: cent remainders; point 1: linked statement identities; point 1: role filtering; point 1: proposals; point 1: frozen arithmetic; point 1: independently evaluated formula Excel; point 2: Creates; point 2: edits a contract through Plan; point 2: reads billing; point 2: revenue; point 2: collection; point 2: reconciled statements at 1440/390 without page overflow. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Spend

#### SPEND-001 — Committed and card spend

Core · target · **partial** · Cites BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Purchase orders and committed contracts from [Purse](https://github.com/just-every/run-purse), expense reports from [Coaster](https://github.com/just-every/run-coaster), and card and bill-payment data from Ramp, Brex and Bill.com feed the forecast as committed spend by line, department and month. The variance view shows budget, committed, actual and remaining for each. [Detailed semantics](docs/planning-semantics.md#spend-001).

**Acceptance.**
1. A Ramp fake and a Purse fake add a card transaction and a purchase order
2. Reads budget, committed, actual and remaining for the affected department.

**Evidence.** `tests/spend.test.mjs`; `tests/spend-browser.mjs`
**Gap.** Reviewed Ramp/Purse import slices are delivered. All named committed-spend sources, complete line/month reconciliation and their source qualification remain incomplete.

### Spreadsheets

#### SHEET-001 — Excel add-in with live formulas

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1, D-2 · Register R-3

**Requirement.** A Microsoft Excel add-in (Office.js, Windows, Mac and Excel on the web) signs in as the person and provides worksheet functions, for example `=EASEL.VALUE("Revenue","Sales","2027-01","Forecast")`, plus pull-a-report ranges. Values refresh on demand (a Refresh command for the workbook or the selection) and when the workbook opens, and each refresh pulls every change made in Easel since the last one, under server-side role filtering for the person refreshing. Write-back follows the same rules as the browser. While a contributor's department submission is requested or returned, their write to that department's budget inputs lands directly as their own entry at the next plan revision, as an entry in the grid would, and their later submission includes it. Once the department is submitted, a write to its working plan becomes a proposal bound to the current revision. A write to an approved budget, a kept forecast or another department's cells is refused with the reason. The workbook's own formulas around Easel cells stay live: a formula that references an Easel function cell (for example a `SUM` over them) recalculates whenever a refresh changes that cell, as any Excel dependency does. [Detailed semantics](docs/planning-semantics.md#sheet-001).

**Acceptance.**
1. An Office.js test host loads the add-in against a running Easel, in a workbook holding `=EASEL.VALUE(...)` cells and a plain `=SUM(...)` over them: the functions return role-filtered values
2. A value changed in Easel through the browser or the API, followed by an on-demand refresh, shows the new value in its function cell and the new total in the `SUM`
3. After a second Easel change, closing and reopening the workbook refreshes on open and shows that change in the cell and the `SUM`
4. A viewer refreshing the same workbook receives role-filtered values without restricted detail
5. During a requested submission a contributor's write to their own department lands directly at the next revision and reads back in the browser and the API
6. After they submit, the same write returns as a proposal bound to the revision
7. A write to the approved budget and a write to another department are refused

**Evidence.** `tests/grid.test.mjs`; `tests/excel-browser.mjs`; `docs/excel-bridge.md`
**Gap.** Native scoped spreadsheet client APIs are delivered. The complete Windows, Mac and web Office.js lifecycle, live workbook dependency recalculation and all direct/proposal/refusal branches remain unproved; tenant proof is R-3.

#### SHEET-002 — Google Sheets add-on with live formulas

Core · target · **missing** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1, D-2 · Register R-6

**Requirement.** The same functions, refresh, role filtering and write-back rules as `SHEET-001` (direct entry during an open submission, a proposal once submitted, refusal on approved budgets, kept forecasts and other departments), as a Google Workspace add-on with custom functions. Refresh runs on demand from the add-on menu and when the spreadsheet opens, and scheduled refresh runs through an installable time-driven trigger that pulls Easel changes without the spreadsheet being open. Sheet formulas over Easel cells recalculate after each refresh. [Detailed semantics](docs/planning-semantics.md#sheet-002).

**Acceptance.**
1. An Apps Script test harness against a running Easel replays the `SHEET-001` journey, including the on-demand refresh, the refresh on open and a `SUM` over Easel cells recalculating after each, and the viewer's role-filtered refresh
2. The harness then fires the installable time-driven trigger with the spreadsheet closed, and on reopening the sheet shows an Easel change made before the trigger ran

**Evidence.** None.
**Gap.** No Google Sheets add-on, refresh on open or installable-trigger refresh

#### SHEET-003 — Model import that keeps formulas

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1

**Requirement.** Importing an existing Excel or Google Sheets model translates supported formulas (arithmetic, SUM, IF, references across sheets and months, growth and lookups) into Easel formulas. Every formula it cannot translate is listed with its sheet and cell, and that cell keeps its cached value with provenance. Totals reconcile to the workbook's own totals before anything is accepted, and undo works through the journal. [Detailed semantics](docs/planning-semantics.md#sheet-003).

**Acceptance.**
1. Import a fixture workbook model with cross-sheet formulas and one unsupported function
2. The import report lists the unsupported cell, Easel totals equal the workbook totals, a driver change recalculates the translated formulas, and undo removes the import.

**Evidence.** `src/easel/workbook-formula.ts`; `tests/formula-import.test.mjs`; `tests/formula-import-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Import a fixture workbook model with cross-sheet formulas; point 1: one unsupported function; point 2: The import report lists the unsupported cell; point 2: Easel totals equal the workbook totals; point 2: a driver change recalculates the translated formulas; point 2: and undo removes the import. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### SHEET-004 — Excel exports with formulas

Core · target · **done** · Cites BASE-ROLE-001, BASE-INPUT-003 · Rules D-1, D-2

**Requirement.** Any report, plan or pack exports as .xlsx with live subtotal, total and variance formulas and one sheet per statement, not values only. CSV exports remain. Pay detail follows `PEOPLE-005`. This obligation applies to every report and statement that exists today (scenario/overview P&L and cash, scenario comparisons, monthly variances, published packs, actuals reconciliation and filtered activity), using the same server-filtered views and immutable snapshots as the app. Future report, statement and plan capabilities (`REPORT-001` to `REPORT-007`, `FIN-001` to `FIN-007`, `MODEL-001` to `MODEL-009`) inherit this export obligation before they ship. Workbook amounts are integer minor units, labeled with their currency; differences are actual minus budget or comparison-to minus comparison-from. Unavailable comparison periods or different currencies have no difference value. A department-filtered plan exports that department's P&L and visible inputs, without a company-wide cash statement. [Detailed semantics](docs/planning-semantics.md#sheet-004).

**Acceptance.**
1. Download a report as .xlsx through the browser, open it with a spreadsheet library in the test, and assert that subtotal cells hold formulas that evaluate to Easel's totals.

**Evidence.** `src/easel/report-workbooks.ts`; `src/easel/pack-workbook.ts`; `tests/spreadsheet-export.test.mjs`; `tests/export-browser-journey.mjs`
**Gap.** None.

#### SHEET-005 — Scheduled spreadsheet pulls

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-003

**Requirement.** A linked sheet range (for example a sales team's capacity sheet) is pulled on a schedule. Its changes arrive as a previewed proposal for finance with the changed cells listed. A sheet that went missing or changed shape is reported, never read as zeros. [Detailed semantics](docs/planning-semantics.md#sheet-005).

**Acceptance.**
1. A Google Sheets fake changes two cells and then deletes a column between scheduled pulls
2. Sees a proposal with two changed cells, then a shape error with no write.

**Evidence.** `tests/workbook-undo.test.mjs`; `tests/sheet-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A Google Sheets fake changes two cells; point 1: then deletes a column between scheduled pulls; point 2: Sees a proposal with two changed cells; point 2: then a shape error with no write. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Planning cycles and collaboration

#### CYCLE-001 — Budget calendar, tasks and reminders

Core · target · **partial** · Cites BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Finance sets a planning calendar with tasks (submit department budget, review headcount, confirm variance explanations), owners and due dates. Owners get reminders by email, [Nook](https://github.com/just-every/run-nook), Slack or Microsoft Teams in the company's time zone. Reminders stop when the task is done, and overdue tasks escalate to finance. Submission status is one kind of task. Before shipping, CYCLE-001 inherits REPORT-005: its open department tasks appear in that department's monthly email and app statement under the same recipient and detail filtering. [Detailed semantics](docs/planning-semantics.md#cycle-001).

**Acceptance.**
1. With a fake clock and mail and chat fakes, the API journey requests submissions due Friday
2. A reminder goes out Thursday morning Eastern, the reminder for a submitted department is canceled, and an overdue department escalates to finance on Monday.

**Evidence.** `src/easel/calendar.ts`; `src/easel/calendar-dispatch.ts`; `src/easel/calendar-channels.ts`; `tests/calendar.test.mjs`; `tests/calendar-browser.mjs`
**Gap.** Calendar tasks, saved-zone reminders and escalation are delivered. Qualified Base resolved-address and pinned-egress remains required for owner-entered chat destinations.

#### CYCLE-002 — Metric-triggered tasks

Core · target · **partial** · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-1

**Requirement.** Finance configures actual-spend, runway and next-quarter-pipeline rules that create cited planning tasks without duplicate open work. [Detailed semantics](docs/planning-semantics.md#cycle-002).

**Acceptance.**
1. A closed month exceeding a ten-percent spend rule creates one department task with actual, budget, variance, source citations, owner and due date.
2. A repeated refresh while the task is open creates no duplicate.
3. Percentage and amount comparisons are strict, including zero-budget spend; incomplete sources visibly block assessment.
4. Runway uses the earliest future breach and its exact arithmetic.
5. Completing a task permits a later trigger; disabling a rule retains captured task evidence.

**Evidence.** `tests/metric-tasks.test.mjs`; `tests/metric-tasks-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A closed month exceeding a ten-percent spend rule creates one department task with actual; point 1: budget; point 1: variance; point 1: source citations; point 1: owner; point 1: due date; point 2: A repeated refresh while the task is open creates no duplicate; point 3: Percentage; point 3: amount comparisons are strict; point 3: including zero-budget spend; point 3: incomplete sources visibly block assessment; point 4: Runway uses the earliest future breach; point 4: its exact arithmetic; point 5: Completing a task permits a later trigger; point 5: disabling a rule retains captured task evidence. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CYCLE-008 — Metric-task authority and surfaces

Core · target · **partial** · From CYCLE-002 · Cites BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Rule management and task completion follow the relevant finance and assignee planning grants. [Detailed semantics](docs/planning-semantics.md#cycle-002).

**Acceptance.**
1. Finance creates, checks and disables rules at desktop and phone widths.
2. The assigned contributor completes the task with persisted attribution; viewers see neither rules nor tasks.
3. A removed or out-of-scope assignee cannot read or complete the task.
4. Next-quarter pipeline coverage evaluates on refresh and close with cited numbers and open-task deduplication when REV-001 supplies the metric.

**Evidence.** `tests/metric-tasks.test.mjs`; `tests/metric-tasks-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Finance creates; point 1: checks; point 1: disables rules at desktop; point 1: phone widths; point 2: The assigned contributor completes the task with persisted attribution; point 2: viewers see neither rules nor tasks; point 3: A removed or out-of-scope assignee cannot read or complete the task; point 4: Next-quarter pipeline coverage evaluates on refresh; point 4: close with cited numbers; point 4: open-task deduplication when REV-001 supplies the metric. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CYCLE-003 — Notifications from discussions and events

Core · target · **partial** · Cites BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Planning events notify the eligible person through their selected channels with an exact record link. Under the recorded ct ruling, immediate email is the initial preference, with daily digest and chat-only alternatives. [Detailed semantics](docs/planning-semantics.md#cycle-003).

**Acceptance.**
1. Under mail and chat edge fixtures, each event sends one eligible notification linked to its record: a variance mention, returned submission, pending approval, restatement, refresh failure and triggered task.
2. Email, Slack, Teams and Nook follow each person's chosen channel; a Teams-only preference sends no email.
3. A digest-only person receives all their queued events in the next company-zone daily digest.
4. Saved-zone daylight saving and scheduled versus actual dispatch instants are visible.

**Evidence.** `src/easel/notify.ts`; `src/easel/notify-dispatch.ts`; `tests/notifications.test.mjs`; `tests/calendar-browser.mjs`
**Gap.** Current mentions, submission/approval events and tasks support channel preferences. Restatement and non-Gauge refresh events and qualified Base resolved-address/pinned-egress remain incomplete.

#### CYCLE-004 — Private and shared scenarios

Core · target · **partial** · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-1

**Requirement.** Any planner can make a private sandbox scenario that only they can see, share it with named people or groups as read or edit, and submit it as a proposal. Finance sets which scenarios are official (budget, forecast, board case).  [Detailed semantics](docs/planning-semantics.md#cycle-004). ACCESS-001 carries the equivalent group-share journey.

**Acceptance.**
1. Creates a contributor's private scenario, asserts 404 for another contributor, a viewer and unshared finance across reads/comparisons/CSV/Excel/branches, shares read-only with the viewer, compares exact cells and refuses edits, exercises edit shares with current department/pay restrictions, revocation, stale sharing/submission and changed contributor scope.
2. Exact copied/submitted proposals with an unchanged private original, promotion fences, official metadata without arithmetic changes, hidden Activity/comments/open-export rows and every visible manifest digest.
3. Creates, edits, shares, compares, downloads, submits and designates cases at 1440/390 with no page overflow.

**Evidence.** `tests/sandboxes.test.mjs`; `tests/sandboxes-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Creates a contributor's private scenario; point 1: asserts 404 for another contributor; point 1: a viewer; point 1: unshared finance across reads/comparisons/CSV/Excel/branches; point 1: shares read-only with the viewer; point 1: compares exact cells; point 1: refuses edits; point 1: exercises edit shares with current department/pay restrictions; point 1: revocation; point 1: stale sharing/submission; point 1: changed contributor scope; point 2: Exact copied/submitted proposals with an unchanged private original; point 2: promotion fences; point 2: official metadata without arithmetic changes; point 2: hidden Activity/comments/open-export rows; point 2: every visible manifest digest; point 3: Creates; point 3: edits; point 3: shares; point 3: compares; point 3: downloads; point 3: submits; point 3: designates cases at 1440/390 with no page overflow. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CYCLE-005 — Quarterly reforecasts and version comparison

Core · target · **partial** · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-1, D-2

**Requirement.** Finance saves named frozen reforecasts at reviewed revisions and compares actual, budget, each reforecast and working forecast without changing the source. [Detailed semantics](docs/planning-semantics.md#cycle-005).

**Acceptance.**
1. Q2 and Q3 saves retain reviewed source revisions; stale saves and duplicate trimmed case-insensitive names are refused.
2. After close, the same line compares actual, budget, both named reforecasts and the current forecast.
3. Source edits, live metadata changes and source deletion leave captured model definitions, inputs and calculations unchanged; frozen edits are refused.
4. Filtered HTML, CSV, report Excel and published-pack Excel retain the saved amounts; uncovered periods and differing currencies have no invented variance.
5. Installation export/restore retains exact snapshot bodies and digests and refuses tampered lineage or arithmetic.
6. At desktop and phone widths, finance and a viewer save or read the permitted versions, comparisons and variance workbook.

**Evidence.** `src/easel/reforecasts.ts`; `src/easel/version-comparison.ts`; `tests/reforecasts.test.mjs`; `tests/reforecasts-browser.mjs`; `tests/restore-flow.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Q2; point 1: Q3 saves retain reviewed source revisions; point 1: stale saves; point 1: duplicate trimmed case-insensitive names are refused; point 2: After close; point 2: the same line compares actual; point 2: budget; point 2: both named reforecasts; point 2: the current forecast; point 3: Source edits; point 3: live metadata changes; point 3: source deletion leave captured model definitions; point 3: inputs; point 3: calculations unchanged; point 3: frozen edits are refused; point 4: Filtered HTML; point 4: CSV; point 4: report Excel; point 4: published-pack Excel retain the saved amounts; point 4: uncovered periods; point 4: differing currencies have no invented variance; point 5: Installation export/restore retains exact snapshot bodies; point 5: digests; point 5: refuses tampered lineage or arithmetic; point 6: At desktop; point 6: phone widths; point 6: finance; point 6: a viewer save or read the permitted versions; point 6: comparisons; point 6: variance workbook. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CYCLE-006 — Long-range plan linked to the operating plan

Core · target · **partial** · Cites BASE-ROLE-001, BASE-MAIL-001 · Rules D-1

**Requirement.** Finance links a three-to-five-year annual target plan to the operating budget and reads top-down gaps. [Detailed semantics](docs/planning-semantics.md#cycle-006).

**Acceptance.**
1. For a five-year plan with forty-percent growth, year one equals the twelve-month operating budget.
2. Later-year growth, margin, headcount and cash drivers and all four target gaps have exact values.
3. Three-year edits, stale-save refusal and approved-budget immutability retain the reviewed source relation.
4. Excel independently evaluates to the same annual amounts and gaps.
5. Finance and board read the reconciliation and workbook at desktop and phone widths without page overflow.

**Evidence.** `src/easel/long-range.ts`; `src/ui/long-range.tsx`; `tests/long-range.test.mjs`; `tests/long-range-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: For a five-year plan with forty-percent growth; point 1: year one equals the twelve-month operating budget; point 2: Later-year growth; point 2: margin; point 2: headcount; point 2: cash drivers; point 2: all four target gaps have exact values; point 3: Three-year edits; point 3: stale-save refusal; point 3: approved-budget immutability retain the reviewed source relation; point 4: Excel independently evaluates to the same annual amounts; point 4: gaps; point 5: Finance; point 5: board read the reconciliation; point 5: workbook at desktop; point 5: phone widths without page overflow. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CYCLE-007 — Department review-chain configuration

Core · target · **partial** · Cites BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Finance assigns versioned ordered department chains to named reviewers and groups without changing global approval authority. [Detailed semantics](docs/planning-semantics.md#cycle-007).

**Acceptance.**
1. Sales receives two steps, a department-head group then a named finance planner; Engineering without a chain retains its single finance step.
2. Current finance or contributor reviewers must cover every department source and required Pay detail; removed members, viewers and incomplete dimension grants cannot act.
3. A step with no eligible reviewer is visibly blocked with its reason.
4. A step grants no edit, Pay detail, global approval or publishing permission.
5. At desktop and phone widths, finance configures the chain without page overflow.

**Evidence.** `tests/approval-chains.test.mjs`; `tests/approval-chains-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Sales receives two steps; point 1: a department-head group then a named finance planner; point 1: Engineering without a chain retains its single finance step; point 2: Current finance or contributor reviewers must cover every department source; point 2: required Pay detail; point 2: removed members; point 2: viewers; point 2: incomplete dimension grants cannot act; point 3: A step with no eligible reviewer is visibly blocked with its reason; point 4: A step grants no edit; point 4: Pay detail; point 4: global approval or publishing permission; point 5: At desktop; point 5: phone widths; point 5: finance configures the chain without page overflow. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CYCLE-009 — Exact department-review passes

Core · target · **partial** · From CYCLE-007 · Cites BASE-ROLE-001, BASE-MAIL-001

**Requirement.** Department review decisions bind the submitted department content in strict order. [Detailed semantics](docs/planning-semantics.md#cycle-007).

**Acceptance.**
1. Step two is refused before step one, and one step cannot complete twice in the same pass.
2. A Sales-input change by any route voids completed Sales decisions and restarts at step one; an Engineering-only change preserves Sales decisions.
3. A current or earlier reviewer, or finance, can return the submission with a reason; contributor revision and resubmission start a new pass.
4. Request, submit, step approval, return and restart history retain actor, time, step, chain version and reviewed content.
5. Global budget approval names the waiting department and step until all recorded steps complete, then captures their versions and decisions.
6. Reviewers approve and return in order at desktop and phone widths without page overflow.
7. An agent's review decision carries commitment; the company's policy decides the call, with truthful attribution instead of a person's confirmation.

**Evidence.** `tests/approval-chains.test.mjs`; `tests/approval-chains-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Step two is refused before step one; point 1: and one step cannot complete twice in the same pass; point 2: A Sales-input change by any route voids completed Sales decisions; point 2: restarts at step one; point 2: an Engineering-only change preserves Sales decisions; point 3: A current or earlier reviewer; point 3: or finance; point 3: can return the submission with a reason; point 3: contributor revision; point 3: resubmission start a new pass; point 4: Request; point 4: submit; point 4: step approval; point 4: return; point 4: restart history retain actor; point 4: time; point 4: step; point 4: chain version; point 4: reviewed content; point 5: Global budget approval names the waiting department; point 5: step until all recorded steps complete; point 5: then captures their versions; point 5: decisions; point 6: Reviewers approve; point 6: return in order at desktop; point 6: phone widths without page overflow; point 7: An agent's review decision carries commitment; point 7: the company's policy decides the call; point 7: with truthful attribution instead of a person's confirmation. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### CYCLE-010 — Review-chain versions and delivery

Core · target · **partial** · From CYCLE-007 · Cites BASE-ROLE-001, BASE-MAIL-001

**Requirement.** A submission retains the chain version it entered, and pending review reaches only eligible reviewers. [Detailed semantics](docs/planning-semantics.md#cycle-007).

**Acceptance.**
1. A new chain saved mid-flight applies to the next submission; the current submission stays on its recorded version.
2. An explicit restart on the latest chain or chain deletion voids completed steps while keeping their history.
3. A pending-step notification reaches only that step's currently eligible reviewers.
4. Installation export/restore and filtered open exports retain chain configuration and history.

**Evidence.** `tests/approval-chains.test.mjs`; `tests/approval-chains-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A new chain saved mid-flight applies to the next submission; point 1: the current submission stays on its recorded version; point 2: An explicit restart on the latest chain or chain deletion voids completed steps while keeping their history; point 3: A pending-step notification reaches only that step's currently eligible reviewers; point 4: Installation export/restore; point 4: filtered open exports retain chain configuration; point 4: history. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Reporting

#### REPORT-001 — Saved report builder

Core · target · **partial** · Cites BASE-ROLE-001 · Rules D-1

**Requirement.** Permitted planners build saved, shared numeric reports over lines, dimensions, hierarchies, periods and planning versions. [Detailed semantics](docs/planning-semantics.md#report-001).

**Acceptance.**
1. At desktop width, build and save a department-by-quarter actual-versus-budget report with YTD, trailing-twelve-month, prior-year and year-over-year percentage columns, a department filter and a highlight rule.
2. A shared viewer's copy omits restricted detail through the API.
3. YTD and trailing-twelve-month values equal their component months, and year-over-year percentage equals actual minus prior-year divided by prior-year.
4. Saved reports feed dashboard tables and charts with personal layouts, audience filtering and aggregate formula Excel.

**Evidence.** `tests/saved-reports.test.mjs`; `tests/saved-reports-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: At desktop width; point 1: build; point 1: save a department-by-quarter actual-versus-budget report with YTD; point 1: trailing-twelve-month; point 1: prior-year; point 1: year-over-year percentage columns; point 1: a department filter; point 1: a highlight rule; point 2: A shared viewer's copy omits restricted detail through the API; point 3: YTD; point 3: trailing-twelve-month values equal their component months; point 3: and year-over-year percentage equals actual minus prior-year divided by prior-year; point 4: Saved reports feed dashboard tables; point 4: charts with personal layouts; point 4: audience filtering; point 4: aggregate formula Excel. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### REPORT-008 — Scheduled report delivery

Core · target · **partial** · From REPORT-001 · Cites BASE-ROLE-001

**Requirement.** Named recipients receive daily, weekly or monthly report copies in the saved company time zone. [Detailed semantics](docs/planning-semantics.md#report-001).

**Acceptance.**
1. A Monday-eight-AM Eastern weekly schedule sends finance and a viewer exactly one copy each under fake clock and mail edges.
2. Each recipient receives only the detail their current report grants permit.
3. The saved IANA zone, daylight-saving transition and scheduled versus actual dispatch instants are visible.

**Evidence.** `tests/saved-reports.test.mjs`; `tests/saved-reports-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A Monday-eight-AM Eastern weekly schedule sends finance; point 1: a viewer exactly one copy each under fake clock; point 1: mail edges; point 2: Each recipient receives only the detail their current report grants permit; point 3: The saved IANA zone; point 3: daylight-saving transition; point 3: scheduled versus actual dispatch instants are visible. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### REPORT-002 — Dashboards

Core · target · **partial** · Cites BASE-ROLE-001 · Rules D-1, D-2

**Requirement.** Dashboards hold KPI tiles, charts and tables from saved reports and metrics, such as revenue, gross margin, burn, runway, ARR, headcount and pipeline coverage. Layouts are saved per person and shared per audience (leadership, board, departments) and work at phone width. [Detailed semantics](docs/planning-semantics.md#report-002). REV-001 carries pipeline coverage, REV-002 imported ARR and REPORT-001 saved-report widgets.

**Acceptance.**
1. At 1440/390 finance creates runway, ARR and headcount tiles, saves and shares with board; rendered numbers equal API metrics.
2. Readers independently reorder/change tile/chart/table displays and reload saved personal layouts.
3. Every current metric's hand calculation, subscription-only ARR on mixed revenue lines, closed actual ARR unavailability, immutable frozen values, unavailable department cash, live membership/audience revocation, stale revision refusal, private Activity/open-export filtering and independently evaluated Excel formulas.

**Evidence.** `src/easel/dashboards.ts`; `tests/dashboards.test.mjs`; `tests/dashboards-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: At 1440/390 finance creates runway; point 1: ARR; point 1: headcount tiles; point 1: saves; point 1: shares with board; point 1: rendered numbers equal API metrics; point 2: Readers independently reorder/change tile/chart/table displays; point 2: reload saved personal layouts; point 3: Every current metric's hand calculation; point 3: subscription-only ARR on mixed revenue lines; point 3: closed actual ARR unavailability; point 3: immutable frozen values; point 3: unavailable department cash; point 3: live membership/audience revocation; point 3: stale revision refusal; point 3: private Activity/open-export filtering; point 3: independently evaluated Excel formulas. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### REPORT-003 — Board pack

Core · target · **partial** · Cites BASE-ROLE-001 · Rules D-2

**Requirement.** A board pack template contains statements, KPIs, charts, variance commentary, decisions and appendix tables. It is generated for a closed month or quarter, refreshed until published, and published as an immutable snapshot (as in `EASEL-014`). It exports as PDF, PowerPoint (.pptx) and Excel, and can be saved to [Chest](https://github.com/just-every/run-chest), Google Drive or SharePoint. Refreshing keeps the commentary that people wrote. [Detailed semantics](docs/planning-semantics.md#report-003).

**Acceptance.**
1. Generate a quarter pack in the browser, refresh it after a late adjustment with commentary kept, publish, download PDF, .pptx and .xlsx, and confirm through the API that the published numbers do not change after a later refresh; save the published pack to a Chest folder, a Google Drive folder and a SharePoint library through fakes, each holding a PDF with the same digest.

**Evidence.** `src/easel/pack-body.ts`; `src/easel/pack-template.ts`; `src/easel/pack-pdf.ts`; `src/easel/pack-pptx.ts`; `src/easel/pack-store.ts`; `src/easel/review.ts`; `src/ui/pack-tools.tsx`; `tests/board-pack.test.mjs`; `tests/board-pack-browser.mjs`
**Gap.** Quarter packs and immutable provider-edge saves are delivered. Qualified Base resolved-address and pinned-egress for Chest destinations remains required.

#### REPORT-004 — Linked PowerPoint and Word reporting

Core · target · **partial** · Cites BASE-ROLE-001

**Requirement.** PowerPoint and Word add-ins insert Easel tables, charts and single numbers into a deck or memo, and refresh them in place from a chosen version and period, under the person's role filtering. [Detailed semantics](docs/planning-semantics.md#report-004).

**Acceptance.**
1. An Office.js test host inserts a table and a number into a .pptx, refreshes after an Easel change, and sees the new values.

**Evidence.** `tests/saved-reports.test.mjs`; `tests/office-report-flow.mjs`; `tests/office-reports-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: An Office.js test host inserts a table; point 1: a number into a .pptx; point 1: refreshes after an Easel change; point 1: and sees the new values. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### REPORT-005 — Department budget-owner reporting

Core · target · **partial** · Cites BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Each department owner receives a monthly actual-against-budget statement after close, with source rows and current follow-up. [Detailed semantics](docs/planning-semantics.md#report-005).

**Acceptance.**
1. After a month closes, Engineering's contributor receives only Engineering's statement and a link to its variances.
2. The statement includes top variances, accepted rows, open tasks and explanations to confirm in the app and email.
3. Current department and Pay detail grants filter app reads, workbooks and each email recipient.
4. The captured statement and delivery records retain their closed-month values while current explanations and open-task states overlay app reads.

**Evidence.** `src/easel/department-statements.ts`; `tests/department-statements.test.mjs`; `tests/department-statements-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: After a month closes; point 1: Engineering's contributor receives only Engineering's statement; point 1: a link to its variances; point 2: The statement includes top variances; point 2: accepted rows; point 2: open tasks; point 2: explanations to confirm in the app; point 2: email; point 3: Current department; point 3: Pay detail grants filter app reads; point 3: workbooks; point 3: each email recipient; point 4: The captured statement; point 4: delivery records retain their closed-month values while current explanations; point 4: open-task states overlay app reads. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### REPORT-006 — Scheduled cash alerts

Core · target · **partial** · Cites BASE-ROLE-001 · Rules D-1

**Requirement.** Finance sets cash alerts: forecast lowest cash below the floor, actual or bank cash below plan by an amount or percent, and runway below N months. They are checked after every refresh and on a schedule. Each alert is sent once per breach by email and chat with the numbers, the cause and a link. It re-alerts only on worsening or after a set interval, and records when it was acknowledged. [Detailed semantics](docs/planning-semantics.md#report-006).

**Acceptance.**
1. With a fake clock, a bank fake and mail and Slack fakes: a refresh that drops forecast lowest cash below the floor sends one alert with the crossing month; bank cash $60,000 below plan under a $50,000 rule sends one alert, and a 10% rule fires the same way; runway falling to 11 months under a 12-month rule sends one alert
2. A second refresh with no change sends none
3. A refresh that worsens the breach re-alerts once
4. An unchanged breach re-alerts after the set interval (for example seven days) on the fake clock
5. acknowledgment is recorded.

**Evidence.** `tests/cash-alerts.test.mjs`; `tests/plaid-cash.test.mjs`; `tests/cash-alerts-browser.mjs`; `tests/notifications.test.mjs`; `tests/private-slack-browser.mjs`
**Gap.** Forecast, actual and reviewed bank alerts are delivered. Qualified Base resolved-address/pinned-egress and complete scheduled provider-source qualification remain incomplete; bank audience follows CONNECT-009.

#### REPORT-007 — Read-only warehouse driver inputs

Core · target · **partial** · Cites BASE-ROLE-001

**Requirement.** Reviewed Snowflake, BigQuery and Databricks metrics become driver actuals. RL-104 requires both dialect-aware query validation and a provider-enforced read-only role, with qualified Base resolved-address egress before external connections ship. [Detailed semantics](docs/planning-semantics.md#report-007).

**Acceptance.**
1. A warehouse-edge fixture supplies a monthly metric that drives an exact revenue-line amount.
2. Query validation and provider authority both establish read-only access; textual SELECT filtering alone is insufficient.
3. Credential custody, named audience, row/byte/time/provider-cost bounds and qualified connect-time egress retain the warehouse boundary.

**Evidence.** `src/easel/warehouse.ts`; `src/easel/warehouse-provider.ts`; `src/easel/warehouse-query-policy.ts`; `src/easel/dataset.ts`; `src/easel/bi-drops.ts`; `tests/bi-feeds.test.mjs`; `tests/bi-feeds-browser.mjs`
**Gap.** Validated warehouse queries and bounded previews are delivered. Provider-enforced read-only credential verification, detectable write-capability refusal, cost ceilings, connect-time resolution and qualified Base pinned-egress remain unproved; RL-104 does not waive these.

#### REPORT-009 — BI datasets and scheduled drops

Core · target · **partial** · From REPORT-007 · Cites BASE-ROLE-001

**Requirement.** Power BI, Looker and Tableau consume role-scoped planning datasets and scheduled CSV or Parquet drops. RL-104 requires each Pay-free export to recheck its named audience. [Detailed semantics](docs/planning-semantics.md#report-007).

**Acceptance.**
1. A scoped BI client receives actuals, plans and versions without Pay detail.
2. A nightly storage-edge drop contains CSV and Parquet rows equal to the dataset's rows, with no Pay detail.
3. Each export rechecks the named audience; credentials remain outside archives and owner-entered destinations require qualified Base egress.

**Evidence.** `src/easel/warehouse.ts`; `src/easel/warehouse-provider.ts`; `src/easel/warehouse-query-policy.ts`; `src/easel/dataset.ts`; `src/easel/bi-drops.ts`; `tests/bi-feeds.test.mjs`; `tests/bi-feeds-browser.mjs`
**Gap.** Scoped datasets and CSV/Parquet fixtures are delivered. Qualified external-drop egress, full named-provider qualification and the adopted live audience on every delivery remain incomplete under RL-104.

### Access, audit and governance

#### ACCESS-001 — Groups and per-dimension permissions

Core · target · **partial** · Cites BASE-ROLE-001, BASE-SIGNIN-001

**Requirement.** Finance creates groups (for example FP&A team, department heads, board) and grants read or edit by dimension member (department, entity, region), by scenario and by capability: compensation, connections, model structure, approvals and publishing. An access report shows who can see what. Before groups ship, ACCESS-001 inherits CYCLE-004: scenario read/edit group shares use current group membership on every read, comparison, export and write; membership removal ends access immediately. Before shipping, ACCESS-001 inherits REPORT-005: its ownership and group grants govern department-statement recipients, reads and exports, with recipient access rechecked before delivery. [Detailed semantics](docs/planning-semantics.md#access-001).

**Acceptance.**
1. Makes a group with edit on two departments and no pay access, adds a person, and confirms reads, writes and exports respect it
2. The access report lists it.

**Evidence.** `tests/groups.test.mjs`; `tests/groups-browser.mjs`; `tests/api-tokens.test.mjs`; `tests/compensation-access.test.mjs`; `tests/gauge-utilization.test.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Makes a group with edit on two departments; point 1: no pay access; point 1: adds a person; point 1: and confirms reads; point 1: writes; point 1: exports respect it; point 2: The access report lists it. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### ACCESS-002 — SSO and SCIM

Core · target · **partial** · Cites BASE-SIGNIN-001, BASE-ROLE-001

**Requirement.** SAML and OIDC sign-in and SCIM provisioning support Okta, Microsoft Entra ID, Google Workspace and Auth. RL-101 requires explicit configured identity associations and current native privilege grants; SCIM grants ordinary membership only, deprovisioning promptly removes live authority, and history retains attribution without restoring credentials. [Detailed semantics](docs/planning-semantics.md#access-002).

**Acceptance.**
1. An identity-provider fake signs in one explicitly associated person by SAML and another by OIDC.
2. SCIM provisions an ordinary person and group; adding and removing membership changes ACCESS-001 group grants.
3. Deprovisioning refuses the person's next request while their past submissions retain their name.
4. Neither just-in-time linking nor provisioning grants privileged native authority; configured identity associations and current native grants are required.
5. SAML/OIDC protocol refusals, archive-excluded identity custody, provider-association erasure and the ACCESS-001 grant intersections preserve the documented identity boundary.

**Evidence.** `tests/groups.test.mjs`; `tests/enterprise-identity-browser.mjs`
**Gap.** SAML/OIDC/SCIM fixtures and current group changes are delivered. All named IdP journeys, native-privilege/custody outcomes and the complete RL-101 boundary remain to be asserted and rejudged; the ruling is settled.

#### AUDIT-001 — Model audit trail

Core · target · **partial** · Cites BASE-AUDIT-001 · Rules D-1

**Requirement.** Planning changes retain actor, scenario, record, revisions before and after and changed values within the shared searchable audit. [Detailed semantics](docs/planning-semantics.md#audit-001).

**Acceptance.**
1. Changes by three people to setup, inputs, formulas, mappings, connections, permissions, submissions, approvals, closes and packs identify the planning record, scenario, before/after revisions and changed values.
2. Filtering by one person and scenario and exporting CSV retains those planning-specific fields.

**Evidence.** `src/easel/audit.ts`; `src/easel/audit-write.ts`; `tests/audit.test.mjs`; `tests/restore-flow.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Changes by three people to setup; point 1: inputs; point 1: formulas; point 1: mappings; point 1: connections; point 1: permissions; point 1: submissions; point 1: approvals; point 1: closes; point 1: packs identify the planning record; point 1: scenario; point 1: before/after revisions; point 1: changed values; point 2: Filtering by one person; point 2: scenario; point 2: exporting CSV retains those planning-specific fields. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### ERASE-001 — Person erasure

Core · target · **partial** · Cites BASE-DATA-003, BASE-DATA-006 · Rules D-2

**Requirement.** Erasing a former member pseudonymizes their planning history without losing financial amounts or the integrity of captured planning decisions. [Detailed semantics](docs/planning-semantics.md#erase-001).

**Acceptance.**
1. After a contributor who submitted and commented is erased, their name is absent from live views, pack downloads and installation export.
2. Submissions and immutable-snapshot reads show the stable pseudonym while planning amounts and stored snapshot digests remain unchanged.
3. The receipt includes erased planning-record counts and time.
4. The last finance member and installation owner cannot be erased; the member must first be deactivated.
5. Provider-scoped identities, payroll originals and restore use the documented erasure map without restoring credentials or recoverable erased personal data.

**Evidence.** `tests/erasure.test.mjs`; `tests/erasure-portability.test.mjs`; `tests/erasure-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: After a contributor who submitted; point 1: commented is erased; point 1: their name is absent from live views; point 1: pack downloads; point 1: installation export; point 2: Submissions; point 2: immutable-snapshot reads show the stable pseudonym while planning amounts; point 2: stored snapshot digests remain unchanged; point 3: The receipt includes erased planning-record counts; point 3: time; point 4: The last finance member; point 4: installation owner cannot be erased; point 4: the member must first be deactivated; point 5: Provider-scoped identities; point 5: payroll originals; point 5: restore use the documented erasure map without restoring credentials or recoverable erased personal data. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### API-001 — Public API with scoped tokens

Core · target · **partial** · Cites BASE-ROLE-001, BASE-INPUT-001

**Requirement.** Integrations use scoped, expiring personal or service credentials to read and revise planning records within the issuing person's planning authority. [Detailed semantics](docs/planning-semantics.md#api-001).

**Acceptance.**
1. A read-only credential reads a scenario and cannot write it.
2. Revoking that credential prevents its next read.
3. A write requires the current planning revision and token scope, and credential use appears in the planning audit.

**Evidence.** `src/easel/token-admin.ts`; `src/easel/token-auth.ts`; `tests/api-tokens.test.mjs`; `API.md`
**Gap.** Carried evidence establishes 5 audited outcomes. Complete assertion mapping remains owed for point 1: A read-only credential reads a scenario. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### API-002 — Webhooks and automation apps

Core · target · **missing** · Cites BASE-ROLE-001

**Requirement.** Signed webhooks fire on approval, close, publish, refresh failure, alert and task events. Published apps for [Crank](https://github.com/just-every/run-crank), Zapier and Make expose those triggers and the proposal and comment actions. [Detailed semantics](docs/planning-semantics.md#api-002).

**Acceptance.**
1. Register a webhook receiver fake, approve a budget, and receive one signed event with a verifiable signature; replaying it is detectable by its ID.
2. The Crank, Zapier and Make apps each run against a running Easel in that platform's developer test tooling (a local Crank installation, the Zapier Platform CLI, and a Make custom app in a test organization): a trigger receives an approval event, and a create-proposal action creates a proposal bound to the revision.

**Evidence.** None.
**Gap.** No webhooks or published automation apps

#### API-003 — MCP endpoint for outside agents

Core · target · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-007, BASE-ROLE-001

**Requirement.** The person's outside agent reads scenarios, comparisons, variances and metrics and performs planning actions through Easel's tool registry. Draft and comment work carries standard, outside contact external and binding approval, close, publication or promotion commitment; the company's policy decides each call. [Detailed semantics](docs/planning-semantics.md#api-003).

**Acceptance.**
1. A contributor's MCP client lists the planning tools, reads a variance and creates a proposal within that contributor's departments.
2. Under a company policy holding commitment calls, approval and promotion produce no effect until that policy's decision permits them.

**Evidence.** `tests/mcp.test.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A contributor's MCP client lists the planning tools; point 1: reads a variance; point 1: creates a proposal within that contributor's departments; point 2: Under a company policy holding commitment calls; point 2: approval; point 2: promotion produce no effect until that policy's decision permits them. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Entities, currency and US defaults

#### ENTITY-001 — Multiple entities and management consolidation

Core · target · **partial**

**Requirement.** A company plans several entities (for example a US C-corp and a services subsidiary), each with its own ledger connection (`CONNECT-001` to `CONNECT-004`, `CONNECT-011`), or several entities from one connection: a Sage Intacct multi-entity shared company or NetSuite subsidiaries. Easel shows consolidated P&L, balance sheet and cash with intercompany balances and charges eliminated by rules finance sets. Entity-level access uses `ACCESS-001`. [Detailed semantics](docs/planning-semantics.md#entity-001).

**Acceptance.**
1. Two entities with an intercompany management fee
2. Reads entity and consolidated statements in which the fee and the intercompany balance are eliminated and consolidated totals equal the sum less eliminations
3. The same holds when both entities arrive from one Sage Intacct multi-entity connection fake.

**Evidence.** `tests/entities.test.mjs`; `tests/entities-browser.mjs`
**Gap.** Native entity translation and consolidation are delivered. Provider-bound entity actuals and the Sage Intacct shared-company fixture require CONNECT-003/CONNECT-011; bound-source close still refuses an unpartitioned ledger.

#### ENTITY-002 — Multi-currency planning

Core · target · **partial**

**Requirement.** An entity plans in its local currency and reports in USD, using rate tables that finance keeps (budget rate, monthly average and month-end rates). Profit and loss converts at average rates, the balance sheet at month-end rates, and the translation difference is shown. Constant-currency comparisons are available. [Detailed semantics](docs/planning-semantics.md#entity-002).

**Acceptance.**
1. A CAD entity with budget and actual rates
2. Reads USD statements, a translation adjustment, and a constant-currency variance.

**Evidence.** `src/easel/translation.ts`; `src/easel/currency-rates.ts`; `tests/translation.test.mjs`; `tests/translation-browser.mjs`
**Gap.** Carried evidence establishes 2 audited outcomes. Complete assertion mapping remains owed for point 2: Reads USD statements; point 2: a translation adjustment; point 2: and a constant-currency variance. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### US-001 — US defaults

Core · target · **partial** · Rules D-1

**Requirement.** A new company defaults to USD with `$1,234.56` formatting, US English, MM/DD/YYYY dates, a January fiscal year with any other start month available, US time zones for schedules and reminders, and the US payroll and tax assumptions of `FIN-006` and `PEOPLE-004`. Files with US date and number formats import without extra choices. [Detailed semantics](docs/planning-semantics.md#us-001).

**Acceptance.**
1. Create a company without changing defaults and assert USD/$ formatting, en-US, MM/DD/YYYY, January and America/New_York; import a CSV with US dates and dollar/grouped/parenthesized amounts without extra format choices, preview without writes, commit and reload exact cents.
2. At 1440/390 inspect setup, the populated planning/review screens, department statements and the downloaded pack, then change and reload the owner-controlled preferences and prove date rendering follows them.
3. Also sets a July fiscal start and an alternative currency/US zone.
4. FIN-006/PEOPLE-004 carry statutory defaults and the named scheduled clauses carry actual company-zone delivery acceptance before shipping.

**Evidence.** `tests/us-defaults.test.mjs`; `tests/us-defaults-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: Create a company without changing defaults; point 1: assert USD/$ formatting; point 1: en-US; point 1: MM/DD/YYYY; point 1: January; point 1: America/New_York; point 1: import a CSV with US dates; point 1: dollar/grouped/parenthesized amounts without extra format choices; point 1: preview without writes; point 1: commit; point 1: reload exact cents; point 2: At 1440/390 inspect setup; point 2: the populated planning/review screens; point 2: department statements; point 2: the downloaded pack; point 2: then change; point 2: reload the owner-controlled preferences; point 2: prove date rendering follows them; point 3: Also sets a July fiscal start; point 3: an alternative currency/US zone; point 4: FIN-006/PEOPLE-004 carry statutory defaults; point 4: the named scheduled clauses carry actual company-zone delivery acceptance before shipping. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Move in and out

#### MOVE-001 — Move in from Adaptive Planning

Core · target · **partial** · Rules D-1

**Requirement.** Easel imports a Workday Adaptive Planning export (levels, accounts, dimensions and attributes, versions with their data, sheet exports, and the rows of modeled sheets), together with the buyer's mapping. The rows of the personnel or workforce modeled sheet, read through `exportConfigurableModelData`, become Easel positions under `EASEL-007` and `PEOPLE-004`: employees and to-be-hired rows alike, each with its level (mapped to a department), title, start and end dates, salary or hourly rate with hours, and the row's own bonus, benefits and merit assumptions where present. The account totals that the personnel sheet calculates (from `exportData`) are the check: the imported positions' monthly cost per payroll account must equal them for the same version, and any difference is shown before anything is accepted. Pay detail on imported positions is restricted under `EASEL-007` and `PEOPLE-005` from the moment of import, the preview included. Rows of other modeled sheets (for example a capital-asset sheet) are listed, and their account totals still arrive through `exportData`. The import previews what will be created, lists everything that did not map (formulas it cannot translate, modeled-sheet columns with no Easel equivalent, other modeled-sheet rows, access rules), and lands through the journal with undo. [Detailed semantics](docs/planning-semantics.md#move-001).

**Acceptance.**
1. A fixture export in the shapes of Adaptive's documented API calls (`exportLevels`, `exportAccounts`, `exportDimensions`, `exportAttributes`, `exportVersions`, `exportData` and `exportConfigurableModelData` for a personnel sheet) and a sheet export
2. The import report lists created levels, accounts and versions and the unmapped items; budget totals equal the export's totals.
3. The personnel-sheet fixture holds three employees and two to-be-hired rows, one row carrying a 10% bonus and a merit increase on a date, and one custom column with no Easel equivalent: the import creates five positions, two of them to be hired, whose monthly cost per payroll account equals the export's payroll-account totals for the same version to the cent, with the bonus and merit as traced components
4. The custom column is listed as unmapped
5. A viewer reads headcount and payroll totals through the API without names or salaries, in the preview and after acceptance
6. Undo removes the import, the positions included.

**Evidence.** `tests/workbook-undo.test.mjs`; `tests/payroll-erasure.test.mjs`; `tests/move-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A fixture export in the shapes of Adaptive's documented API calls (`exportLevels`; point 1: `exportAccounts`; point 1: `exportDimensions`; point 1: `exportAttributes`; point 1: `exportVersions`; point 1: `exportData`; point 1: `exportConfigurableModelData` for a personnel sheet); point 1: a sheet export; point 2: The import report lists created levels; point 2: accounts; point 2: versions; point 2: the unmapped items; point 2: budget totals equal the export's totals; point 3: The personnel-sheet fixture holds three employees; point 3: two to-be-hired rows; point 3: one row carrying a 10% bonus; point 3: a merit increase on a date; point 3: and one custom column with no Easel equivalent: the import creates five positions; point 3: two of them to be hired; point 3: whose monthly cost per payroll account equals the export's payroll-account totals for the same version to the cent; point 3: with the bonus; point 3: merit as traced components; point 4: The custom column is listed as unmapped; point 5: A viewer reads headcount; point 5: payroll totals through the API without names or salaries; point 5: in the preview; point 5: after acceptance; point 6: Undo removes the import; point 6: the positions included. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MOVE-002 — Move in from Planful

Core · target · **partial**

**Requirement.** Planful exports of the chart of accounts, segments, scenarios and data load the same way as `MOVE-001`, with a report of unmapped items, totals reconciled and undo. [Detailed semantics](docs/planning-semantics.md#move-002).

**Acceptance.**
1. The `MOVE-001` journey with a fixture in Planful's documented export shapes.

**Evidence.** `tests/workbook-undo.test.mjs`; `tests/payroll-erasure.test.mjs`; `tests/move-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: The `MOVE-001` journey with a fixture in Planful's documented export shapes. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MOVE-003 — Move in from Anaplan, Runway and Pigment

Core · target · **partial**

**Requirement.** Anaplan list and module exports, and Runway and Pigment CSV or Excel exports, load the same way as `MOVE-001`, with a report of unmapped items, totals reconciled and undo. [Detailed semantics](docs/planning-semantics.md#move-003).

**Acceptance.**
1. The `MOVE-001` journey with one fixture per product in its documented export shape.

**Evidence.** `tests/workbook-undo.test.mjs`; `tests/payroll-erasure.test.mjs`; `tests/move-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: The `MOVE-001` journey with one fixture per product in its documented export shape. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MOVE-004 — A parallel month against the old tool

Core · target · **partial** · Rules D-1, D-2

**Requirement.** For one closed month, Easel compares its actuals, budget and forecast with the buyer's old tool or spreadsheet for the same month, line by line. Each difference is classified (mapping, timing, formula or source data), and finance signs the comparison off before switching. Finance alone creates, reads, classifies and signs these comparison records (ct, 19 October). A normalized CSV uses existing planning line and department IDs and natural-sign decimal actual, budget and forecast amounts in the reporting currency; a blank department is allowed. Easel compares the union of line/department rows, treating an absent side as zero, to accepted actuals, the approved budget and the forecast kept before close. Finance supplies each classification and its explanation; Easel does not infer the cause. Preview writes nothing and save checks the reviewed content digest. Saved comparisons capture their values; signing checks the exact revision and SHA-256 and requires every difference to be classified, then freezes the values, classifications, original CSV and source digest with the signer and time. Later model edits do not alter the sign-off. The sign-off records finance's decision before an external switch; Easel does not switch tools. [Detailed semantics](docs/planning-semantics.md#move-004).

**Acceptance.**
1. With a fixture month from the old tool that differs on one mapping and one formula, the comparison lists exactly those two differences and records finance's sign-off.
2. The API asserts actual, budget and kept-forecast amounts, zero/missing rows, all four explicit classifications with explanations, no-write preview, exact digest/revision fences, restricted access, and signed persistence after model edits.
3. Finance uploads, previews, classifies and signs at 1440 and 390, then reloads the frozen record with source/comparison digests and attribution.

**Evidence.** `tests/parallel-month.test.mjs`; `tests/parallel-month-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: With a fixture month from the old tool that differs on one mapping; point 1: one formula; point 1: the comparison lists exactly those two differences; point 1: records finance's sign-off; point 2: The API asserts actual; point 2: budget; point 2: kept-forecast amounts; point 2: zero/missing rows; point 2: all four explicit classifications with explanations; point 2: no-write preview; point 2: exact digest/revision fences; point 2: restricted access; point 2: and signed persistence after model edits; point 3: Finance uploads; point 3: previews; point 3: classifies; point 3: signs at 1440; point 3: 390, then reloads the frozen record with source/comparison digests; point 3: attribution. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### PORT-001 — An export a buyer can open without Easel

Core · target · **done** · Cites BASE-DATA-001 · Rules D-1, D-2

**Requirement.** Besides the `rer export` archive, finance can download the whole plan as open files: one CSV per table, an.xlsx per scenario with formulas, the model definition as JSON, and every snapshot and original file, with a manifest of digests. [Detailed semantics](docs/planning-semantics.md#port-001).

**Acceptance.**
1. Download the open export, unzip it in the test, check every manifest digest, and open a scenario workbook whose totals equal Easel's.

**Evidence.** `src/easel/open-export.ts`; `tests/open-export.test.mjs`; `tests/open-export-browser-journey.mjs`
**Gap.** None.

### Anywhere

#### MOBILE-001 — Review and approve at phone width

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-ROLE-001 · Register R-1, R-2

**Requirement.** Every review, approval, submission, comment, explanation, dashboard and alert works in the browser at 390 pixels without horizontal scrolling. That includes approving a budget and promoting a proposal. This applies to every capability that exists today; future review, approval, submission, comment, explanation, dashboard and alert capabilities (`CYCLE-001` to `CYCLE-007`, `REPORT-001` to `REPORT-007`, `AGENT-001` to `AGENT-011`) inherit the same 390-pixel obligation before they ship. [Detailed semantics](docs/planning-semantics.md#mobile-001).

**Acceptance.**
1. S at 390 move in actuals, close a month and confirm an explanation (as today), and also submit a department, approve the budget, promote a proposal and read a dashboard, with an overflow check on every page.

**Evidence.** `tests/mobile.mjs`; `tests/browser-journey.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: S at 390 move in actuals; point 1: close a month; point 1: confirm an explanation (as today); point 1: and also submit a department; point 1: approve the budget; point 1: promote a proposal; point 1: read a dashboard; point 1: with an overflow check on every page. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### MOBILE-002 — Native iOS and Android apps

Core · target · **partial** · Cites BASE-ROLE-001, BASE-ACCESS-002, BASE-ACCESSIBILITY-001 · Register R-4

**Requirement.** Native iOS and Android clients provide sign-in, dashboards, alerts, tasks, approvals and comments. Under RL-103, opted-in devices bind the exact live native session and current record rights, send generic notices without financial contents, exclude device credentials from archives and erase local data and authority on sign-out. [Detailed semantics](docs/planning-semantics.md#mobile-002).

**Acceptance.**
1. An iOS simulator and Android emulator each sign in against Easel and display the native planning journey.
2. Each receives a cash-alert push from a provider fake and reviews and approves a pending proposal.
3. Opt-in and exact session/record authority gate alert, task, approval and mention delivery; generic notices contain no financial data.
4. Device credentials are sealed and archive-excluded, and sign-out removes local data, notifications and authority.

**Evidence.** `native/android/app/src/androidTest/java/com/runeditrun/easel/NativeJourney.java`; `tests/native-mobile-journey.mjs`; `tests/native-mobile-fixture.mjs`; `tests/notifications.test.mjs`
**Gap.** Android and both server push adapters are delivered. The complete iOS native sign-in/push/approval run remains missing; RL-103 settles device policy without changing status.

#### HOST-001 — Hosted operation on the buyer's Cloudflare account

Core · target · **partial** · Cites BASE-INSTALL-001, BASE-BACKUP-001, BASE-OPS-001 · Rules D-2

**Requirement.** Easel's hosted installation runs its planning loop, source scheduler and mail integration on the buyer's Cloudflare resources. [Detailed semantics](docs/planning-semantics.md#host-001).

**Acceptance.**
1. A disposable Cloudflare deployment with D1 runs Easel's native planning loop.
2. Its scheduled source refresh retains scheduler attribution without changing frozen planning values.
3. An invited recipient receives the planning invitation and completes native sign-in.
4. After hosted backup and restore, Easel's model, approvals, actuals, calculations, packs and snapshots agree with the source installation.

**Evidence.** `tests/hosted-deploy.mjs`; `tests/hosted.mjs`; `tests/hosted-mail.mjs`; `tests/hosted-backup.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A disposable Cloudflare deployment with D1 runs Easel's native planning loop; point 2: Its scheduled source refresh retains scheduler attribution without changing frozen planning values; point 3: An invited recipient receives the planning invitation; point 3: completes native sign-in; point 4: After hosted backup; point 4: restore; point 4: Easel's model; point 4: approvals; point 4: actuals; point 4: calculations; point 4: packs; point 4: snapshots agree with the source installation. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Agents that keep the plan feasible

#### AGENT-001 — Constraint watch

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** The planning watch detects breaches of agreed cash, runway, covenant and department limits and opens source-backed decisions without revising the forecast. A response that changes a binding planning decision carries commitment, decided by the company's policy. [Detailed semantics](docs/planning-semantics.md#agent-001).

**Acceptance.**
1. A provider-fake refresh slipping a large deal by two quarters breaks the cash floor and opens one decision item.
2. The decision names the crossing month and cites the deal ID and stage change.
3. The watch leaves the plan revision unchanged.

**Evidence.** `src/easel/agents/constraint-watch.ts`; `src/easel/agents/agent-evaluate.ts`; `tests/constraint-responses.test.mjs`; `tests/constraint-responses-browser.mjs`
**Gap.** Native cash/runway/covenant/department watches are delivered. Deal-ID and stage-change cause tracing needs REV-001; company-policy class computation and decisions remain unimplemented.

#### AGENT-002 — Feasible responses for the owner to choose

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** The specialist searches only owner-designated adjustable levers and ranks feasible planning responses with their impact and trade-offs. Drafting carries standard; promotion carries commitment, whose disposition is set by the company's policy. [Detailed semantics](docs/planning-semantics.md#agent-002).

**Acceptance.**
1. For a breached constraint, at least three proposals each restore the cash floor on full recalculation.
2. Every lever not designated adjustable is unchanged in every proposal.
3. The chosen response is promoted at the proposal and target revisions required by EASEL-012.

**Evidence.** `src/easel/agents/levers.ts`; `src/easel/agents/constraint-responses.ts`; `src/ui/constraints.tsx`; `tests/constraint-responses.test.mjs`; `tests/constraint-responses-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: For a breached constraint; point 1: at least three proposals each restore the cash floor on full recalculation; point 2: Every lever not designated adjustable is unchanged in every proposal; point 3: The chosen response is promoted at the proposal; point 3: target revisions required by EASEL-012. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### AGENT-003 — Asking owners for uncertain assumptions

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** The specialist asks source owners about uncertain assumptions and retains sourced answers, alternatives and escalation. Outside questions carry external, applying an internal assumption standard and a binding forecast decision commitment; the company's policy decides each. [Detailed semantics](docs/planning-semantics.md#agent-003).

**Acceptance.**
1. A Slack-fake question to the deal owner retains its source and the answer 'new date 15 January'.
2. Under the held company policy, the sourced assumption reaches the forecast through the reviewed proposal and exact-revision promotion.
3. An unanswered question escalates without inventing an answer or changing the assumption.
4. An owner can answer Yes, No or a new date, override with a recorded note, or stop a stale question with a reason.

**Evidence.** `tests/forecast-learning.test.mjs`; `tests/owner-questions-browser.mjs`; `tests/notifications.test.mjs`; `tests/private-slack-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A Slack-fake question to the deal owner retains its source; point 1: the answer 'new date 15 January'; point 2: Under the held company policy; point 2: the sourced assumption reaches the forecast through the reviewed proposal; point 2: exact-revision promotion; point 3: An unanswered question escalates without inventing an answer or changing the assumption; point 4: An owner can answer Yes, No or a new date; point 4: override with a recorded note; point 4: or stop a stale question with a reason. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### AGENT-004 — Learning from the company's own forecast errors

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · Rules D-2

**Requirement.** The specialist compares kept forecasts with actuals, separates timing, permanent and driver errors, and backtests revised stage probabilities, close-date and hire slippage, collection lag and churn assumptions. Drafts carry standard and adopted planning decisions commitment; the company's policy decides their disposition. [Detailed semantics](docs/planning-semantics.md#agent-004).

**Acceptance.**
1. A history whose deals close thirty-four days late produces a proposal for approximately thirty-four days of slippage.
2. The backtest over the last six to twelve kept forecasts shows lower error for the proposed assumption.
3. Under the held company policy, forecast changes await the exact-revision planning decision; kept forecasts and snapshots remain reproducible.

**Evidence.** `src/easel/agents/forecast-learning.ts`; `src/easel/agents/learning-measures.ts`; `src/easel/agents/learning-backtest.ts`; `src/easel/agents/learning-commands.ts`; `src/easel/agents/deal-outcomes.ts`; `src/ui/forecast-learning.tsx`; `tests/forecast-learning.test.mjs`; `tests/forecast-learning-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A history whose deals close thirty-four days late produces a proposal for approximately thirty-four days of slippage; point 2: The backtest over the last six to twelve kept forecasts shows lower error for the proposed assumption; point 3: Under the held company policy; point 3: forecast changes await the exact-revision planning decision; point 3: kept forecasts; point 3: snapshots remain reproducible. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### AGENT-005 — Source-change guard

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** Source review detects renamed or new accounts, changed dimensions, missing payroll, stale feeds and source-shape changes, showing reasoned mapping proposals and their impacts. Mapping and exclusion calls carry standard, whose disposition is set by the company's policy; incomplete source data cannot support conclusions. [Detailed semantics](docs/planning-semantics.md#agent-005).

**Acceptance.**
1. A refresh with a new software-like account proposes a mapping with its reason.
2. A missing payroll run appears in the review alongside the affected reports, scenarios, packs and alerts.
3. The dependent cash alert is visibly unavailable instead of being computed as zero or sent.
4. Under the held company policy, reviewed source decisions resolve the guard before normal conclusions resume.

**Evidence.** `tests/mapping-rules.test.mjs`; `tests/source-guard-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A refresh with a new software-like account proposes a mapping with its reason; point 2: A missing payroll run appears in the review alongside the affected reports; point 2: scenarios; point 2: packs; point 2: alerts; point 3: The dependent cash alert is visibly unavailable instead of being computed as zero or sent; point 4: Under the held company policy; point 4: reviewed source decisions resolve the guard before normal conclusions resume. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### AGENT-006 — Following decisions through to results

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · Rules D-2

**Requirement.** Decision follow-up links a published action to its forecast effect, owner and due date and compares approved assumptions with realized cash, revenue, headcount and capacity. Outside chases carry external and changes to binding decisions commitment, decided by the company's policy. [Detailed semantics](docs/planning-semantics.md#agent-006).

**Acceptance.**
1. A published decision delaying two hires to July retains the approved forecast effect.
2. The hiring manager receives a chase before the due date.
3. After July closes, follow-up reports realized payroll saving against the approved assumption.
4. Owners may revise or stop actions with a reason; under the held company policy a decision change follows its commitment decision.
5. Follow-up never changes the published pack, and aggregate results reveal no position titles or salaries.

**Evidence.** `src/easel/decision-followup.ts`; `src/ui/decision-followup.tsx`; `tests/decision-followup.test.mjs`; `tests/decision-followup-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A published decision delaying two hires to July retains the approved forecast effect; point 2: The hiring manager receives a chase before the due date; point 3: After July closes; point 3: follow-up reports realized payroll saving against the approved assumption; point 4: Owners may revise or stop actions with a reason; point 4: under the held company policy a decision change follows its commitment decision; point 5: Follow-up never changes the published pack; point 5: and aggregate results reveal no position titles or salaries. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

### Agents that explain and model

#### AGENT-007 — Variance commentary grounded in sources

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · Rules D-2

**Requirement.** The specialist explains material closed-month variances using visible ledger, deal, roster, bill and committed-spend evidence, separating evidence-backed claims from hypotheses. Drafting carries standard; a binding confirmation or publication carries commitment, whose disposition is set by the company's policy. [Detailed semantics](docs/planning-semantics.md#agent-007).

**Acceptance.**
1. A model-edge fixture returns an explanation citing existing visible row IDs.
2. An invented, out-of-month, out-of-line or out-of-department citation is refused.
3. Under the held company policy, an unconfirmed draft is absent from a published pack.
4. A later confirmation leaves an earlier published pack unchanged.

**Evidence.** `tests/variance-commentary.test.mjs`; `tests/commentary-model-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A model-edge fixture returns an explanation citing existing visible row IDs; point 2: An invented; point 2: out-of-month; point 2: out-of-line or out-of-department citation is refused; point 3: Under the held company policy; point 3: an unconfirmed draft is absent from a published pack; point 4: A later confirmation leaves an earlier published pack unchanged. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### AGENT-008 — Modeler agent

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · Rules D-1

**Requirement.** The modeler turns a natural-language request into a separate planning proposal, with structure/input diffs, formulas, moved cells and expected-value checks. Drafting carries standard, payroll data adds sensitive and promotion carries commitment; the company's policy decides each call. [Detailed semantics](docs/planning-semantics.md#agent-008).

**Acceptance.**
1. A model-edge request adds the named positions and drivers to a separate proposal with the corresponding differences and checked values.
2. Promotion by a person without model-structure permission is refused.
3. Under the held company policy, official scenarios change only after the commitment decision on the exact proposal revision.

**Evidence.** `tests/structure-versions.test.mjs`; `tests/modeler-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A model-edge request adds the named positions; point 1: drivers to a separate proposal with the corresponding differences; point 1: checked values; point 2: Promotion by a person without model-structure permission is refused; point 3: Under the held company policy; point 3: official scenarios change only after the commitment decision on the exact proposal revision. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### AGENT-009 — Analyst with cited answers

Core · push-further · **done** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** The analyst answers questions using visible cells, rows and deals and makes what-ifs as private scenarios. Read-only analysis and reversible what-ifs carry standard, regulated payroll data adds sensitive and outside sharing external; the company's policy decides each call. [Detailed semantics](docs/planning-semantics.md#agent-009).

**Acceptance.**
1. A viewer asking about payroll by department receives only visible totals.
2. A planted salary is absent from both the model-edge request and the rendered answer.
3. A what-if becomes a private sandbox under CYCLE-004 without changing the official source, and restricted salaries remain outside the answer.

**Evidence.** `tests/agent-governance.test.mjs`; `tests/agent-governance-browser.mjs`
**Gap.** None.

#### AGENT-010 — Recurring missions

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** A recurring mission runs a saved analysis on its schedule and delivers cited, labeled results to its named audience. Internal analysis carries standard and outside recipients add external; the company's policy decides mission creation, audience and delivery. [Detailed semantics](docs/planning-semantics.md#agent-010).

**Acceptance.**
1. With fake clock, mail and model edges, a weekly cash brief runs on Monday and reaches two named recipients.
2. A stale connector produces a stale-source notice instead of a model report.
3. The result retains the same citations, agent labels and reader visibility as AGENT-009.

**Evidence.** `tests/agent-governance.test.mjs`; `tests/agent-governance-browser.mjs`
**Gap.** Carried evidence establishes 6 audited outcomes. Complete assertion mapping remains owed for point 3: The result retains the same citations; point 3: agent labels; point 3: reader visibility as AGENT-009. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

#### AGENT-011 — Agent governance

Core · push-further · **partial** · Cites BASE-AGENT-007, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-002, BASE-AGENT-008

**Requirement.** Planning agents use the company-selected model and credential through the shared policy and planning audit. Their seed-specific activity includes constraint work, source review, questions, learning, commentary, modeling, analyses, missions and action chases; the company's policy decides each tool's declared classes. [Detailed semantics](docs/planning-semantics.md#agent-011).

**Acceptance.**
1. A model-edge planning run records the sponsoring person, chosen model and reserved provider-cost basis.
2. Under a company policy setting a provider budget, exhausting it prevents another cost-bearing call.
3. A person's stop action ends in-flight planning work and scheduled action chases.
4. Under a company policy holding commitment calls, an approval or promotion has no effect before that policy's approval.

**Evidence.** `tests/variance-commentary.test.mjs`; `tests/agent-governance.test.mjs`; `tests/decision-followup.test.mjs`; `tests/agent-governance-browser.mjs`
**Gap.** Carried evidence establishes 0 audited outcomes. Complete assertion mapping remains owed for point 1: A model-edge planning run records the sponsoring person; point 1: chosen model; point 1: reserved provider-cost basis; point 2: Under a company policy setting a provider budget; point 2: exhausting it prevents another cost-bearing call; point 3: A person's stop action ends in-flight planning work; point 3: scheduled action chases; point 4: Under a company policy holding commitment calls; point 4: an approval or promotion has no effect before that policy's approval. See docs/contract/DONE-AUDIT.md; no requirement is narrowed.

## Agent surface

### Agent surface

#### SURFACE-001 — Planning registry and public job parity

Agent surface · target · **partial** · From new · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-013 · Register R-7

**Requirement.** The planning registry covers this section's tool table and the stated import, connector, device, screen and installation exceptions.

**Acceptance.**
1. The discovered catalogue maps every Core clause to the corresponding planning tool or its stated non-tool reason, with the same possible risk classes as this table.
2. For a planning input, comparison, submission and published-pack fixture, tool results agree with the corresponding browser actions and the documented output shape.
3. A registry change updates the on-site specialist instructions and planning prompts together.

**Evidence.** `tests/mcp.test.mjs`
**Gap.** Existing MCP reads, proposal edits and native planning actions are delivered. The complete namespaced registry, Core mapping, public schemas, class metadata and shared two-policy harness remain missing.

#### SURFACE-002 — Planning and exposure class fixtures

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-007

**Requirement.** Easel classifies planning work from the target records and their audiences.

**Acceptance.**
1. An internal reversible draft, grid edit, model parameter or private what-if carries standard with the affected item count.
2. A message, report drop or newly visible share outside the company adds external with recipient count and known, new or public counterparty; moving content into an externally visible destination has the same result.
3. A budget approval, close, publication, sign-off, proposal promotion or department review decision carries commitment with the exact decision revision and planning value.
4. A financial forecast, debt plan or tax estimate carries no money class merely because its numbers describe money; Easel executes no payment, transfer or payroll run.
5. An argument or imported text claiming that an outside recipient is internal leaves those planning classifications unchanged.

**Evidence.** None.
**Gap.** No complete seed-specific conformance journey is implemented.

#### SURFACE-003 — Authority, credential and regulated-data class fixtures

Agent surface · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-008

**Requirement.** The specialist's administrative and regulated-data actions retain the planning-specific facts needed for the shared policy decision.

**Acceptance.**
1. Changing planning membership, Pay detail, scenario shares, group grants or integration authority carries access with affected people and whether authority widens or narrows.
2. Connecting or rotating provider credentials or changing protective identity settings carries security with the named provider or setting.
3. Erasing a former member's eligible identity carries destructive with its record count; touching regulated payroll, bank or identity records adds sensitive with kind and count.
4. An outside provider's personal OAuth consent, identity verification or hosted personal step adds gated naming the provider and step; a brokered company API route is classified on its actual facts instead.

**Evidence.** None.
**Gap.** No complete seed-specific conformance journey is implemented.

#### SURFACE-004 — Planning records, handoffs and specialist instructions

Agent surface · target · **missing** · From new · Cites BASE-AGENT-003, BASE-AGENT-010, BASE-AGENT-013

**Requirement.** Planning records and change events provide the finance specialist's source context without manufacturing an answer from an untrusted narrative.

**Acceptance.**
1. Resources cover scenarios, actual batches, positions, reports, review packs, tasks, decisions, connections and source observations at the corresponding templates below.
2. A closed-month event links the immutable planning version; a source-change event links its reviewed source observation and the affected planning records.
3. The planning prompts describe month close, budget preparation, source review and a cash-constraint response using the mapped Core jobs.
4. A source handoff from Pantry, Orbit, Willow, Lodge, Nectar, Gauge, Purse or Coaster retains the external record URI and results in a typed planning event for the receiving specialist.

**Evidence.** None.
**Gap.** No complete seed-specific conformance journey is implemented.

#### SURFACE-005 — A stranger specialist runs a planning week

Agent surface · target · **missing** · From new · Cites BASE-AGENT-007, BASE-AGENT-012, BASE-AGENT-013

**Requirement.** A stranger given Easel's URL completes a seeded finance week entirely through the planning door under two named company policies.

**Acceptance.**
1. The week reviews ledger and roster arrivals, prepares a budget, requests department work, compares a cash-floor response, closes a month and publishes its source-backed review pack.
2. Under the all-autonomous company policy, every declared class runs without a person waiting on or deciding a call, and the finished numbers reconcile to the fixture.
3. Under the held company policy, standard calls enter review and the other declared classes await the policy's named approver; the signed-in test person decides those saved revisions.
4. The resulting budget, source provenance, scenario comparisons, notifications and immutable pack match the same week's expected planning outcomes under both policies.
5. Repeating an interrupted import or planning decision yields one intended effect, and another department's payroll never appears in the specialist's results.
6. Provider failures leave the prior planning values available and report the affected source or conclusion explicitly.

**Evidence.** None.
**Gap.** No complete seed-specific conformance journey is implemented.

## Later

None.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass on the planning and public journeys | EASEL-017, MOBILE-001 | not run | | |
| R-2 | Independent VPAT for the planning and public journeys | EASEL-017, MOBILE-001 | not run | | |
| R-3 | Recorded Excel-on-the-web tenant run of live workbook functions and write-back | SHEET-001 | not run | | |
| R-4 | iOS and Android store approval/listing receipts | MOBILE-002 | not run | | |
| R-5 | Recorded Xero live demo-company tenant qualification | CONNECT-002 | not run | | |
| R-6 | Recorded Google Workspace test-domain qualification | SHEET-002 | not run | | |
| R-7 | Outside-agent client receipts in Claude, ChatGPT, Codex and Copilot | SURFACE-001 | not run | | |
