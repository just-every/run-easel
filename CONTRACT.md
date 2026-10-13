# Easel phase 1 contract

Easel (working name) helps one company's finance lead answer "Can we afford this plan, what changed, and which assumption must change?" with a reconciled operating forecast and a decision record. Phase 1 is the complete monthly planning loop for one entity in one reporting currency (AUD by default), with uploaded files and local storage only. It needs no provider account. Posted accounting truth stays in the accounting system; Easel holds assumptions, estimates, alternatives, approvals and the review record. It does not post journals, calculate payroll or tax, consolidate entities, convert currencies, evaluate spreadsheet formulas or run a model for arithmetic.

| ID | User-visible guarantee |
|---|---|
| EASEL-001 | Finance (the claimed owner and any Base admin) sets the company name, reporting currency, fiscal-year start and first plan month (twelve months), departments (shared or not), planning lines (revenue, cost of sales, operating expense; payroll or not) and people. Contributors are scoped to named departments; viewers read. A signed-in person without an active Easel membership sees no plan data. |
| EASEL-002 | An actuals CSV preview reads the file with the person's column, sign and date choices and shows months covered, per-account totals with a sign check, department totals, and every rejected row with its line number and reason (malformed date or amount, missing account, both debit and credit, an exact repeat of an earlier line, a row already accepted in another import). The preview writes nothing. |
| EASEL-003 | An actuals file is accepted only when every account maps to a planning line, the cash balance or an explicit exclusion, every department maps, the reviewed preview fingerprint still matches, and finance confirms the rejected rows stay out. Acceptance goes through the Base import-kit journal with the exact original bytes. Reconciliation shows, month by month, that imported = mapped + excluded + cash + unmapped, with unmapped accounts listed. |
| EASEL-004 | Undo of an accepted actuals import removes exactly the rows it wrote, through the journal. An import whose months a forecast has already closed cannot be undone; a correcting file is imported instead. |
| EASEL-005 | Each scenario's opening cash is either an estimate the person enters or the balance imported from accepted rows mapped to the cash balance before the first plan month, and every cash figure says which. Collections and payments follow explicit lags (months) plus opening receivables and payables; payroll is paid in its month. Each month's cash shows its arithmetic. |
| EASEL-006 | Revenue comes from volume × rate (with monthly growth) or customers × revenue per customer (with churn, new customers per month and new customers per hire in a named department, ramped by the recorded ramp rule). Every cell carries the arithmetic that produced it. Money is integer cents, counts are hundredths and every division rounds half away from zero once; the same inputs always produce the same cells. |
| EASEL-007 | Positions (named or to be hired) cost annual salary ÷ 12 × (1 + owner-supplied on-costs) from start to end month. Individual positions, salaries and the sources behind another department's numbers are visible only to finance and that department's contributors; viewers and other departments receive amounts with the detail removed by the server, and cannot change another department's inputs through any route. |
| EASEL-008 | Recurring and one-off expenses and imported monthly schedules feed their line and department. A shared department's costs are allocated to other departments by monthly headcount or fixed shares adding to exactly 100%; line totals never change and every allocated amount names its rule. Self, chained or unshared allocations, unknown lines or departments, and deleting a department or line still in use are refused. |
| EASEL-009 | Finance requests submissions from departments. A contributor revises only their own department's budget inputs while its submission is requested or returned, comments on their own department, and submits; a submitted department is locked until finance returns it with a reason. The full request/submit/return history is kept. |
| EASEL-010 | Finance approves the budget only at the exact revision reviewed and only when every requested department has submitted. Approval freezes the budget and stores an immutable snapshot (inputs, outputs, approver, time, revision, submissions, SHA-256) that the database refuses to change or delete. The forecast opens from the approved budget. |
| EASEL-011 | Finance branches any plan into a scenario (for example a downside with later hiring or higher churn) and compares two scenarios: monthly profit and closing cash side by side, every changed assumption, and every cell that moved. |
| EASEL-012 | A proposal is a copy of a working plan bound to that plan's exact revision. Its author (a contributor for their own departments, finance for any) changes it and submits it; finance promotes only the exact proposal revision reviewed, and only while the target is still at the bound revision. Otherwise nothing changes. Promotion records the target's revision before and after. |
| EASEL-013 | Finance closes the next month on the forecast once accepted actuals cover it. The forecast as it stood is kept as an immutable snapshot first; closed months then use actuals. For a closed month, each line and department shows actual against the approved budget and the kept forecast, with the accepted rows behind it, the budget sources, and a draft that marks any timing explanation as an unconfirmed hypothesis. Finance or the department's contributor writes and confirms the business explanation. |
| EASEL-014 | Finance creates a review pack for a closed month, records decisions and actions, and publishes it as an immutable snapshot binding the numbers, the approved budget and forecast revisions, the accepted source files with their digests, the explanations and the decisions. Every member, viewers included, can download it as HTML or CSV; it carries no individual pay detail. Action progress is recorded without changing the pack. |
| EASEL-015 | The Excel planning workbook kit reads an .xlsx sheet with Line, Department and month columns, uses each cell's cached value, keeps sheet, row, cell address and formula text as provenance, rounds to cents visibly, skips total rows, and requires every line and department to match or be mapped. It stages the workbook as a new scenario through the import journal; undo removes what it wrote and keeps any row a person has since edited (and what that row needs). |
| EASEL-016 | `rer export` writes the complete installation (model, actuals, journal and originals, approvals, kept forecasts, packs and activity); `rer import` refuses a non-empty destination or a corrupt archive and restores into a clean installation of the release that made it, which then shows the same model, approvals, outputs and packs and re-exports identical rows. |
| EASEL-017 | MIT source runs through `rer` install, setup, dev, build, preview, verify, reset, export, import, deploy --dry-run, describe and check, on TanStack Start, Hono and Cloudflare D1, with self-hosted IBM Plex Sans, Easel's theme on Base's installer and sign-in pages, and dev identity with finance, sales, engineering and board personas. Builds refuse the local dev layer. |

The package-mode upgrade starts from the installed data and migrations of the
earlier Easel application, before package mode. Migrations `0001` through `0007`
retain their original bytes; subsequent numbered migrations extend that schema.
The executed in-place upgrade retained all 495 original rows across 67 tables,
then passed native sign-in, role-filtered reads, saved-output comparison, writes
and repeated setup. Local people sign in again because Base now scopes local
cookies to their origin; their native session records are retained.

Restore preserves planning memberships and historical attribution, but excludes
native identities, sessions and credentials. The destination keeps its own
owner; membership alone cannot sign anyone in. Live `actorNames` projections
resolve only names available in the destination's native directory, while names
stored inside immutable snapshots remain unchanged.

A pre-upgrade export restores only with the release that made it. Keep a private
export and that release before upgrading. To recover, restore into an empty
installation of that release, upgrade that installation in place with `rer install`
and `rer setup`, then export again with the upgraded release. Do not import a
pre-upgrade export directly into a newer release.

Owner-specific acceptance (a real company's export and parallel month), hosted
deployment, accounting/HR/CRM connectors and hosted AI drafting are later phases
and are not claimed here.
