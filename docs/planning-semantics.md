# Easel calculation and door semantics



These details retain the calculation, import, custody and interoperability rules of the planning product. The contract links each capability to its corresponding section. Dated implementation receipts belong in CHANGELOG.md. The company policy in the contract governs agent dispositions; descriptions of shipped human-only review paths below record implementation boundaries, not agent policy defaults.



<a id="easel-001"></a>

## EASEL-001 — Setup, roles and membership



Finance (the claimed owner and any Base admin) sets the company name, reporting currency, fiscal-year start and first plan month (twelve months), departments (shared or not), planning lines (revenue, cost of sales, operating expense; payroll or not) and people. Contributors are scoped to named departments; viewers read. A signed-in person without an active Easel membership sees no plan data.



<a id="easel-002"></a>

## EASEL-002 — Actuals preview that writes nothing



An actuals CSV preview reads the file with the person's column, sign and date choices and shows months covered, per-account totals with a sign check, department totals, and every rejected row with its line number and reason (malformed date or amount, missing account, both debit and credit, an exact repeat of an earlier line, a row already accepted in another import). The preview writes nothing.



<a id="easel-003"></a>

## EASEL-003 — Mapped, reconciled actuals acceptance



An actuals file is accepted only when every account maps to a planning line, the cash balance or an explicit exclusion, every department maps, the reviewed preview fingerprint still matches, and finance confirms the rejected rows stay out. Acceptance goes through the Base import-kit journal with the exact original bytes. Reconciliation shows, month by month, that imported = mapped + excluded + cash + unmapped, with unmapped accounts listed.



<a id="easel-004"></a>

## EASEL-004 — Exact undo of an actuals import



Undo of an accepted actuals import removes exactly the rows it wrote, through the journal. An import whose months a forecast has already closed cannot be undone; a correcting file is imported instead.



<a id="easel-005"></a>

## EASEL-005 — Labeled opening cash and explicit cash timing



Each scenario's opening cash is either an estimate the person enters or the balance imported from accepted rows mapped to the cash balance before the first plan month, and every cash figure says which. Collections and payments follow explicit lags (months) plus opening receivables and payables; payroll is paid in its month. Each month's cash shows its arithmetic.



<a id="easel-006"></a>

## EASEL-006 — Exact revenue drivers with traces



Revenue comes from volume × rate (with monthly growth) or customers × revenue per customer (with churn, new customers per month and new customers per hire in a named department, ramped by the recorded ramp rule). Every cell carries the arithmetic that produced it. Money is integer cents, counts are hundredths and every division rounds half away from zero once; the same inputs always produce the same cells.



<a id="easel-007"></a>

## EASEL-007 — Position costs and restricted pay detail



Positions (named or to be hired) cost annual salary ÷ 12 × (1 + owner-supplied on-costs) from start to end month. Individual positions and salaries require the owner-granted Pay detail permission (`PEOPLE-005`); that grant lets finance see all departments and contributors only their own. The sources behind another department's numbers remain restricted to finance and that department's contributors; viewers and other departments receive amounts with the detail removed by the server, and cannot change another department's inputs through any route.



<a id="easel-008"></a>

## EASEL-008 — Expenses, schedules and visible allocations



Recurring and one-off expenses and imported monthly schedules feed their line and department. A shared department's costs are allocated to other departments by monthly headcount or fixed shares adding to exactly 100%; line totals never change and every allocated amount names its rule. Self, chained or unshared allocations, unknown lines or departments, and deleting a department or line still in use are refused.



<a id="easel-009"></a>

## EASEL-009 — Department submissions



Finance requests submissions from departments. A contributor revises only their own department's budget inputs while its submission is requested or returned, comments on their own department, and submits; a submitted department is locked until finance returns it with a reason. The full request/submit/return history is kept.



<a id="easel-010"></a>

## EASEL-010 — Exact-revision budget approval



Finance approves the budget only at the exact revision reviewed and only when every requested department has submitted. Approval freezes the budget and stores an immutable snapshot (inputs, outputs, approver, time, revision, submissions, SHA-256) that the database refuses to change or delete. The forecast opens from the approved budget.



<a id="easel-011"></a>

## EASEL-011 — Scenario branch and comparison



Finance branches any plan into a scenario (for example a downside with later hiring or higher churn) and compares two scenarios: monthly profit and closing cash side by side, every changed assumption, and every cell that moved.



<a id="easel-012"></a>

## EASEL-012 — Proposals promoted at exact revisions



A proposal is a copy of a working plan bound to that plan's exact revision. Its author (a contributor for their own departments, finance for any) changes it and submits it; finance promotes only the exact proposal revision reviewed, and only while the target is still at the bound revision. Otherwise nothing changes. Promotion records the target's revision before and after.



<a id="easel-013"></a>

## EASEL-013 — Month close and source-backed variance



Finance closes the next month on the forecast once accepted actuals cover it. The forecast as it stood is kept as an immutable snapshot first; closed months then use actuals. For a closed month, each line and department shows actual against the approved budget and the kept forecast, with the accepted rows behind it, the budget sources, and a draft that marks any timing explanation as an unconfirmed hypothesis. Finance or the department's contributor writes and confirms the business explanation.



<a id="easel-014"></a>

## EASEL-014 — Published review pack with decisions



Finance creates a review pack for a closed month, records decisions and actions, and publishes it as an immutable snapshot binding the numbers, the approved budget and forecast revisions, the accepted source files with their digests, the explanations and the decisions. Every member, viewers included, can download it as HTML or CSV; it carries no individual pay detail. Action progress is recorded without changing the pack.



<a id="easel-015"></a>

## EASEL-015 — Excel workbook move-in with provenance



The Excel planning workbook kit reads an .xlsx sheet with Line, Department and month columns, uses each cell's cached value, keeps sheet, row, cell address and formula text as provenance, rounds to cents visibly, skips total rows, and requires every line and department to match or be mapped. It stages the workbook as a new scenario through the import journal; undo removes what it wrote and keeps any row a person has since edited (and what that row needs).

### Portability and runtime



<a id="easel-016"></a>

## EASEL-016 — Complete export and clean restore



`rer export` writes the complete installation (model, actuals, journal and originals, approvals, kept forecasts, packs and activity); `rer import` refuses a non-empty destination or a corrupt archive and restores into a clean installation of the release that made it, which then shows the same model, approvals, outputs and packs and re-exports identical rows.



<a id="easel-017"></a>

## EASEL-017 — Owned runtime on Base



MIT source starts with one line, `npx -y @runeditrun/rer dev just-every/run-easel`, and the checkout runs through `rer` install, setup, dev, build, preview, verify, reset, export, import, deploy --dry-run, describe and check, on TanStack Start, Hono and Cloudflare D1, with self-hosted IBM Plex Sans, Easel's theme on Base's installer and sign-in pages, and dev identity with finance, sales, engineering and board personas. Builds refuse the local dev layer.

### Upgrade and restore rules for the published loop

The package-mode upgrade starts from the installed data and migrations of the earlier Easel application, before package mode. Migrations `0001` through `0007` retain their original bytes; subsequent numbered migrations extend that schema. The executed in-place upgrade retained all 495 original rows across 67 tables, then passed native sign-in, role-filtered reads, saved-output comparison, writes and repeated setup. Local people sign in again because Base now scopes local cookies to their origin; their native session records are retained.

Restore preserves planning memberships and historical attribution, but excludes native identities, sessions and credentials. The destination keeps its own owner; membership alone cannot sign anyone in. Live `actorNames` projections resolve only names available in the destination's native directory, while names stored inside immutable snapshots remain unchanged (subject to `ERASE-001`).

A pre-upgrade export restores only with the release that made it. Keep a private export and that release before upgrading. To recover, restore into an empty installation of that release, upgrade that installation in place by running `rer install` and `rer setup` inside that existing checkout, then export again with the upgraded release. Do not import a pre-upgrade export directly into a newer release.

## Target clauses

These clauses complete the category job alongside the published clauses. Each states the behavior a buyer gets, the acceptance evidence that proves it through a public door, and its current status. Every connector is read-only toward its source unless the clause says otherwise. Every connector keeps its credentials under `CONNECT-010` and feeds Easel through the same preview, mapping, journal and undo rules as the published file kits (`EASEL-002` to `EASEL-004`).

### Connected actuals



<a id="connect-001"></a>

## CONNECT-001 — QuickBooks Online actuals connector



Finance connects QuickBooks Online through Intuit OAuth 2.0 (accounting scope, read-only). Easel pulls the chart of accounts, classes, locations, departments, customers and vendors, and general-ledger detail by month for the profit-and-loss and balance-sheet accounts. The first connection backfills history: finance chooses 12 to 36 closed months (24 by default), and each backfilled month lands as its own reviewed batch with its own trial-balance reconciliation, so prior-year actuals are there to plan from (`MODEL-009`) and to report against (`REPORT-001, REPORT-008`). Each pull is previewed as a reviewed batch: rows by month, new or changed accounts and dimensions, and anything unmapped. It lands through the import journal with the provider's transaction IDs, so a re-pull of the same month is idempotent and a provider-side edit shows as a change rather than a duplicate. Monthly totals reconcile to the QuickBooks trial balance for the same period, and the difference is shown when they do not.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Before this connector ships, it inherits CONNECT-007, CONNECT-012: zero-sum ledger close, last-closed actual statement openings, explicit source-attributed prepaid/accrued/deferred/asset schedule openings, visible reconciliation differences, current authority and frozen captures. Its provider journey asserts those balances and allocations before shipping.

Current implementation semantics: native history review defaults to 24 separately accepted closed months, with the preceding source opening imported once. Explicitly empty months retain reviewed source-month records without invented journal rows. Intuit's fiscal-year report transfers are displayed separately from posted revenue. Same-transaction, same-account and same-dimension posting splits aggregate under a stable source identity; a changed transaction can therefore have paired debit and credit deltas. Zero-value observations without a posting account are visible exclusions requiring finance confirmation. OAuth state is one-use and native-session bound; an existing authorized company grant can also be connected. Accounting calls are allowlisted reads; token renewal and explicit provider revocation are the only OAuth writes.



<a id="connect-002"></a>

## CONNECT-002 — Xero actuals connector



Finance connects Xero through OAuth 2.0 (read-only accounting scopes). Easel pulls accounts, both tracking categories (mapped to departments or other dimensions under `MODEL-003, MODEL-011`), contacts and journals by month, with the same history backfill, preview, idempotent re-pull, change detection and trial-balance reconciliation as `CONNECT-001`.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Before this connector ships, it inherits CONNECT-007, CONNECT-012: zero-sum ledger close, last-closed actual statement openings, explicit source-attributed prepaid/accrued/deferred/asset schedule openings, visible reconciliation differences, current authority and frozen captures. Its provider journey asserts those balances and allocations before shipping.

Current implementation semantics: each month is explicitly previewed and accepted through the existing actuals journal. Initial source openings are imported once; empty months retain source review records. Both tracking categories are ordered by their stable source IDs: the first supplies source class rules and the second source tracking-option rules in Settings → Dimensions. Each maps independently to an existing custom dimension. Source journal line IDs retain correction identity. Xero fiscal report transfers remain separate from posted revenue. An OAuth callback accepts exactly one authorized organisation; an existing read-only grant requires an explicit authorized tenant ID. Native finance administration inherits CONNECT-010 and the same native-session boundary as CONNECT-001; credentials are sealed and excluded from portable archives. Accounting requests are fixed reads; renewal and explicit revocation are the OAuth writes.



<a id="connect-003"></a>

## CONNECT-003 — NetSuite actuals connector



Finance connects NetSuite through token-based authentication or OAuth 2.0 with a read-only role. Easel pulls accounts, subsidiaries, departments, classes and locations and posted transaction lines by period through SuiteQL, with the same history backfill, preview, idempotent re-pull, change detection and trial-balance reconciliation. Subsidiaries map to entities under `ENTITY-001`.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Before this connector ships, it inherits CONNECT-007, CONNECT-012: zero-sum ledger close, last-closed actual statement openings, explicit source-attributed prepaid/accrued/deferred/asset schedule openings, visible reconciliation differences, current authority and frozen captures. Its provider journey asserts those balances and allocations before shipping.

Before provider entity/subsidiary imports ship, inherit ENTITY-001 stable entity-to-source-plan mapping, per-entity currency/rates, entity-partitioned actuals and live entity/department access. Its multi-entity consolidation journey must prove the provider sources as well as the native sum-less-elimination result.



<a id="connect-004"></a>

## CONNECT-004 — Pantry actuals connector



A buyer on [Pantry](https://github.com/just-every/run-pantry) connects it through Pantry's API with a scoped read-only token, and gets the same history backfill, chart, dimension and journal pull, idempotency, change detection and reconciliation as `CONNECT-001`.

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Before this connector ships, it inherits CONNECT-007, CONNECT-012: zero-sum ledger close, last-closed actual statement openings, explicit source-attributed prepaid/accrued/deferred/asset schedule openings, visible reconciliation differences, current authority and frozen captures. Its provider journey asserts those balances and allocations before shipping.

The current native-finance API connects an installation-configured Pantry origin with explicit read consent, seals the credential outside archives, and records administration. Manual range previews retain posted entry IDs, revisions, account types and class, location and project metadata. The source must agree with the accrual general ledger and both boundary trial balances. Reviewed commits use the existing actuals journal, reusable mappings and explicit continuation or undo. A repeated unchanged pull adds nothing; reviewed amount corrections import only the difference. Changes to an accepted source account, date or dimension require explicit correcting-file review. Disconnect deletes the local secret and records the exact owner revocation step in Pantry; no remote revocation is claimed.



<a id="connect-011"></a>

## CONNECT-011 — Sage Intacct actuals connector



Finance connects Sage Intacct with a Web Services sender ID and a read-only web-services user, or through the Sage Intacct REST API with OAuth 2.0. Easel pulls the chart of accounts, entities (a multi-entity shared company maps its entities under `ENTITY-001`), the standard dimensions (location, department, class, project, customer and vendor), any user-defined dimensions, and general-ledger detail by period. Location and department map to Easel dimension members under `CONNECT-006` and `MODEL-003, MODEL-011`. It has the same history backfill, preview, idempotent re-pull by the provider's record number, change detection and trial-balance reconciliation as `CONNECT-001`, and drill-through links to the Intacct entry (`CONNECT-008`).

Before this connector ships, it inherits CONNECT-006: source account-type and dimension metadata feed the reusable mapping rules on initial backfill and every refresh; newly covered accounts are mapped and listed automatically, and uncovered or ambiguous accounts block only dependent conclusions without becoming zero.

Before this connector ships, it also inherits CONNECT-008: every accepted transaction row links to its provider transaction under the same server-side department filtering as file rows.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Before this connector ships, it inherits CONNECT-007, CONNECT-012: zero-sum ledger close, last-closed actual statement openings, explicit source-attributed prepaid/accrued/deferred/asset schedule openings, visible reconciliation differences, current authority and frozen captures. Its provider journey asserts those balances and allocations before shipping.

Before provider entity/subsidiary imports ship, inherit ENTITY-001 stable entity-to-source-plan mapping, per-entity currency/rates, entity-partitioned actuals and live entity/department access. Its multi-entity consolidation journey must prove the provider sources as well as the native sum-less-elimination result.



<a id="connect-005"></a>

## CONNECT-005 — Scheduled refresh with visible freshness



Each connection refreshes on a schedule finance sets (hourly, nightly or weekly, in the company's US time zone) and on demand. Refresh pulls data and metadata together. Every view shows each source's last successful refresh, and a source older than its schedule is marked stale wherever its numbers appear. A failed refresh keeps the previous data, shows the provider error and notifies finance (`CYCLE-003`). Before this capability ships, CONNECT-005 inherits CYCLE-003's notification rules for restatement notices and refresh failures to finance (each person's preference, record link, once per event and recipient). A provider-side change to a month that is already closed never silently changes closed numbers: it opens a restatement notice that lists the affected lines, packs and kept forecasts, and finance accepts or rejects it.

Before this capability ships, CONNECT-005 inherits US-001: schedules use the saved IANA company zone (America/New_York for new companies), including daylight saving time, with the zone visible and scheduled versus actual dispatch times recorded.

Before payroll/HR refresh ships, CONNECT-005 carries the connected provider roster pull through PEOPLE-001/PEOPLE-002, inheriting PEOPLE-006 explicit planned dates, unavailable day slippage for month-only starts, backfill/attrition/history obligations and ERASE-001 provider identity erasure on reads, retained observations and exports.



<a id="connect-006"></a>

## CONNECT-006 — Mapping rules that survive refresh



Account and dimension mappings are reusable rules, not only one-to-one picks. They cover a single account, an account-number range, a prefix or a provider account type to a planning line, the cash balance, a balance-sheet line or an exclusion, and a provider department, class or tracking option to an Easel dimension member. A new account that a rule covers is mapped automatically and listed. A new account that no rule covers blocks only the conclusions that depend on it, and is never treated as zero.

For current CSV sources, exact account picks override reusable rules. Number ranges are inclusive and compare digit-only account codes numerically, including leading zeros. Prefixes and account types match case sensitively after trimming surrounding spaces. Multiple rules with the same target agree; differing targets are ambiguous until finance resolves them, including by an exact pick. Optional account-type metadata comes from a selected CSV column. Each preview lists automatic rule matches and period completeness. EASEL-003 still requires the whole file to map before acceptance. An accepted period with unresolved account or department rows blocks calculations consuming that period, even when unresolved rows net to zero; its revenue and cost conclusions are absent, never zero. Earlier complete-period reviews and frozen snapshots remain available. Existing mappings continue to classify working actuals; changing rules never changes frozen arithmetic. Current CSV doors satisfy this obligation. CONNECT-001, CONNECT-002, CONNECT-003, CONNECT-004 and CONNECT-011 inherit provider refresh and metadata resolution; MODEL-003, MODEL-011 inherits custom dimension mappings and finer line/dimension dependency blocking; CONNECT-007, CONNECT-012 inherits balance-sheet targets, each before shipping.



<a id="connect-007"></a>

## CONNECT-007, CONNECT-012 — Balance-sheet actuals and the trial balance



Accepted actuals include month-end balance-sheet balances (cash, receivables, prepaid, fixed assets, payables, accrued liabilities, deferred revenue, debt and equity), not only profit-and-loss flows and the cash account. Each closed month shows a trial balance that sums to zero, and the forecast balance sheet (`FIN-001`) opens from the last closed month's actual balances. CONNECT-007, CONNECT-012 carries FIN-001: imported balances replace the corresponding opening estimates and reconcile the three statements, with visible traced differences rather than balancing plugs.

Balance-sheet actuals carry CONNECT-006: single-account, numeric-range, prefix and source-account-type rules can target every supported balance-sheet line, with automatic listing and dependency blocking for unresolved balances.

Imported balance-sheet openings carry FIN-002, FIN-008, FIN-009: imported operating prepaids, accrued payroll/bonuses and deferred revenue open the forecast subledgers with source attribution and traced statement reconciliation, instead of labeled estimates. Imported net fixed assets carry FIN-004: the accepted net fixed-asset balance, allocated to explicit asset origins with finance-entered remaining life, continues those schedules under FIN-004's straight-line cent and disposal rules.

Current reviewed CSV slice: balance-sheet targets include cash, receivables, prepaid, net fixed assets, payables, accrued liabilities, deferred revenue, debt and equity. Single-account and numeric-range/prefix/source-type rules use the same resolver as P&L mappings. CSV rows remain debit-positive posted journal movements, including an opening journal when needed; repeated month-end snapshots are not additive journal inputs. Each month-end review cumulatively sums accepted rows through that month. The trial balance includes all source accounts (P&L and explicitly excluded accounts included), presents debit and credit balances separately and tests their difference against zero. This is distinct from the existing classification reconciliation, which checks that every imported amount is accounted for. A zero-sum imported ledger does not certify source completeness. Asset balances are displayed debit-normal and liabilities/equity credit-normal. Account/type/department, source periods, row counts and import references remain attributed. Any unresolved cumulative account/department mapping makes balance conclusions unavailable, including zero-net unresolved accounts. All current actuals review and mapping doors keep their existing finance authority. A ledger with a balance-sheet mapping uses balance-sheet close enforcement: every cumulative mapping must resolve and debit minus credit must be exactly zero before any snapshot or close write. Published P&L-only extracts keep their existing flow; once a forecast has used a balance-sheet ledger, that requirement persists. Closed statements use accepted balances and separate imported equity from unclosed ledger P&L. Each open month rolls from the last closed balances using entered future movements. Unsupported or unexplained movements retain explicit statement/cash differences; there is no balancing plug or invented receipt.

Finance associates each imported prepaid, accrued-payroll/bonus, deferred-revenue or net-fixed-asset balance with explicit scenario input origins through `ledger-allocation` at the reviewed scenario revision. Allocations must equal the accepted target balance to the cent and retain the source accounts, periods, rows and import references. Changed source balances invalidate the review. Unallocated openings remain visible as unresolved schedule attribution rather than silently retaining estimated openings. Remaining prepaid service months amortize the imported balance in equal integer-cent installments, with the final month taking the remainder. Accrued openings replace the estimated opening component of the first entered future payroll/bonus settlement; no settlement date is inferred. Contract deferred openings adjust remaining recognition by the imported opening difference, apportioned over remaining service by largest remainder using the existing weights. Entered future invoices and collection dates remain unchanged; deferred and unbilled balances roll from the imported boundary. Negative remaining recognition is refused for review. Asset origins use the imported net balance and finance-entered remaining life, retain explicit disposals and use FIN-004's straight-line cent rules. These allocations copy with scenarios/proposals and freeze in snapshots. Member reads retain existing source/pay filtering; complete owner archives retain the allocation inputs. Current API and native statement/download doors conform; CONNECT-001, CONNECT-002, CONNECT-003, CONNECT-004 and CONNECT-011 inherit these semantics before shipping.



<a id="connect-008"></a>

## CONNECT-008 — Drill-through to the ledger transaction



Every actual cell drills to the accepted rows behind it (as `EASEL-013` does for files). For a connected source, each row also links to the transaction in QuickBooks Online, Xero, NetSuite, Sage Intacct or Pantry, under the same role filtering as `EASEL-007`.

All accepted CSV rows behind each variance cell are available, without an evidence sample cap, under the existing department filtering. Current CSV doors satisfy CONNECT-008. CONNECT-001, CONNECT-002, CONNECT-003, CONNECT-004 and CONNECT-011 inherit provider transaction links and their provider-fake follow-link journeys before shipping.



<a id="connect-009"></a>

## CONNECT-009 — Bank balances for current cash



Finance can connect bank accounts read-only through Plaid (balances and transactions). Current cash position and daily balance movement then feed the cash alerts (`REPORT-006`) and the 13-week view (`FIN-007`) between ledger closes, labeled as bank balances rather than ledger actuals. Easel never initiates a payment or transfer.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Current source semantics: finance explicitly approves read-only balances and transactions for one already-authorized Plaid item, selecting the fixed sandbox or production origin and entering its client credentials and access token in the native Connections form. Credentials are installation-sealed with provider-bound authenticated encryption, excluded from both open and portable archives, and represented only by a suffix. Administration/status require a current native finance session with company-wide access; finance API tokens retain aggregate bank-cash and cash-alert read parity under their live role and scope, without credential administration. Manual refresh reads current balances for every depository account in the item and a complete, paginated 30-day posted-transaction window. Credit and other non-depository accounts are excluded, pending transactions are excluded from movement, and only aggregate balance/count/currency and daily posted collections/payments/counts persist: account identities and merchant descriptions are not retained. All eligible accounts must have explicit current balances in one ISO currency; missing/duplicate/changed/incomplete sources refuse rather than become zero. A failed refresh retains the prior complete aggregate and blocks bank conclusions; an observation older than 24 hours also blocks until an explicit successful refresh. Neither refresh nor disconnect changes scenario inputs, revisions or frozen calculations. Disconnect asks Plaid to remove the item without redirect/retry and deletes local credentials on every outcome, retaining an honest unconfirmed owner action when removal is not confirmed. CONNECT-005 inherits scheduled refresh with these source, failure, authority and custody rules before shipping.

FIN-007's explicit bank basis opens from the observed current bank balance and schedules forecast cash starting the following UTC day. Historical posted movements never add to that balance again; earlier weekly adjustments are excluded. Currency mismatches, dates before that boundary, disconnected/restored credentials and captured versions refuse bank reads. Monthly reconciliation retains the visible bank-versus-monthly difference; planned and frozen cash remain available independently. REPORT-006's finance-only bank shortfall rules compare that observation with the approved budget's dated cash on the observation date, using strict amount/percent thresholds and existing once-per-breach, worsening, interval and acknowledgment rules; failed/stale/currency-mismatched sources block. Bank data is not ledger actuals and never closes a ledger month. No payment or transfer operation exists.



<a id="connect-010"></a>

## CONNECT-010 — Connection custody and status



Every connector credential (OAuth tokens, API keys, certificates) is stored encrypted, excluded from `rer export`, shown only by masked suffix, and removed on disconnect, which also revokes the token at the provider where the provider supports it. A Connections page lists each source with its scopes, owner, schedule, last refresh, row counts, errors and rate-limit state. Only finance connects, disconnects or changes schedules, and each of those actions enters the audit trail (`AUDIT-001`).

Future connector capabilities inherit these custody, status, finance authority and audit obligations before shipping: CONNECT-001, CONNECT-002, CONNECT-003, CONNECT-004, CONNECT-009, CONNECT-011, PEOPLE-001, PEOPLE-002, PEOPLE-003, REV-001, REV-002, SPEND-001, SHEET-001, SHEET-002 and SHEET-005. CONNECT-005 inherits connection schedule changes and their audit trail. Where a future provider's scoped credential supports remote revocation, disconnect performs it; otherwise the UI states the exact owner action still needed and never claims revocation. Gauge supports scoped-key self-revocation: disconnect posts the stored key to `/api/gauge/keys/revoke` at the origin that originally received it, without redirects or automatic retries. The local sealed key is deleted on confirmed, refused and unreachable outcomes. The audit trail and Connections retain the outcome, HTTP status and time without the provider response body or key. An unconfirmed outcome displays "Gauge did not confirm revocation; revoke it in Gauge Access". Credential administration and inspection require the approved native finance session with origin and revision/session fences; API tokens are refused. Explicit month health checks update refresh time, row count, errors and sanitized rate-limit status without importing utilization; import previews remain no-write reads.

### Flexible model



<a id="model-001"></a>

## MODEL-001, MODEL-010 — Configurable horizon and multi-year plans



Finance sets any fiscal-year start month and a plan horizon from 12 to 60 months, with monthly detail and quarter and fiscal-year roll-ups. Budgets can span one fiscal year or several. A 4-4-5 or 5-4-4 retail calendar is available as an alternative to calendar months.

Calendar-month plans and retail plans share 12–60 consecutive accounting periods. Retail setup chooses an explicit first date within the first plan-month key. The 4-4-5 or 5-4-4 pattern repeats each quarter in consecutive 52-week years, with no inferred 53rd week. Period boundaries are inclusive UTC dates; retail `YYYY-MM` keys are sortable ordinal aliases, not Gregorian months. Monthly driver inputs apply once per accounting period. Fiscal years are named by the ending year of their twelve ordinal period keys. Partial quarter/year roll-ups are marked. Flow amounts sum integer cents without another rounding; cash takes the first opening and last closing, summing only collections and payments.

Dated ledger rows, workforce observations, planned hire dates and Gauge date ranges use these accounting boundaries; explicit period-only CSV and workbook headings use period keys. Excel date-serial headings resolve their actual date. Contract service anniversaries and billing cadence remain Gregorian dates, with recognition split by actual service days at accounting-period boundaries and final-segment cent remainders preserved. DSO/DPO/curves use exact days from period-end invoices or dated contract invoices. Retail payroll pay days count from the target period's first day and clamp to its end; employer wage caps use the real calendar year of the earning period's end as a labelled planning convention. Calendar-month pay-day behavior is unchanged. Sales-tax remittance retains its Gregorian month lag from each actual collection date (or the target period end for period-only lag assumptions), then maps that date to an accounting period. The calendar and anchor are fixed after setup. A horizon edit advances affected working scenario revisions; approved budgets and kept versions retain their captured horizon, calendar and arithmetic, and opened forecasts inherit the approved horizon. Fiscal YTD resets after twelve periods.



<a id="model-002"></a>

## MODEL-002 — A rolling forecast that extends itself



Finance sets a rolling window (for example always 18 months ahead). Closing a month (`EASEL-013`) extends the forecast by one month and seeds the new month from its drivers, with the kept forecast snapshot taken first. Budgets keep their fixed fiscal horizon.



<a id="model-003"></a>

## MODEL-003, MODEL-011 — Custom dimensions and hierarchies



Beyond lines and departments, finance defines dimensions (for example entity, region, product, customer segment, project, class or location), each with a hierarchy of members and roll-ups. Inputs, actuals and reports can be cut by any dimension, and source dimensions map onto them (`CONNECT-006`). Lines get a chart-of-accounts hierarchy with subtotals.

Before custom dimensions ship, MODEL-003, MODEL-011 inherits MODEL-006: custom dimension-member presets in each of the four starter models with grid/report parity, asserted at 1440/390. Before custom dimensions ship, MODEL-003, MODEL-011 inherits MODEL-008, MODEL-013: grid rows, paste, selection tools, splits, notes, undo and current dimension-member authority at 1440/390. Before custom dimensions ship, MODEL-003, MODEL-011 inherits MODEL-005: each dimension/hierarchy definition and change has an exact version, readable diff and moved-cell list under existing authority; approved budgets, kept forecasts and published packs retain their captured structure and arithmetic. MODEL-003, MODEL-011 also inherits CONNECT-006: source departments, classes and tracking options map to their dimension members through reusable rules. Source dimension metadata also enables finer line/dimension-level dependency blocking, which remains a gap until this clause ships; unrelated conclusions remain available and unresolved inputs are never zero.

Current semantics: inputs carry stable dimension/member identities, including an explicit Unassigned bucket; rollups follow parent/child definitions without reposting or changing line totals. Account groups contain same-type child groups and lines. Shared allocations retain source dimension cents, including deterministic cent remainders. Exact/prefix source department, class and tracking-option rules resolve live on the existing reviewed CSV actuals door; conflicting targets remain unresolved. An unknown source member blocks the affected dimension/line/month while independent lines and known dimension cuts remain readable. Closed forecast actuals and frozen captures retain their source partitions. Existing department and Pay detail boundaries apply, with explicit member constraints checked again on grid apply and undo. CONNECT-001/002/003/004/011 inherit the same custom source mapping and dependency rules on their future provider doors; ACCESS-001 carries group grants.



<a id="model-004"></a>

## MODEL-004 — User-defined formulas and driver lines



Finance writes driver lines and formulas over named drivers, lines, dimensions and time: arithmetic, prior-period and offset references (including references to the Actuals version and other versions at an offset, `MODEL-009`), growth, lookups by dimension member, IF, MIN, MAX, ROUND and SUM over a dimension. Evaluation keeps the published arithmetic rules: integer cents, counts in hundredths, one rounding half away from zero per division, and a trace per cell. Circular references are refused with the cycle named. Every formula change is a revision that a proposal can carry (`EASEL-012`). Before user-defined formulas ship, MODEL-004 inherits MODEL-008, MODEL-013: formula cells remain read-only in the planning grid with their exact traces, including refused typing. Before user-defined formulas ship, MODEL-004 inherits REV-003: formula lines can drive revenue with exact cells and traces through HTTP, Plan and proposal doors, including the REV-003 formula-line revenue acceptance journey. Before user-defined formulas ship, MODEL-004 inherits MODEL-005: every definition and change has an exact structure version, readable formula diff and moved-cell list, and approved budgets, kept forecasts and published packs retain their captured definitions and arithmetic.

Native definitions are scalar drivers or named dimension/member expression tables, optionally posting money to a planning line. References bind stable driver, line, department and version identities when saved. `LINE` reads the final allocated and taxed line; `ACTUAL` reads accepted source cells and distinguishes accepted zero from missing data. `PRIOR` and signed offsets select periods; lazy `IF` can seed recurrences. Native multiplication and division each perform their scale division with half-away rounding to hundredths, separately from SHEET-003 workbook arithmetic. Source changes revise dependent working versions and invalidate submitted arithmetic; frozen versions keep captured definitions, external sources and results. Normal pack projections omit the private definition bundle retained by complete exports. All source and destination permissions use the existing department, Pay detail and scenario boundaries. [API.md](API.md#native-formulas-and-driver-lines-model-004) documents the syntax.



<a id="model-005"></a>

## MODEL-005 — Versioned model structure



Changes to model structure (dimensions, formulas, driver forms, mapping rules) are versioned with a readable diff of what changed and which cells moved. Approved budgets, kept forecasts and published packs keep the structure they were made with and never recompute.

Current editable structures conform: workspace/calendar and cash settings, lines, departments, account and department mappings, reusable account rules and every current driver/input form. Each fenced save appends a structure version to the existing finance-only Activity trail, identified by its sequence and source model revision, with actor/time, exact changed definitions, field differences, captured global definitions and affected working-scenario revisions and cells. Current formula changes mean changes to the fixed driver forms and their parameters. Cells use integer minor units; difference is after minus before in the same currency. An absent side or changed currency has no difference value. Incomplete sources are explicitly blocked, never substituted with zero. Frozen scenarios never recalculate; new approvals, kept forecasts, reforecasts and packs capture global definitions as well as their existing saved arithmetic, with individual inputs remaining under existing snapshot filtering. Journal-backed workbook imports and undo and MCP proposal changes also enter the version trail. Existing older immutable snapshots stay as captured. Ct approved current-capability completion on 19 October; MODEL-003, MODEL-011 inherits custom-dimension/hierarchy structure versions, and MODEL-004 inherits user-defined formula structure versions, readable diffs and moved-cell lists before either ships.



<a id="model-006"></a>

## MODEL-006 — Starter models for US small businesses



Setup offers starter models that a buyer edits rather than builds from nothing: SaaS (ARR, churn, CAC, seats), professional services (billable headcount, utilization, rate), project or backlog businesses, and wholesale or ecommerce (units, price, COGS, inventory days). Each comes with its drivers, lines, dimensions, dashboards and cash timing, in USD.

The four starters are installed atomically during initial company setup by the existing finance role, with a January fiscal year and explicit editable opening-cash estimate. Their input names and setup summary label every value as a starter assumption, never imported actuals. The blank-plan option retains its existing settings; US-001 remains responsible for general US defaults. Today's dimensions are named departments, including a dedicated billable services department; MODEL-003, MODEL-011 inherits starter dimension-member presets and their grid/report parity for all four starters before custom dimensions ship.

SaaS has independent customer/churn and seat products. Its acquisition expense follows new customers before churn (including ramped acquisition capacity) × entered CAC, with one division to cents; changing the acquisition driver or CAC recalculates cost. Services uses only active positions in its billable department. Project milestones and the separately labelled backlog are distinct revenue sources. Wholesale COGS follows the linked same-department units driver × unit cost. Its target closing stock is monthly COGS × inventory days ÷ that month's actual UTC calendar-day count, rounded half away from zero; opening stock is explicitly zero. Purchases are max(0, COGS + target − opening stock), and closing stock is opening + purchases − COGS, so excess stock is consumed before replenishment and no negative purchase implies a refund. Purchases follow the scenario's supplier payment lag, independently of inventory days. Estimated stock is an asset; indirect cash subtracts its increase and operating payables include unpaid purchases. The three statements and formula Excel reconcile exactly. Closed-month COGS uses accepted rows; unavailable COGS blocks rather than becoming zero, and inventory remains labelled a planning estimate until CONNECT-007, CONNECT-012 supplies balance-sheet actuals. Existing department-detail filtering applies to linked input terms and source traces; aggregates remain readable. All original starter forms and the added CAC/unit-cost/inventory-day forms are editable without formula entry, and approved/kept versions retain their captured arithmetic.



<a id="model-007"></a>

## MODEL-007, MODEL-012 — Recalculation at small-business scale



A model with 2,000 input rows, 5 dimensions and a 36-month horizon recalculates after an input change in under 2 seconds p95. Larger changes run as a visible background calculation, and the affected cells show as recalculating rather than stale-but-final.

The measured native API journey includes the complete save, exact structure-version effects and a fresh filtered recalculated read. Calculation-local indexes and exact source-cent dimension folds preserve source arithmetic without caching model results across requests. Native input/grid mutations above 2,000 input rows and larger reviewed workbook commit/continuation/undo operations return an accepted job. Affected reads carry job metadata without final figures; paused partial imports stay unavailable until explicitly continued or undone. Stored responses follow the initiating actor's current authority; an interrupted outcome requires inspection rather than automatic resubmission.



<a id="model-008"></a>

## MODEL-008, MODEL-013 — Planning grid entry



Finance and contributors enter budgets in a browser grid of lines (with their dimension members) by months for a scenario, limited to the cells they may edit (`EASEL-007`, `EASEL-009`, `ACCESS-001`). In the grid a person types into a cell or pastes a rectangular block copied from Excel or Google Sheets; the pasted cells are previewed, and any non-numeric or out-of-scope cell is refused with its address. They spread an amount across selected cells evenly, in proportion to the cells' current values, or in the shape of the same months' prior-year actuals (`MODEL-009`), with the cent remainder placed so the total is exact; or they change selected cells by a percent or an amount. They copy a value forward to later months. They split a cell into named sub-rows (for example one per vendor) that roll up to it, so the cell becomes their sum; sub-row detail follows the department's visibility, so finance and that department's contributors see it, and viewers and other departments see only the cell total. They add a note to a cell, kept with the cell's revision and shown in its trace. Cells that come from drivers or formulas show their trace and cannot be typed over. Each grid save is one revision fenced like every other save (a conflict returns 409), and undo restores the previous values of the cells it changed. At 390 pixels the grid scrolls inside its own frame with the line column pinned, and the page has no horizontal overflow.

The current grid edits entered schedule rows by line and department; its calculated totals remain read-only and show source traces. A rectangle is atomic: any invalid, out-of-plan, closed, driver-calculated or out-of-scope cell refuses the whole save with its address. Preview writes nothing; apply must match the preview fingerprint and exact scenario revision. Amounts are signed decimal money converted to integer cents. Even spreads use equal weights; proportional and prior-year spreads use absolute source amounts, refusing unavailable prior-year cells or all-zero weights. Largest remainders receive cents in selection order. Percent changes round half away from zero once per cell; amount changes add to each selected cell. Copy forward uses the focused entered value in selected later months. Split amounts sum to the entered cell; notes, split names and amounts retain existing department-detail filtering in inputs, traces and exports. Notes keep the saving scenario revision, actor and time. Undo restores exactly the most recent grid save's cells and metadata only while its resulting scenario revision is current, then consumes that undo; later scenario changes refuse undo rather than overwrite them. Existing approved/kept/published versions remain captured. These rules cover today's entered schedules and fixed drivers. MODEL-003, MODEL-011 inherits grid rows and authority for future custom dimension members; MODEL-004 inherits read-only formula cells and traces before those capabilities ship.

Acceptance evidence: `tests/grid.test.mjs` (MODEL-008, MODEL-013) asserts the complete arithmetic, no-write preview, exact fingerprint/revision, split/note traces, live authority, export filtering, driver refusal and undo through HTTP. `tests/grid-browser.mjs` (MODEL-008, MODEL-013) asserts the contributor's 3 × 12 paste, every selection tool, named splits and note, matching API values, trace, undo, refused addresses and pinned grid with no page overflow at 1440/390.



<a id="model-009"></a>

## MODEL-009 — Plans built from actuals history



Accepted actuals (from connectors or files) form an Actuals version that every plan can read. A plan line or driver can be defined from it at a time offset, for example the same month last year × 1.05 or the trailing three-month average, under the `MODEL-004` arithmetic and trace rules; each cell's trace names the actual cells it read. Finance can seed a new budget scenario from prior-year actuals by line and department in one step, with a growth percent per line, and the seeded inputs stay editable in the grid (`MODEL-008, MODEL-013`). Plan views and the grid can overlay actuals for closed and prior-year months beside the plan. A month with no accepted actuals is reported as missing, never read as zero.

The fixed Actuals-reference schedule form stores a source line/department, positive month offset (1–60), averaging window (1–60) and growth percentage (−100% to 1,000%). For target month M it reads M−offset and the window−1 months before it. It sums integer minor units, multiplies by (10000 + growth basis points), and divides once by (10000 × window), rounding half away from zero. An explicit accepted zero is valid. Every missing source cell, unresolved mapping or incomplete consumed import blocks with the source month; historical periods are checked even outside the current plan horizon, while unrelated periods do not block. Current contributor authority applies to both the target and source department. All working read, compare, export, proposal, approval, kept-forecast, reforecast, pack, metric and structure-version calculations use the same dependency preparation. Approved and frozen versions keep captured inputs, arithmetic and actual-history overlays; older snapshots without an overlay say it was not captured. MODEL-004 retains the general user formula language and references to other named versions.

Ct approved the identity rule on 19 October (14:32Z): seeding creates a genuine new working alternative budget, with one ordinary monthly schedule per line/department present in the prior-year history and complete source cells for every required month; unknown line growth settings are refused. Cash settings copy the existing budget's assumptions and remain estimates until reviewed. The existing budget and forecast are unchanged. Budget cycle explicitly selects which budget receives requests and approval; an alternative's approval opens its own forecast. Deliberately switching the installation's operating pair is outside MODEL-009; no such switch is claimed. Seeded cells are editable through a monthly grid, saved at the reviewed scenario revision with the native session/model fence; stale edits change nothing. Actual-reference cells remain calculated and show their sources. Current/prior-year overlays in both the grid and scenario view are aggregate line/department cells, missing or blocked values have no number, and Excel includes the same values with live difference formulas. MODEL-008, MODEL-013 retains paste, spreading, copy-forward, splits, cell notes and grid undo.

### Three statements and cash



<a id="fin-001"></a>

## FIN-001 — Linked P&L, balance sheet and cash flow



Every scenario produces a monthly forecast profit and loss, balance sheet and indirect cash-flow statement that link: net income flows to retained earnings, working-capital, capex and financing movements flow to cash, and the balance sheet balances every month. A visible check marks any month that does not balance, and its cause is traced. Current working scenarios and newly captured approvals/reforecasts conform; older immutable snapshots remain as captured and explicitly show when statements were not captured. Opening equity is a labeled estimate: opening cash + receivables + unbilled contract revenue + operating prepaids + net fixed assets + capital prepayments − deferred revenue − accrued payroll/bonuses − operating payables − capital payables − opening debt. Net income accumulates in retained earnings. Generic noncash expenses accumulate in a labeled other-noncash reserve; asset expenses reduce net fixed assets instead. Capital payments before service create capital prepayments; service before payment creates capital payables, which remain until paid. AR/AP movements follow existing monthly collection/payment timing, including settlement of opening AR/AP in the first month. Indirect operating cash is net income + noncash expense − increase in receivables − increase in unbilled revenue − increase in inventory − increase in operating prepaids + increase in operating payables + increase in deferred revenue + increase in accrued payroll/bonuses; investing cash is disposal proceeds − capex payments. Financing follows FIN-003, FIN-010: opening debt reduces the opening-equity estimate; planned draws, principal repayments and equity raises link cash and debt/contributed equity without being income. No balancing plug is applied: inconsistent closed-month depreciation versus the asset schedule leaves a visible difference with the month, source line and amounts. Under ct 19 October pattern 1, current capabilities complete FIN-001; CONNECT-007, CONNECT-012 inherits imported balance-sheet openings and reconciliation, FIN-002, FIN-008, FIN-009 inherits its deferred/prepaid/accrual statement movements, and FIN-003, FIN-010 inherits debt/equity/financing statement movements before each ships.



<a id="fin-002"></a>

## FIN-002, FIN-008, FIN-009 — Working-capital timing



Receivables follow days-sales-outstanding or a collection curve by revenue line, and payables follow days-payables-outstanding or payment terms by expense line. Annual-upfront billing creates deferred revenue that is recognized ratably, prepaid expenses amortize, and accrued payroll and bonuses settle on their pay dates. Opening balances come from actuals (`CONNECT-007, CONNECT-012`) or labeled estimates (`EASEL-005`). Before shipping, FIN-002, FIN-008, FIN-009 inherits FIN-001: every deferred-revenue, prepaid and accrued-liability movement links its profit recognition, balance-sheet balance and indirect cash-flow adjustment, with visible traced reconciliation checks.

Current working inputs and newly captured versions conform. Noncontract revenue and vendor invoices are assumed dated at calendar month end; DSO, DPO and vendor terms add exact calendar days (0–365 inclusive), independent of the displayed horizon. Collection curves have 1–24 positive installments, distinct days and shares totaling exactly 100%; largest-remainder cent allocation gives earlier installments priority on ties. Contract curves use their actual planned invoice dates, with the existing service recognition and upfront billing of REV-004. Without a new timing option, existing monthly cash conventions remain. Accepted aggregate rows with conflicting driver timing are visibly blocked until timing is consistent or attributed source data exists; they never silently choose a cash policy.

A prepaid expense carries total amount, service start, 1–120 amortization months and payment month at/before service start (at most 120 months earlier). Ordinary amortization installments floor to cents; the final month receives the remainder. An entered quarterly bonus amount accrues in three installments with the final cent remainder in the third; its first pay month is from the first quarter end through twelve months later, inclusive, and settlement repeats every three months at calendar month end. Salary and entered on-cost recognition retain EASEL-007 arithmetic; optional pay day 1–31 (clamped to month end) and month offset 0–3 determine settlement. Prior-horizon entered schedules establish labeled estimated openings, including ordinary monthly earned-payroll estimates. CONNECT-007, CONNECT-012 inherits imported prepaid/accrued/deferred openings and their reconciliation before it ships. Closing with a different accepted recognition amount retains accepted P&L and the known estimated payment/balance schedule, exposing the exact statement difference rather than creating a liability plug. The existing native/API/MCP proposal, revision, department/pay filtering, immutable capture and formula Excel doors apply; published packs capture aggregates only, and older immutable snapshots remain as captured.



<a id="fin-003"></a>

## FIN-003, FIN-010 — Debt and financing



Term loans, lines of credit and venture debt carry principal, rate (fixed, or variable over a stated base rate), draws, repayments and amortization schedules, with interest flowing to the P&L. Covenant tests (minimum cash, liquidity, debt-to-EBITDA) are computed every month. Equity raises are planned events. Before shipping, FIN-003, FIN-010 inherits FIN-001: debt draws/repayments and equity events link financing cash flows and balance-sheet debt/equity; interest links profit and operating cash, with visible traced reconciliation checks.

Finance alone creates, edits, removes and exports instrument terms and input records; members read aggregate funding, debt/equity and covenant outcomes (ct, 19 October). Instruments are planning assumptions, never arranged funding or executed payments. Opening principal is a labeled estimate at the first plan month. Beginning-month draws precede interest, which is principal after draws × annual basis points ÷ 120000, rounded half away from zero once and paid that month regardless of vendor terms. Variable rates name their reference and require an explicit base rate for every displayed month with principal; the annual rate is base plus margin, never a carried or invented rate. Extra principal is reserved before automatic repayments. Interest-only schedules clear principal at maturity. Equal-principal schedules use the principal at their first payment month, floor ordinary installments and put the cent remainder in the last installment; extra repayment caps later automatic installments, and later draws after the first installment are refused. Invalid dates, excess extra repayments and credit-limit breaches refuse the save. Schedules are independent of the displayed horizon's end.

Covenants apply each active month, including start and maturity. Minimum cash is closing cash; liquidity is closing cash plus all active undrawn credit. Minimums breach strictly below their threshold. Debt/EBITDA is total closing debt divided by 12 × (current-month net income + recognized interest + noncash expense), explicitly an annualized monthly estimate. Its maximum uses exact integer cross multiplication; equality passes. Positive debt with nonpositive EBITDA breaches without a fabricated numeric ratio; zero debt passes. Each result retains numerator, denominator, threshold, trace and first breach month. Accepted closed-month interest replaces the projected expense and operating cash once; schedule differences are visible. Principal and equity remain planned schedules until CONNECT-007, CONNECT-012 supplies their actual balances. Working inputs branch and travel in proposals under current authority, enter MODEL-005 structure versions, and freeze with approvals, kept forecasts and reforecasts. Published packs capture only aggregate funding/covenants. App and formula Excel exports apply the same filtering; older immutable snapshots remain as captured and disclose when financing was not captured.



<a id="fin-004"></a>

## FIN-004 — Capex and depreciation



Planned asset purchases by category depreciate straight-line over a useful life set per category. Disposals and existing fixed assets (from `CONNECT-007, CONNECT-012`) continue their schedules. Capex reaches cash in its payment month. Current purchased, opening existing and imported assets conform: `CONNECT-007, CONNECT-012` maps the accepted net fixed-asset balance onto explicit asset origins, each with finance-entered remaining life. Category useful life is in whole months. With zero residual value, each ordinary month depreciates the opening depreciable balance divided by its life, rounded down to integer cents; the final month takes the remaining cents. For an existing asset that balance is cost minus entered opening accumulated depreciation, spread over its entered remaining life. For an imported asset it is the net balance allocated to it at the last closed month, spread over its entered remaining life from the following month. Depreciation begins in the in-service month, inclusive. No depreciation is charged in the disposal month: book value is removed, proceeds reach cash and the book value minus proceeds is a gain or loss on the non-cash expense line. Non-cash lines, including accepted depreciation actuals, do not create cash payments. Purchases are paid in the explicit payment month (the in-service month when omitted). Categories and assets copy with scenarios and freeze with approvals; schedules appear in plan exports and published pack workbooks.



<a id="fin-005"></a>

## FIN-005 — Runway, burn and an agreed cash floor



Every scenario shows, by month, gross burn (cash paid out), net burn (cash paid out less cash received), months of runway (closing cash divided by the trailing three-month average net burn), the lowest cash month, and the cash-zero date (the first forecast month whose closing cash falls below zero). Finance records an agreed cash floor and runway minimum, which every scenario, proposal and comparison checks and marks where they are crossed. Money is in integer cents. The trailing window includes the current month and up to two preceding available plan months; no unavailable history is invented. Runway is rounded half away from zero once to hundredths of a month from the unrounded average; a negative ratio means cash is already exhausted. Nonpositive average net burn has no finite runway and is labeled “Not burning” for positive cash or “Cash exhausted” otherwise. Minimum checks use the unrounded ratio; equality meets the minimum. The earliest tied month is the lowest-cash month, and cash-zero searches only months after actuals-through. Current finance-agreed thresholds apply to saved and working cash without changing approved snapshots; a currency mismatch is explicitly not assessed.



<a id="fin-006"></a>

## FIN-006 — US tax estimates in the forecast



Employer payroll taxes are calculated per person under US rules with annual wage bases: Social Security, Medicare, FUTA, and SUTA at a state rate and wage base finance enters. Income tax is estimated at the federal rate plus a state rate, with a loss carryforward. Sales tax collected is a pass-through to cash that never counts as revenue. These are planning estimates, labeled as such, and never filings.

Before this capability ships, FIN-006 inherits US-001: provide US statutory payroll and tax defaults for a new US company, with the effective tax year and every planning-estimate label; retain finance overrides.

Current scenario estimates are enabled through the finance-only `tax-policy` HTTP/MCP input and use explicit effective-year assumptions. Defaults are 2026 employer Social Security 6.2% on $184,500, Medicare 1.45% without a cap or employer Additional Medicare share, and gross FUTA 6% on $7,000, before any credit. Finance may enter a credit-adjusted FUTA rate explicitly; no credit or state eligibility is inferred. SUTA's employer/state rate and wage base and the state income rate require explicit finance entry (zero is an explicit choice). The federal corporate planning rate defaults to 21%. Sources: [SSA wage bases](https://www.ssa.gov/oact/cola/cbb.html), [IRS Publication 15](https://www.irs.gov/publications/p15), [IRS Publication 542](https://www.irs.gov/publications/p542) and [IRS Form 1120 instructions](https://www.irs.gov/instructions/i1120). Assumptions remain held into future plan years until finance revises them; this is not a claim of future statutory verification.

Salary before entered on-costs is the taxable wage assumption. Each position is W-2 by default or explicitly 1099 (zero employer payroll taxes); PEOPLE-004, PEOPLE-008, PEOPLE-009 retains its additional compensation components and inherits applying these employer taxes to their taxable wages before shipping. Caps and cumulative liabilities reset each January. A continuing W-2 position in a partial first calendar year requires finance's prior year-to-date wages, rather than invented zero history. Monthly tax is the difference between rounded cumulative liabilities, so annual caps conserve cents exactly; each cumulative division rounds half away from zero. Employer taxes add to salary/on-cost expense and follow the position's existing pay-date treatment. Entered on-costs remain additional assumptions, with an explicit reminder to avoid double counting.

Income tax uses accounting profit before income-tax expense as a labeled approximation of taxable profit. Entered opening losses and later negative months carry forward; positive profit consumes losses up to the finance-entered allowance (80% by default), then the combined federal/state rate applies with one half-away rounding. The dedicated income-tax expense line is paid in its recognition month as a planning assumption; accepted closed-month expense retains precedence. Sales tax uses the entered uniform rate on revenue invoice collections (including the existing dated contract/DSO/curve conventions), rounds each collection once, enters cash and a separate payable, and remits after the entered 0–12 calendar-month lag (one month by default). It never changes revenue. The payable and its movement appear in the linked balance sheet, indirect cash flow and formula Excel, including prior-horizon collected tax still awaiting remittance. Taxability, returns and actual tax payments are not inferred. Existing native pay/department filtering, proposals, immutable captures and exports apply.



<a id="fin-007"></a>

## FIN-007 — 13-week cash forecast



A weekly direct cash view for the next 13 weeks is built from open receivables by due date and expected payment behavior (each customer's average days late from its paid-invoice history, or a collection curve finance sets), open payables and bills by due date, payroll on its run dates (from the payroll connection or file, `PEOPLE-001` and `PEOPLE-007`, or a pay schedule finance sets), debt service on its schedule (`FIN-003, FIN-010`) and planned spend in its planned week. Finance can override any week with a note, and the view reconciles to the monthly forecast at month ends.

The current planned-cash slice reads the same dated contract collections, collection curves, DSO/DPO and entered payroll pay days as the monthly forecast. It shows thirteen consecutive seven-day windows from an explicit first UTC date; dates are inclusive. Monthly-only cash assumptions use accounting-period end, except debt draws at period start, and weeks containing them say that dates are assumed. Opening cash rolls the plan opening through all earlier scheduled events. A finance override is a signed cent adjustment with a required note, settling on its selected week's final day; saving that same week replaces its prior adjustment, including an explicit zero to cancel. Later windows carry earlier adjustments. Overrides change only the weekly view; the accounting-period-end reconciliation displays monthly forecast, dated schedule, cumulative overrides, weekly closing and the difference rather than hiding a mismatch. Formula Excel exports carry the same weekly and reconciliation amounts, with live closing and difference formulas. Current scenario, membership, finance edit and immutable-version rules apply. All readers receive aggregate cash amounts without input identities or individual pay detail. Weeks beyond the captured horizon are unavailable, and older frozen versions without dated cash show an explicit unavailable message rather than invented zeroes.

Finance can place a cash, non-payroll one-off expense on an explicit planned payment date within its earned accounting period, including retail periods. The date replaces that expense's monthly-lag assumption, puts its entire signed amount in its selected week once, and uses that same dated event in the monthly forecast. Blank/default timing keeps existing monthly-lag behavior. It is a planning estimate, not a vendor bill or executed payment. Conflicting vendor days, invalid dates, dates outside the expense period and dated recurring/noncash/payroll inputs refuse atomically. Accepted aggregate actuals use the date only in that expense's accounting period; differing timing policies on the same aggregate cell require review rather than guessing an allocation. Approvals retain the captured date and cash arithmetic.

Finance can enter an optional second payroll pay day later than the first (both 1–31) with the existing zero-to-three-period offset. Regular earned payroll, including on-costs, benefits, match, commissions and employer-tax estimates, splits into two equal cent installments; the first receives an odd-cent remainder. Each date independently clamps to the target period end, so two dates that clamp to the same date combine without losing cents. Calendar-month schedules are semimonthly; retail-calendar days retain MODEL-001, MODEL-010's one-based target-period semantics. A position bonus and its incremental employer taxes still settle once on the first pay day of the bonus period, without the regular offset. Prior earned regular payroll remains an opening accrual until both installments settle. This is a finance-entered planning schedule, not a provider payroll run or a payment.

The current Pantry source preview (`POST /api/easel/pantry/cash`) reads current open invoices and bills with explicit read scopes. It dates an invoice from its customer’s fully paid invoice history, rounds average nonnegative late days once to the nearest day, and places a bill on its due date. Reversed payments do not count as paid history. Missing history and past expected dates remain unresolved; no date is invented. The observation date must be today in UTC because current balances cannot reconstruct historical open items. This door is a no-write source preview; the combined native review consumes its exact fingerprint.

The native-finance read-only `POST /api/easel/pantry/cash-forecast` combines the reviewed source with a working scenario. Its fingerprint and scenario revision must still match. Finance explicitly accounts for every source cent as a replacement of reviewed dated planned cash or additional cash; dates cannot repeat and replacements cannot exceed the planned amounts. No identity match is inferred. The preview preserves other payroll, debt and spend events and noted weekly adjustments, shows monthly differences and returns the same formula Excel with `format: "xlsx"`. It changes no model, stored source or captured version. Plan opening cash rolls through the observation date; a chosen bank basis requires a bank observation on that same date. Forecasting starts the next day. Missing history or overdue items refuse the combined preview rather than disappearing. The existing named Pantry open-item test in `tests/weekly-cash.test.mjs` proves combined ledger and two-account bank fakes, replacements without duplicates, semimonthly payroll, loan payments, planned spend, noted overrides, monthly reconciliation, formula Excel, revision and source fences, finance authority and immutable captures.

Finance reviews the combined forecast in Overview by selecting Pantry open items under Cash sources. The review shows dated source items, invoice paid-history lateness, aggregate dated planned cash and explicit replacement amounts. Finance accounts for additional source cash separately; no match is preselected. Changing allocations clears the combined result. Source reads and formula Excel recheck the fingerprint and scenario revision; failures clear the prior result and require explicit review. The bank basis displays its observation date, account count and opening balance. The native review is limited to the existing company-wide native finance audience; no new bank audience is introduced.

### Headcount and compensation



<a id="people-001"></a>

## PEOPLE-001 — Roster and payroll actuals from Gusto



Finance connects Gusto (OAuth, read-only). Easel pulls employees and contractors, with department, title, employment type (W-2 or 1099), compensation, start and termination dates, and payroll run totals by employee. The roster is reconciled to planned positions: matched, unplanned hires, planned but not hired, and changed salaries. Payroll actuals reconcile to the ledger's payroll lines. Pay detail stays under `EASEL-007` and `PEOPLE-005`.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.



<a id="people-002"></a>

## PEOPLE-002 — Roster from Rippling, Willow, BambooHR and ADP



The same roster pull, reconciliation and restriction as `PEOPLE-001` from Rippling, [Willow](https://github.com/just-every/run-willow), BambooHR and ADP Workforce Now, with each provider's own fields mapped and anything unmapped listed.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.



<a id="people-003"></a>

## PEOPLE-003 — Open roles from the ATS



Open requisitions from [Lodge](https://github.com/just-every/run-lodge) or Greenhouse become to-be-hired positions with department, level and target start. An accepted offer updates the position's name, salary and start date as a proposal for finance (`EASEL-012`), and a closed requisition proposes removing the position.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

The Greenhouse option uses fixed Harvest GET endpoints and complete bounded pages. Finance selects a job, its numeric opening when there is more than one, the mapped department and payroll line. The job's `level`, `target_start_date` and annual USD currency field `annual_salary` supply the planned role. Accepted offers use Harvest `starts_at`, candidate name and the annual USD currency field `annual_salary` (or `salary` with an explicit `salary_period` of `year`). Free-text salary, unknown units, missing fields and ambiguous offers block instead of being guessed. A closed job, or an unfilled closed opening, proposes removal; a filled opening in an open job retains its accepted offer. Stable job and numeric opening IDs survive native position edits. Existing compensation assumptions remain on updated roles; new roles capture department defaults. Annual salary changes to a position changed manually to hourly require explicit manual reconciliation.

Every observation is a no-write preview. The reviewed source digest, mapping and current plan revision are refetched before creating a draft proposal; duplicate reviewed proposals are refused. Submit, compare, promote and decline use the existing EASEL-012 doors, human finance authority and exact proposal and target revision fences. No observation silently changes the official plan. Native company-wide finance with Pay administers and previews the connection; service actors and API tokens are refused. Candidate names and pay stay in existing filtered position inputs, not shared scenario metadata. Connect, manual health check, proposal creation and disconnect are audited. Settings shows the masked suffix, scope, owner, manual schedule, last successful read, row count, sanitized errors and rate-limit state. Disconnect always deletes the sealed archive-excluded key and explicitly instructs the owner to delete the Harvest key in Greenhouse API Credential Management; it never claims remote revocation.



<a id="people-004"></a>

## PEOPLE-004, PEOPLE-008, PEOPLE-009 — US compensation assumptions



Each position or person carries salary or hourly rate with expected hours, W-2 or 1099 type, merit increases on a date, bonus (percent of salary, paid in a month), sales commission (rate on REV-004 contract bookings now and weighted pipeline bookings from `REV-001` when it ships), benefits per head per month, 401(k) match, and employer taxes from `FIN-006`. On-cost defaults are set per department and overridden per position. Each cost traces to its components.

Ct scope-review-61 (21 October 2026) also permits commission now on REV-004 bookings through an explicit contract `commissionPosition` link to a same-scenario position origin and that position's `commissionRateBps`. The planning estimate is contract cents × basis points ÷ 10000, rounded once half away from zero, expensed in the booking's start period on the position department/salary line, with existing payroll cash timing. W-2 commission enters FIN-006 taxable wages and caps; 1099 adds no employer tax; on-costs do not apply. Traces disclose that ASC 340-40 capitalisation is not modelled. Missing, cross-scenario or inactive position links and edits orphaning a link refuse with 409. Frozen captures retain link, rate and arithmetic. The rate, link, per-position amount and trace component are PEOPLE-005 pay detail; restricted readers see only department totals. Every surface labels it a planning estimate. Quota, attainment and tiered accelerators use the exact marginal rules below. A 401(k) match must state whether commission enters its base. The explicit REV-004 commission planning estimate now ships through native Plan, HTTP and MCP proposal doors, proved by `tests/people-comp.test.mjs` and `tests/people-comp-browser.mjs` (PEOPLE-004, PEOPLE-008, PEOPLE-009, including PEOPLE-005 filtering and 1440/390 forms, traces and comparisons). Its linked position must use a cash salary line; changing that line to noncash or orphaning the link is refused. The existing Pay detail and department grants apply to link administration as well as reads. PEOPLE-004, PEOPLE-008, PEOPLE-009 is done for current contract bookings; REV-001 carries weighted-pipeline commission and the same quota/attainment/accelerator rules before shipping. No commission payment or statutory filing is executed.

The base-compensation slice also ships through the same native Plan, HTTP and MCP doors. A position chooses salary (the existing annual cent-conserving schedule) or hourly pay: rate in cents × expected hours in hundredths per active accounting period ÷ 100, rounded once half away from zero. Hourly on-costs are a separately once-rounded percentage of those wages. Salary and hourly inputs are mutually exclusive; use zero annual salary for hourly pay. The expected hours and entered benefits per head apply once in every active period, including a four- or five-week retail period; no daily or overtime allocation is inferred. Entered monthly benefits and the employer 401(k) match estimate add to cost. The match is salary or hourly base wages × the entered match rate, rounded once half away from zero, excluding commission; it does not infer employee elections, eligibility or statutory limits. Benefits and employer match are additional employer-cost assumptions, excluded from FIN-006 taxable wages and on-costs. All these components follow the position's existing earned-period/pay-date cash timing and appear in traces; continuing prior-period service also carries them into estimated opening payroll accruals. Existing FIN-006 employer taxes still apply to salary/hourly wages plus commission, with 1099 taxes zero. All inputs, component traces, proposals, frozen arithmetic and formula exports inherit PEOPLE-005 filtering. `tests/people-comp.test.mjs` and `tests/people-comp-browser.mjs` name and exercise these base-compensation components. No statutory benefit or retirement compliance, payroll execution or payment is claimed.

PEOPLE-004, PEOPLE-008, PEOPLE-009 uses one explicit merit increase and one explicitly dated salary bonus per position. Merit is additional base wages × entered basis points × affected inclusive UTC calendar days / (10,000 × days in the accounting period), rounded half away to cents once; dates before a period affect all its days, including leap and retail periods. Existing salary cent conservation is unchanged. Merit adds separately rounded on-costs and enters the employer match base and FIN-006 taxable wages. The match excludes both bonus and commission. A bonus is the entered percentage of the annual salary rate in force at its selected period end (including the full merit rate if effective by then), rounded once, expensed once and paid in that period; it has no on-cost or match. With dated payroll, the bonus and its incremental employer taxes settle on the selected pay day in that same period, ignoring the regular payroll month offset. Other components retain their earned/pay-date timing. Benefits and match remain excluded from taxable wages. Continuing service retains these components in estimated opening accruals.

A department has an entered on-cost default. Blank or omitted position on-costs capture that department rate at each position save; an explicit percentage, including zero, overrides it. Changing a department default alone changes no existing position or frozen arithmetic. A commission quota is entered in cents per accounting period. Attainment is cumulative explicitly linked contract bookings / quota, displayed as once-rounded basis points; zero quota disables attainment and requires no tiers. Up to twenty increasing attainment thresholds and increasing commission rates define marginal accelerators: only booking cents above a threshold earn that tier's rate, without retroactive changes to earlier cents. Threshold cents are quota × attainment basis points / 10,000 once half-away rounded, and must be positive and distinct. Same-period contracts consume quota in ascending stable origin-ID order. Each contract sums exact cent × rate numerators over its marginal slices, then rounds once to cents; without tiers the existing contract × rate rule is unchanged. Quota resets each accounting period. Every trace names the quota, attainment, slices and resulting planning estimate; employer taxes, live pay filtering, proposals, immutable captures and formula exports use the same result. REV-001 inherits these quota/attainment/accelerator rules for weighted pipeline bookings before shipping. No eligibility, deferral, payment, payroll execution or statutory certification is inferred.

Before this capability ships, PEOPLE-004, PEOPLE-008, PEOPLE-009 inherits US-001: provide US statutory compensation, payroll and tax defaults for a new US company, with the effective tax year and every planning-estimate label; retain finance overrides.



<a id="people-005"></a>

## PEOPLE-005 — Compensation access separate from finance



Compensation detail (names, salaries, bonus and commission) is a permission of its own. Finance can grant a finance analyst plan access without pay access. Department heads see their department's totals and, only when granted, their own people's detail. Exports, packs, API responses, agent answers and Excel or Sheets pulls apply the same server-side filtering. REPORT-005 department-statement app reads, workbooks and each recipient's email body apply these same live grants. The signed-in installation owner holds Pay detail and alone grants or revokes it separately from planning membership; finance analysts and department contributors start without it, and viewers cannot receive it. A contributor's grant applies only to their current departments. Removing a payroll classification or moving an existing payroll input requires Pay detail, so model editing cannot bypass the grant. Complete open archives and the unfiltered Activity trail refuse readers without Pay detail rather than silently exporting an incomplete archive. Scenario, comparison, snapshot, CSV and Excel reads retain totals while removing restricted compensation inputs, traces and payroll evidence. Tokens retain the pay ceiling at issuance and lose access on revocation; MCP uses the current person's same filtering. A stored pending statement email whose pay audience changes is blocked rather than resent with stale detail; accepted or uncertain sends never resend. This applies to all current capabilities; future compensation fields/providers (PEOPLE-001 to PEOPLE-004, PEOPLE-008, PEOPLE-009, PEOPLE-007, FIN-006), spreadsheet add-ins (SHEET-001, SHEET-002), reports and agent answers (REPORT-001, REPORT-008, REPORT-003, REPORT-007, REPORT-009, AGENT-009) inherit the grant on every new door before shipping.



<a id="people-006"></a>

## PEOPLE-006 — Headcount plan against actual



Monthly headcount, hires, departures and payroll cost are compared between plan and roster actual by department. Hiring slippage (planned start against actual start), backfills and an attrition assumption are shown, and the slippage history feeds `AGENT-004`.

Ct approved explicit dates on 20 October 18:32Z: a position may carry an exact ISO planned start date in its start month; month-only starts show unavailable day slippage. Accepted roster observations retain the reviewed planned date and actual start date as slippage history for AGENT-004; subsequent plan edits do not rewrite that history. The HTTP read door is `/api/easel/headcount/:scenario`, displayed in Overview. Each month uses the latest complete dated reviewed roster per provider within that month, with observation dates displayed; missing months are unavailable, never carried forward. Active actual headcount includes starts on or before the observation and excludes terminations on or before it; hires and departures use their source calendar month up to the observation. Planned positions use inclusive start/end months, so planned departures fall in the month after the end month. An explicit same-department link identifies a backfilled position; no identity match is inferred. Per-position monthly attrition probabilities are summed over active planned positions and rounded once half away from zero to hundredths of an expected departure; this displayed assumption does not remove positions or change costs. Planned payroll uses the scenario inputs (captured inputs for frozen versions) before closed-actual substitution; actual cost sums accepted pay-run gross wages, employer taxes, benefits and fees in the pay-date month, with missing runs unavailable. Duplicate cross-provider position links block actual headcount conclusions. Detail and history inherit PEOPLE-005 live pay/scenario grants and ERASE-001 erasure. CONNECT-005 carries the connected payroll/HR roster pull through PEOPLE-001/PEOPLE-002 before shipping, with these explicit-date, unavailable-day, retained-history and erasure rules. Backfill, attrition and AGENT-004 history obligations remain binding. The manual Gusto source pulls real fixed-host employee, compensation and processed-payroll APIs, then requires explicit employee/department/position mappings and the exact refetched review fingerprint before journal acceptance. Finance explicitly supplies the earliest source payroll period to review; it cannot be later than a source job hire or the cost window. Contiguous provider pay-period slices include regular, off-cycle and external payrolls; check dates determine cost months after source reads. Repeated source payroll IDs are consumed once and changed accepted source rows require review rather than overwrite. Source fields and payroll costs are limited to reported gross, employer taxes and employer benefits; unreported provider service fees are explicitly excluded, never estimated. No history or zero cost is inferred before the reviewed source boundary or in missing months. A complete empty roster supersedes earlier observations. This source does not claim PEOPLE-001's future OAuth/contractor connection or its live sandbox receipt.



<a id="people-007"></a>

## PEOPLE-007 — Roster and payroll-register file import



A buyer whose PEO or payroll provider has no connector (for example Justworks, TriNet, Insperity, ADP TotalSource, Paychex, Paylocity or Paycom) imports a roster file and a payroll-register file as CSV or .xlsx. Finance maps columns once: employee ID, name, department, title, W-2 or 1099, salary or hourly rate, and start and termination dates; and, per pay run, gross wages, employer taxes, benefits and fees. The mapping is saved per provider. The import previews without writing, lands through the import journal with the original bytes, undoes exactly, and reconciles to planned positions in the same four buckets as `PEOPLE-001`: matched, unplanned hire, planned but not hired, and changed salary. Payroll-register totals reconcile to the ledger's payroll lines. Pay detail follows `EASEL-007` and `PEOPLE-005`.

The HTTP door is `/api/easel/import/payroll/:op` (preview, commit, status, resume, undo), with `/api/easel/payroll/:scenario` for the reconciled result. Roster observations have an explicit ISO `asOf` date; pay runs have their actual pay date. Provider mappings retain column names, date convention, department choices and explicit source employee-ID to position-origin links. No name-based identity match is inferred. Annual salaries compare in cents; an hourly observation against a salary-only planned position is listed as a changed compensation basis, never silently treated as equal. Each provider's latest complete dated roster is shown independently; duplicate employee observations or employee/pay-date runs are refused until the previous import is undone. Register gross wages, employer taxes, benefits and fees sum in cents by payroll line, department and pay month; absent or unresolved ledger data is unavailable, and a difference stays visible. String dates use the saved ISO/US/UK format; Excel dates use whole UTC serial days from 1899-12-30. Invalid rows or fractional cents refuse the entire file. Undo removes the journal's observations and preserves unrelated records; its mapping reverts to the previous retained import. All detail and import administration inherit the existing live Pay detail grant; aggregate headcount and cost remain visible under current planning access. Ct ruled 20 October 16:55Z: finance explicitly associates a provider employee ID with an existing Easel member (`memberMap`); no name match establishes identity. Erasure pseudonymizes that provider employee across current and retained imports, mapping keys, linked planned holders, journals and CSV/XLSX originals on export. Provider and employee hashes scope the durable map; original job ID, digest, mapped columns and sheet bind file transforms. The same short ID in another provider or a monetary cell remains unchanged. Stored originals and snapshots remain immutable, with transformed portable digests. Journal undo recognizes only the identity redaction and still preserves later independent edits. Existing CYCLE-004 scenario read/edit shares also govern payroll imports, saved mappings, reconciliation, journals and open-export originals, with live grants rechecked for import batches.

### Revenue and pipeline



<a id="rev-001"></a>

## REV-001 — Pipeline drivers from Orbit, HubSpot and Salesforce



Finance connects [Orbit](https://github.com/just-every/run-orbit), HubSpot or Salesforce (OAuth, read-only) and pulls open and closed deals with stage, amount, owner, close date and product. From Salesforce, Easel reads Opportunities with their stage and that stage's probability (custom stages included), their OpportunityLineItems (product, quantity, unit price and term), and the org's fiscal periods, so a close date lands in the fiscal period Salesforce assigns it, custom fiscal years included. A deal with line items is split by product, and each product follows its own deal-to-revenue rule. From Orbit, Easel reads deals through Orbit's API with a scoped read-only token. Finance owns the assumptions, which are explicit and versioned: probability by stage (or the CRM's own probability, labeled), close-date slippage by stage, and the deal-to-revenue rule (one-time, ratable over term, or subscription start). Weighted bookings feed revenue, deferred revenue, commissions and cash. Each revenue cell traces to the deals behind it, under role filtering.

Before pipeline capability ships, REV-001 inherits CYCLE-002, CYCLE-008: next-quarter pipeline coverage is a rule metric with a finance-set threshold, evaluated on refresh/close to create cited owned/due tasks, with no duplicate while open. Existing task authority, blocking and evidence rules apply.

Before pipeline capability ships, REV-001 also inherits REPORT-002 dashboard pipeline-coverage widgets, with saved layouts, audience filtering and aggregate Excel exports.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Also assert inherited CYCLE-002, CYCLE-008 next-quarter coverage rules: a below-threshold refresh creates a cited owned/due task, a second unchanged refresh does not duplicate it while open, and live task visibility, owner authority and blocked-source handling hold.

Before REV-001 ships, it inherits PEOPLE-004, PEOPLE-008, PEOPLE-009 weighted-pipeline commission in the slipped booking period, with PEOPLE-004, PEOPLE-008, PEOPLE-009 quota, attainment and marginal-accelerator parity, through a finance-saved CRM-owner → position map, traced to the deal ID, under PEOPLE-005 pay filtering and the same planning-estimate/tax/rounding rules.



<a id="rev-002"></a>

## REV-002 — Subscription metrics from Stripe Billing and Nectar



Finance connects Stripe Billing (restricted read-only key) or [Nectar](https://github.com/just-every/run-nectar). Easel computes MRR and ARR movements (new, expansion, contraction, churn and reactivation), customer counts, gross and net revenue retention, and monthly cohorts. These serve as actuals for the subscription drivers in `EASEL-006` and `REV-003`, and reconcile to ledger revenue with the difference explained (deferred revenue, refunds, tax).

Before subscription imports ship, REV-002 inherits REPORT-002 imported ARR widgets, with saved layouts, audience filtering and aggregate Excel exports.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Current Stripe semantics: licensed monthly and annual invoice periods provide recurring run rates, bounded by actual subscription end dates. Bridges and cohorts aggregate by customer; retention uses the opening active customer base. Invoice service-period allocation, deferred balance, refunds and tax are displayed separately from ledger revenue, with an explicit finance explanation for any residual difference. One subscription driver receives the account-wide totals for each selected month and scenario. Source review and acceptance require the approved native finance session; imported ARR follows the existing dashboard audiences, personal layouts and aggregate formula Excel. Frozen plans retain captured observations.



<a id="rev-003"></a>

## REV-003 — A revenue driver library



Beyond volume × rate and customers × revenue per customer, revenue can come from seats × price with expansion, usage × unit price, billable headcount × utilization × rate (with actuals from [Gauge](https://github.com/just-every/run-gauge) or Harvest), project milestones and backlog burn-down, and the formula lines of `MODEL-004`. Every driver traces.

Every fixed form ships through Plan, HTTP and proposal/MCP doors, retaining department/pay filtering, cash collection timing, exact structure revisions and frozen arithmetic. Starting seats and usage apply in their start month; subsequent months compound the entered monthly expansion/growth and round quantities to hundredths before quantity × price rounds once to cents. Services uses the number of active positions in its own department (inclusive start/end months), explicitly assuming those positions are billable, × entered available hours per position per month × utilization × hourly rate, with one final division/rounding and no salary in revenue. Named milestones recognize their amounts in their specified months. Backlog begins with entered opening backlog, adds entered bookings at each month's start, recognizes the entered percentage rounded once to cents and capped at the available amount, then carries the remaining backlog forward; bookings are never added again as revenue. All driver cells cite their origin and arithmetic; closed ledger actuals replace them rather than adding twice. Ct approved MODEL-004 as the carrier for user-defined formula-line revenue drivers on 19 October; it inherits those driver forms and their exact traced-cell journey before shipping. Ct approved native finance session plus origin/revision fences for connect, disconnect, status and import on 19 October (18:28Z); API-001 tokens are refused on these doors. Gauge operational actuals now use its owner-created `utilization:read` key, sealed under CONNECT-010; native session cookies are never transferred. Finance previews a complete inclusive calendar month against the installation-configured GAUGE_ORIGIN and explicitly maps the entire agency aggregate to one services driver; Gauge has no department/service filter, names, pay or monetary amounts in this door. A Gauge month cannot be counted in two drivers in the same scenario. Missing capacity blocks; an explicit zero is valid only with zero billable time. The reviewed digest binds the source aggregate, scenario revision, target driver, planned hourly rate and reporting currency; acceptance refetches and refuses any changed source or plan. Gauge's volatile observation timestamp is retained as provenance but excluded from this equality digest. Approved billable seconds × the reviewed hourly rate in cents / 3600 rounds once half away from zero to cents, labelled operational utilization actuals at planned rate, never ledger revenue. Accepted months keep that reviewed rate after forecast assumption edits; unimported months retain their assumptions and closed ledger actuals retain precedence. Identical pulls do not duplicate or revise the model. The native append-only model/activity journal retains provenance, actor, acceptance time, source dates, counts, seconds and digest; one atomic save applies the aggregate. Undo restores exactly the preceding imported values while its resulting scenario revision remains current; later changes refuse undo. Snapshots and exports keep accepted nonsecret provenance and frozen arithmetic. CONNECT-005 inherits scheduled Gauge refresh, source freshness/failure notifications and restatement handling before shipping. Harvest remains an alternative provider, not a claimed shipped connector.



<a id="rev-004"></a>

## REV-004 — Bookings, billings, revenue and cash



For contract revenue, a booking carries term, billing frequency (monthly, quarterly, annual upfront) and start date. Billings, deferred revenue, recognized revenue and collections follow from it and appear on the three statements (`FIN-001`, `FIN-002, FIN-008, FIN-009`).

Contract inputs are planning assumptions, never issued invoices or confirmed receipts. They use existing scenario, department and proposal authority and retain their definitions and arithmetic in frozen versions. Total contract value is integer cents; service terms are whole months. Monthly service periods begin on the start date and its monthly anniversaries, clamped to the last day of a shorter month. Each ordinary service period recognizes floor(total cents / term); the final period takes the remaining cents. A service period crossing calendar months allocates its recognition by its exact UTC service days, with the final calendar segment taking the cent remainder. Monthly, quarterly and annual-upfront invoices occur on those anniversaries every one, three or twelve service months and bill the sum of their service-period amounts; the final partial billing interval takes its remaining amount. Collections occur on the invoice date plus the entered whole-day DSO, assigned to that UTC calendar month, independently of the legacy monthly collection lag. No service, billing or collection schedule restarts at the displayed horizon.

Bookings, invoices, recognized revenue and collections remain distinct. Billed amounts less recognition produce deferred revenue; recognition ahead of billing produces unbilled revenue, and billed receivables decrease on collection. The three statements include those assets/liabilities and their indirect cash movements with exact reconciliation checks, and formula Excel exports use the same role-filtered schedules. Accepted closed-month ledger revenue retains precedence on the P&L; contract invoices and collections remain explicitly planned until source invoice actuals exist. A mismatch or ambiguous mixed-driver closed cell is reported as an unresolved reconciliation with its source amounts, never silently allocated into an invented receipt. Known invoice receivables remain unchanged by that mismatch; real statement differences remain visible. Cash minimums are not assessed, affected dashboard cash/burn/runway values are unavailable and runway task conclusions are blocked until the reconciliation is resolved. FIN-002, FIN-008, FIN-009 retains its other collection curves, vendor terms, prepaids and accrued-payroll obligations; CONNECT-007, CONNECT-012 retains imported balance-sheet openings.

### Spend



<a id="spend-001"></a>

## SPEND-001 — Committed and card spend



Purchase orders and committed contracts from [Purse](https://github.com/just-every/run-purse), expense reports from [Coaster](https://github.com/just-every/run-coaster), and card and bill-payment data from Ramp, Brex and Bill.com feed the forecast as committed spend by line, department and month. The variance view shows budget, committed, actual and remaining for each.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Current partial semantics: finance selects the source providers explicitly, so a Coaster report can be reviewed without unrelated Ramp or Purse reads. Cleared Ramp amounts are signed integer minor units. A linked refund reduces actual and restores the PO commitment; net linked amounts outside zero through the PO total refuse. Purse paid bills count only with their authenticated payment-status timestamp; unknown bill status never proves payment. Explicit whole or split cross-provider matches with the same PO count only their matched payment portions once. A closed PO releases its unpaid balance and preserves paid actual. Coaster final approved reports retain the approved revision and snapshot fingerprint: approved or batched reports are commitments, and reimbursed reports are actual; externally recorded reimbursement is labelled as such, never bank settlement. Every accepted ledger row in the reviewed cell requires explicit confirmation as additional actual or an equal-value match to one distinct provider actual. Additional ledger payments may explicitly reduce a PO. Changed source, source selection, mapping, ledger evidence or forecast revision invalidates acceptance. The reviewed forecast assumption is replaced once; no ledger entry or outbound payment is created. Original acceptance and inherited CONNECT-010 authority are unchanged. A complete explicit schedule can now allocate each selected source across up to twenty-four open months of one dedicated recurring expense. Each signed allocation retains its source direction and sums exactly to the source total. One atomic acceptance replaces only those monthly forecast cells; unreviewed months retain their recurring assumption. Brex settled purchases and fees increase spend, refunds reduce it according to transaction type, and card-account collections and rewards credits are excluded. Ambiguous chargebacks refuse. Posted dates and raw signed minor units remain in reviewed provenance. Ledger parts can match one provider payment across several ledger rows, or several provider payments to one ledger row; only unmatched ledger amounts remain additional actual, and any residual PO link reduces commitment by that residual alone. Overmatching, reversed directions and omitted prior allocation months refuse. These are operational expense allocations, not a bank reconciliation or a payment instruction. Cross-provider duplicate parts retain their signed direction, fit both the source row and the combined capacity of each independent target, and leave the unmatched source remainder as actual. A target cannot itself declare duplicates, so cycles and chains refuse. Monthly matches remain in their reviewed periods. Ledger matches can consume only a provider row’s remaining counted amount after its duplicate parts; fully duplicated rows cannot remove ledger spend. Native controls review one matched part per row and period; the HTTP door also reviews several distinct matches for a source row. Source changes and changed match amounts invalidate acceptance, and accepted provenance retains every counted and duplicated cent.

### Spreadsheets



<a id="sheet-001"></a>

## SHEET-001 — Excel add-in with live formulas



A Microsoft Excel add-in (Office.js, Windows, Mac and Excel on the web) signs in as the person and provides worksheet functions, for example `=EASEL.VALUE("Revenue","Sales","2027-01","Forecast")`, plus pull-a-report ranges. Values refresh on demand (a Refresh command for the workbook or the selection) and when the workbook opens, and each refresh pulls every change made in Easel since the last one, under server-side role filtering for the person refreshing. Write-back follows the same rules as the browser. While a contributor's department submission is requested or returned (`EASEL-009`), their write to that department's budget inputs lands directly as their own entry at the next plan revision, as an entry in the grid (`MODEL-008, MODEL-013`) would, and their later submission includes it. Once the department is submitted, a write to its working plan becomes a proposal bound to the current revision (`EASEL-012`). A write to an approved budget, a kept forecast or another department's cells is refused with the reason. The workbook's own formulas around Easel cells stay live: a formula that references an Easel function cell (for example a `SUM` over them) recalculates whenever a refresh changes that cell, as any Excel dependency does.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.



<a id="sheet-002"></a>

## SHEET-002 — Google Sheets add-on with live formulas



The same functions, refresh, role filtering and write-back rules as `SHEET-001` (direct entry during an open submission, a proposal once submitted, refusal on approved budgets, kept forecasts and other departments), as a Google Workspace add-on with custom functions. Refresh runs on demand from the add-on menu and when the spreadsheet opens, and scheduled refresh runs through an installable time-driven trigger that pulls Easel changes without the spreadsheet being open. Sheet formulas over Easel cells recalculate after each refresh.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.



<a id="sheet-003"></a>

## SHEET-003 — Model import that keeps formulas



Importing an existing Excel or Google Sheets model translates supported formulas (arithmetic, SUM, IF, references across sheets and months, growth and lookups) into Easel formulas (`MODEL-004`). Every formula it cannot translate is listed with its sheet and cell, and that cell keeps its cached value with provenance (`EASEL-015`). Totals reconcile to the workbook's own totals before anything is accepted, and undo works through the journal.

The import door consumes an .xlsx export from Excel or Google Sheets. Supported formulas use exact rational arithmetic (+, −, ×, ÷ and bounded integer powers), comparisons, SUM ranges, lazy IF, references across sheets/months, and exact VLOOKUP (FALSE/0) or XLOOKUP (default/match mode 0; linear forward/reverse). Text lookup comparisons are case insensitive; duplicate matches choose the first in the selected search direction. Unsupported functions, named references and other unsupported syntax are explicitly listed and kept at their cached value. A supported cycle, missing numeric result or division by zero refuses the operation; no script or macro runs. Final numeric cells round once half away from zero to cents. Source formula-cell caches and supported formula total rows must match calculated cents before acceptance; a missing, unsupported or mismatched total refuses acceptance. The import report retains all formula statuses and reconciliations. A private workbook source graph is captured as a model input, following the same complete-source finance/Pay detail door as its original file. Numeric assumptions outside plan rows can be changed with exact decimal source units (up to eight places) in Plan or `command/workbook-driver`, fenced to the reviewed scenario revision. Constant plan cells use the existing planning grid; calculated cells refuse typing over their formulas. Branches/proposals copy the source graph and overrides, saved versions retain frozen arithmetic, model versions record driver changes, and journal undo preserves independently edited records under EASEL-015. Source graphs, snapshots and original files inherit ERASE-001 identity mapping; server-filtered plan and snapshot reads retain totals without exposing the complete graph to readers lacking the original-file grant. Native formula-line authoring, lookups and REV-003 formula-driver forms are proved separately under MODEL-004 with its per-division arithmetic.



<a id="sheet-004"></a>

## SHEET-004 — Excel exports with formulas



Any report, plan or pack exports as .xlsx with live subtotal, total and variance formulas and one sheet per statement, not values only. CSV exports remain. Pay detail follows `PEOPLE-005`. This obligation applies to every report and statement that exists today (scenario/overview P&L and cash, scenario comparisons, monthly variances, published packs, actuals reconciliation and filtered activity), using the same server-filtered views and immutable snapshots as the app. Future report, statement and plan capabilities (`REPORT-001, REPORT-008` to `REPORT-007, REPORT-009`, `FIN-001` to `FIN-007`, `MODEL-001, MODEL-010` to `MODEL-009`) inherit this export obligation before they ship. Workbook amounts are integer minor units, labeled with their currency; differences are actual minus budget or comparison-to minus comparison-from. Unavailable comparison periods or different currencies have no difference value. A department-filtered plan exports that department's P&L and visible inputs, without a company-wide cash statement.



<a id="sheet-005"></a>

## SHEET-005 — Scheduled spreadsheet pulls



A linked sheet range (for example a sales team's capacity sheet) is pulled on a schedule. Its changes arrive as a previewed proposal for finance with the changed cells listed. A sheet that went missing or changed shape is reported, never read as zeros.

Before this connector ships, it inherits CONNECT-010 encrypted/excluded custody, masked status, finance-only administration, audit and truthful provider-revocation outcomes.

Current capability: native finance with live Pay detail explicitly connects an offline Google OAuth grant restricted to spreadsheets.readonly. The grant covers spreadsheets accessible to that Google account, not only the linked range. Credentials are sealed with a Google-specific purpose and excluded from archives; status never returns them. Finance reviews a numeric A1 rectangle, its complete mapping to existing entered native schedule cells and an exact source/target fingerprint before enabling hourly or company-zone daily pulls. Each run rechecks the live native finance owner, capabilities and Pay detail. Source changes create a separate submitted proposal carrying the exact source/native cell differences and target revision; the working plan changes only through normal reviewed promotion. An identical source creates no duplicate proposal. Stable sheet ID, grid shape and every requested numeric cell are checked; missing/reshaped sources record health and audit only, leaving target inputs, proposals and the last valid baseline unchanged. Disconnect disables range schedules, requests Google revocation without redirects/retries and deletes local credentials on every outcome; unconfirmed revocation names the Google Account removal step. Google revocation can affect other grants in the same OAuth project. This is the linked-range connector, not the SHEET-002 add-on.

### Planning cycles and collaboration



<a id="cycle-001"></a>

## CYCLE-001 — Budget calendar, tasks and reminders



Finance sets a planning calendar with tasks (submit department budget, review headcount, confirm variance explanations), owners and due dates. Owners get reminders by email, [Nook](https://github.com/just-every/run-nook), Slack or Microsoft Teams in the company's time zone. Reminders stop when the task is done, and overdue tasks escalate to finance. Submission status (`EASEL-009`) is one kind of task. Before shipping, CYCLE-001 inherits REPORT-005: its open department tasks appear in that department's monthly email and app statement under the same recipient and detail filtering.

Before this capability ships, CYCLE-001 inherits US-001: schedules use the saved IANA company zone (America/New_York for new companies), including daylight saving time, with the zone visible and scheduled versus actual dispatch times recorded.

Current calendar semantics (ct, 19 October 23:00Z and 20 October 01:08Z). Finance alone creates and edits calendar tasks (review headcount, confirm variance explanations, or another named planning task) with one owner and a due date; a department task's owner is an active contributor assigned to that department, and a company-wide task's owner is active finance (a Base owner or admin). Requested department submissions with a due date are calendar tasks owned by that department's active contributors; submitting cancels their reminder. Only finance and a task's owners read it; only finance and its owner complete it. In the saved company zone, the reminder is due at 09:00 local time on the calendar day before the due date, and an open task escalates to every active finance person (Base owner or admin) at 09:00 local time on the first weekday (Monday to Friday, no holiday calendar) after the due date; daylight saving time moves the UTC instant. A scheduled run every 15 minutes acts as `scheduler:calendar` for the still-active owner/admin who turned reminders on, with that person attributed in Activity, fenced on the exact model revision; it appends only delivery intents and outcomes and cannot change plans or roles. Each reminder or escalation is recorded once per task, due date, channel and recipient, with its scheduled and actual dispatch instants and zone. A task completed before its reminder time records a canceled reminder. Live authority is rechecked before every send. Email goes to each rechecked owner (reminders) or finance person (escalations) and carries the task detail; Slack and Microsoft Teams incoming webhooks (deployment secrets `SLACK_WEBHOOK_URL`, `TEAMS_WEBHOOK_URL`) and one Nook channel receive only the generic text "Easel planning task reminder" and a sign-in link. The Nook connection is made by the owner alone in a signed-in session: Nook origin, channel ID and a Nook integration token (`NOOK-079`), sealed, never shown again, exported or archived; Nook posts carry the delivery's idempotency key. Provider acceptance is labeled as acceptance only, never as delivery; local development suppresses email and says so. Refused, redirected or unconfigured sends stay pending for an explicit finance retry with the same captured message and key; accepted sends are never resent and an uncertain outcome is never retried. Outbound chat destinations follow ct's 19 October EGRESS RULE: entered only by owner-level authority, called with Workers fetch over HTTPS only, no credentials or fragment in the URL, no loopback, private, link-local or reserved IP literal and no local-only host name, redirects refused, no DNS preflight. Gap: resolved-address/pinned egress (Base egress door); CYCLE-001 goes done when Easel adopts that door, and every future clause that calls an owner-entered destination (`API-002`, `CYCLE-003`, `REPORT-006`) inherits it by name.



<a id="cycle-002"></a>

## CYCLE-002, CYCLE-008 — Metric-triggered tasks



Finance writes rules such as "a department's actual spend exceeds budget by 10% and $5,000 in a closed month", "runway falls below 12 months" or "pipeline coverage for next quarter falls below 3×". When a refresh or close meets a rule, Easel creates a task with an owner and due date that cites the numbers, and does not create a duplicate while the task is open. Current actuals and runway metrics conform (ct, 19 October); before pipeline capability ships, REV-001 inherits the pipeline-coverage metric, rule evaluation on refresh/close, cited tasks and open-task deduplication. Finance creates, revises and disables rules. Closed-month spend is the department's natural-sign cost-of-sales plus operating expense, including non-cash costs, against the approved budget in the same currency and covered period. Both percentage and amount bounds are strict; equality does not trigger. A nonpositive budget has no finite overspend percentage: positive actual expense above the amount bound meets the percentage condition. Runway uses FIN-005's exact unrounded ratio and the earliest future breach; non-burning positive cash does not breach. Rules evaluate after accepted CSV refreshes and month closes, on save and on an explicit check. Incomplete imports, unresolved consumed mappings, unavailable owners, absent approved periods and currency mismatches are visibly blocked, never replaced with zero. Overspend tasks are deduplicated per rule/month, runway per rule/forecast while open; completing a task permits a new task on a subsequent check. Each task captures its rule revision and numeric/source evidence, owner and due date (N UTC calendar days after trigger). An overspend owner must be an active contributor of that department; runway owners must be active finance owners/admins. Finance sees/completes all tasks; an assignee sees/completes only their own tasks while their role and department remain valid. Rules are finance-only. Tasks are in-app records; CYCLE-003 carries notification delivery. Disabling a rule preserves existing tasks and their captured evidence.



<a id="cycle-003"></a>

## CYCLE-003 — Notifications from discussions and events



Mentioning a person in a comment or explanation, a returned submission, a pending approval, a restatement notice, a failed refresh and a triggered task each notify the person by email and, if connected, in Slack, Microsoft Teams or Nook. The notification links to the exact cell or record. Each person sets their channels, and a daily digest is the default.

Before this capability ships, CYCLE-003 inherits US-001: schedules use the saved IANA company zone (America/New_York for new companies), including daylight saving time, with the zone visible and scheduled versus actual dispatch times recorded.

Current notification semantics (ct, 20 October 06:45Z). Notified events today: an `@email` mention in a budget comment or variance explanation (only a person who can read that department may be mentioned; any other mention refuses the write), a returned submission (every active contributor of that department), every requested department having submitted (active finance, as a pending approval) and a metric-triggered task (its owner). Before restatement notices and scheduled refresh failures ship, CONNECT-005 inherits notifying finance of them under this clause's rules. Each person sets one preference: immediate email (the default, replacing the earlier daily-digest default under ct's ruling), a daily email digest at 08:00 in the saved company zone (one message listing every waiting notification created before that instant, DST-correct, with scheduled and actual times recorded), or chat only, limited to the Slack, Microsoft Teams or Nook channel the owner connected under `CYCLE-001`. Chat channels are shared, so a chat notification is only the generic text "You have an Easel notification" and a sign-in link, and a chat-only person gets no email. Every notification links to its record (`/app?tab=…&record=…`) and is recorded once per event and recipient in the same fenced save as the event; delivery rechecks that the recipient can still read the record and follows `CYCLE-001`'s delivery rules (acceptance labeled as acceptance only, refused sends pending for finance retry with the same message and key, uncertain outcomes never retried) and its EGRESS RULE. The daily digest runs in the `CYCLE-001` scheduled run and needs reminders turned on. Gap: resolved-address/pinned egress (Base egress door), as in `CYCLE-001`.



<a id="cycle-004"></a>

## CYCLE-004 — Private and shared scenarios



Any planner can make a private sandbox scenario that only they can see, share it with named people or groups as read or edit, and submit it as a proposal. Finance sets which scenarios are official (budget, forecast, board case). Scenario-specific access rights are enforced on every read, comparison and export.

Ct approved current named-person completion on 19 October. Current planners are finance and contributors. A sandbox is private to its creator until they share it with named active members; finance has no implicit scenario-access bypass. Read permits comparison and filtered CSV/Excel download, while edit also requires the reader's current planner role and department/pay authority; a viewer cannot receive edit. Only a current planner who created the sandbox changes its grants or submits it. Revocation and membership changes apply immediately. Sharing and submission require the exact reviewed sandbox revision. Submission copies the reviewed inputs and cash into a new submitted proposal against an exact reviewed, visible working target, preserving the private original; EASEL-012 promotion fences and current contributor scope still apply. A changed or frozen original target requires choosing another current working target and its revision. Private sandboxes remain private through branches; official version saving and adoption use their submitted proposals rather than publishing the private source. Finance designates company-visible cases as budget, forecast or board case through separate metadata: labels never approve or change arithmetic or immutable snapshot bodies. Private sandboxes are retained with their sharing history. Activity (including mixed structure-version records), comments, app exports and open-file exports omit unseen sandbox definitions and figures; every visible manifest file retains its correct digest. The existing owner CLI backup remains whole-installation custody. ACCESS-001 inherits group scenario shares and immediate group-membership enforcement before groups ship.



<a id="cycle-005"></a>

## CYCLE-005 — Quarterly reforecasts and version comparison



Besides the approved budget and the rolling forecast, finance saves named reforecast versions (for example Q2 reforecast), each frozen like a budget. Reports and variances can compare actual, budget, each reforecast and the current forecast. Finance saves the exact reviewed revision of a working forecast or scenario without changing its source. Names are trimmed and unique without regard to case among saved reforecasts. Each version retains its metadata, model structure, inputs and saved arithmetic through later edits, month closes, deletion of its working source and export/restore. Plan and comparison reports, monthly variances and published review packs use those saved figures. For a closed month, the current forecast includes accepted actuals. Version variance is actual minus version in integer minor units; a period outside a version's horizon has no amount or variance, and differing currencies have no variance.



<a id="cycle-006"></a>

## CYCLE-006 — Long-range plan linked to the operating plan



A 3-to-5-year annual plan holds top-down targets (revenue growth, margin, headcount, cash). Year one comes from the operating budget, and later years come from annual drivers. A reconciliation shows where the bottom-up budget misses the long-range target. Finance saves named plans linked to the operating budget at the reviewed budget and annual-plan revisions. Year one is the first twelve budget months: revenue, operating costs and profit sum those months, while headcount and cash use the final month. Working-budget edits flow through; an approved budget uses its saved arithmetic and snapshot digest. Annual periods start in the budget’s first fiscal month. Later years apply entered revenue growth, operating margin, whole-person headcount change and an explicit net cash change independent of profit. Money is integer minor units; divisions round half away from zero once. Revenue growth cannot be below −100%, margin cannot exceed 100%, and projected headcount cannot be negative. Revenue targets compound the entered prior-year revenue by the target growth rate (including year one); profit targets apply the target operating margin to target revenue. Headcount and cash targets are fixed year-end targets for each year. Gaps are budget or projection minus target. Members read aggregate plans and Excel exports; existing finance authority governs edits, and no position-level pay data is included.



<a id="cycle-007"></a>

## CYCLE-007, CYCLE-009, CYCLE-010 — Per-department ordered approval chains



Finance can give any department an ordered approval chain: one or more review steps that a requested submission (`EASEL-009`) passes, in order, before it counts as submitted for budget approval (`EASEL-010`). Finance here means a native owner or admin, or a person holding the `approvals` capability with full company scope (`ACCESS-001`). Each step names one or more eligible reviewers: named active members, an `ACCESS-001` group, or both. Any one eligible reviewer completes the step. Departments without a chain keep today's single finance step unchanged.

Reviewer authority is live. When a reviewer acts, they must be an active finance person or contributor (never a viewer) and still eligible for that step. Under their current `ACCESS-001` grants (evaluated per grant and unioned) they must be able to read every source of that department in the budget. They also need Pay detail wherever the department's submission includes positions they would review (`PEOPLE-005`). A step never grants edit, Pay detail, the global `approvals` or `publishing` capability, or any other access. Removing a person from the chain, from a group or from the department ends their authority on their next request. A step with no currently eligible reviewer is shown as blocked, with the reason. It is never skipped or auto-approved.

Order and exact content. Steps act strictly in order. A step reviewer approves only the department's exact submitted content: the department's budget inputs (scenario revision plus a digest of that department's inputs) as submitted. If those inputs change by any route, every completed step for that pass is voided and the chain restarts at step one. Changes to other departments don't void it. A later step cannot act before an earlier step completes, and a step cannot act twice in one pass. While its chain is in progress the department stays locked to contributors, as under `EASEL-009`.

Return and resubmission. Any reviewer at the current or an earlier completed step can return the submission with a reason, and so can finance at any point. Return reopens the department to its contributors under `EASEL-009`. The voided decisions stay in history, and resubmission starts again at step one. The full request, submit, step-approve, return and restart history is kept with each actor, time, step, chain version and the exact content reviewed.

Chain versions. Saving a chain creates a new version through the fenced model revision. Each submission records the chain version current when it was submitted and completes on that version. A later version applies to the next submission. Finance may explicitly restart an in-flight submission on the current version, which voids its completed steps and keeps them in history. Deleting a department's chain applies the same rule.

Relationship to global approval and publication. `EASEL-010` approval also requires every requested department with a chain to have completed every step of its recorded version on the exact content now in the budget. Otherwise approval names the waiting department and step and refuses (409). Global approval, month close and publication keep their `ACCESS-001` rule (the capability plus full company scope); completing a chain step confers none of them. The approval snapshot captures each department's chain version and step decisions. A step pending its reviewers is a `CYCLE-003` pending-approval event for that step's current eligible reviewers. Step review inherits `MOBILE-001` (390 pixels) and `AUDIT-001`. Chain configuration and history travel through `EASEL-016` export and restore and `PORT-001` open exports under existing filtering. Agents act only as a signed-in person and cannot approve a step (`AGENT-011`, `API-003`). Easel sets no thresholds, amounts, step counts or reviewer quotas.

`tests/approval-chains-browser.mjs` (`CYCLE-007, CYCLE-009, CYCLE-010`): finance configures the chain, and the reviewers approve and return in order, at 1440 and 390 pixels without page overflow.

*Evidence:* `tests/approval-chains.test.mjs` — “CYCLE-007, CYCLE-009, CYCLE-010 ordered department reviews bind live authority, exact content, versions, history, notifications and portable records”: two-step Sales beside chainless Engineering; early/duplicate-step refusal; Sales changes void decisions while Engineering changes preserve them; return/revision/resubmission retains history; global approval names the waiting department/step and captures completed versions/decisions; removed group members, viewers, incomplete dimension grants and missing Pay detail are refused; empty eligibility is blocked; recorded versions remain until explicit restart; steps grant no edit, Pay detail, global approval or publishing; pending notices reach eligible reviewers only; open export and actual CLI export/restore retain chain/history. `tests/approval-chains.test.mjs` — “CYCLE-007, CYCLE-009, CYCLE-010 grid undo, proposal promotion, chain deletion and live reviewer removal preserve exact review boundaries”: grid undo, proposal promotion, deletion/restart, department removal and queued-notice revocation. `tests/approval-chains-browser.mjs` — CYCLE-007, CYCLE-009, CYCLE-010 native finance configuration, ordered review, return, resubmission, retained history and no page overflow at 1440 and 390.

### Reporting



<a id="report-001"></a>

## REPORT-001, REPORT-008 — Report builder



Finance and permitted members build reports. Rows are lines, dimensions or hierarchies. Columns are months, quarters, years, year-to-date or trailing twelve months, across versions (actual, prior-year actual, budget, each reforecast and the forecast), with variance and year-over-year change in dollars and percent. Filters by any dimension member and conditional highlighting (for example a variance over 10% in red) are available. Reports are saved, shared, and scheduled for email delivery to named people daily, weekly or monthly in the company's time zone. They are always role-filtered on the server, and each recipient of a scheduled report gets the copy they would see if they opened it.

Before saved reports ship, REPORT-001, REPORT-008 inherits REPORT-002 dashboard tables/charts over saved reports, with personal layouts, audience filtering and aggregate Excel exports.

Before this capability ships, REPORT-001, REPORT-008 inherits US-001: schedules use the saved IANA company zone (America/New_York for new companies), including daylight saving time, with the zone visible and scheduled versus actual dispatch times recorded.

Current report semantics: money is integer minor units; percentage changes are half-away rounded basis points, unavailable when the denominator is zero. Months/quarters/years, fiscal YTD and TTM sum the selected source cells; missing or blocked actuals and out-of-horizon version months stay unavailable. Rows may use departments, lines, custom members including descendants, or account hierarchies; overlapping rollups are labelled non-additive. Reports compare the current source with selected official working/frozen versions and retain the captured structure of frozen versions. Native finance and contributors build reports under their existing authority; contributors author only their own current department and private/department audiences, and only the creator changes the definition. Every reader and export uses current scenario, department, dimension and Pay detail filtering. Personal table/chart layouts are separate from the shared definition.

Finance explicitly names active account/member recipients and saves a daily, weekly or monthly company-zone schedule. Each attempt rebuilds the recipient's current permitted aggregate report, rechecks the active native finance author and recipient membership, and persists the intent before contacting mail. One recipient/date/schedule delivery key prevents duplicates. Known refusals remain pending for explicit finance retry with the same body/key; a changed report or audience blocks that retry. Accepted, sending and uncertain outcomes never resend automatically. Local suppression is labelled as not sent. The delivery view records the saved IANA zone, scheduled instant and actual dispatch instant, including DST transitions. REPORT-003/004/007 inherit current saved-report source, audience and formula-export semantics when their new doors ship.

Saved report authors and recipients inherit ACCESS-001 live group and dimension scope; group grants never expand stored token ceilings or compensation authority.



<a id="report-002"></a>

## REPORT-002 — Dashboards



Dashboards hold KPI tiles, charts and tables from saved reports and metrics, such as revenue, gross margin, burn, runway, ARR, headcount and pipeline coverage. Layouts are saved per person and shared per audience (leadership, board, departments) and work at phone width.

Ct approved the current-capability DONE boundary on 19 October (14:21Z). Finance creates and edits its own dashboards over company-visible plans; sandboxes and proposals cannot be sources. A private dashboard is creator-only. Leadership means current finance, board means current viewers, and a named department means its current contributors; the creator retains access while an active member. Every list, read, layout save and Excel download rechecks membership and source access. Sharing grants no input/pay access. A department dashboard fixes its department and shows no invented department cash, burn or runway. Shared definitions and per-person widget order/display use exact reviewed revisions and native session/model fences. A changed shared definition resets the effective layout to that definition until the person saves a new arrangement; it never changes another person's layout. Private dashboards and other people's layout contents are omitted from finance Activity and open export; the owner CLI backup remains whole-installation custody.

Current metrics are monthly revenue, gross margin (revenue less cost of sales, an amount), planned headcount, net cash burn, closing cash, runway and planned ARR. Money is integer minor units, headcount whole people, runway hundredths of months. Runway uses closing cash divided by the current and up to two preceding months' average net burn, rounded half away from zero; non-burning cash is labeled, exhausted cash is zero runway. ARR is current recurring customer/seat driver revenue × 12, identified by each source rather than the entire revenue line; other forms never count. Closed-month actuals lack subscription classification and have no ARR value. Missing or incomplete actuals are blocked, never zero. Frozen plans use captured inputs and calculations. Tiles show the ending month, charts and tables the full horizon. Aggregate Excel repeats authorization and has live margin, ARR and period-total formulas; flow totals sum months, headcount is the final month. Before shipping, REV-001 inherits dashboard pipeline coverage, REV-002 imported ARR and REPORT-001, REPORT-008 saved-report dashboard tables/charts, under the same filtering, sharing, layouts and exports.



<a id="report-003"></a>

## REPORT-003 — Board pack



A board pack template contains statements, KPIs, charts, variance commentary, decisions and appendix tables. It is generated for a closed month or quarter, refreshed until published, and published as an immutable snapshot (as in `EASEL-014`). It exports as PDF, PowerPoint (.pptx) and Excel, and can be saved to [Chest](https://github.com/just-every/run-chest), Google Drive or SharePoint. Refreshing keeps the commentary that people wrote.

Current semantics (sx-easel-c41). A template (`pack-template-save`, finance with the publishing permission) names a non-empty subset of six sections: statements, KPIs, charts, variance commentary, decisions and appendix tables; the built-in `default` holds all six. `pack-create` takes `{month}` for a closed month or `{period: 'quarter', month, template}` for the complete closed fiscal quarter (the fiscal calendar's quarter, including 4-4-5 and 5-4-4) containing that month; the draft binds its template's sections. Quarter figures are exact sums of the quarter's closed months in integer minor units, year-to-date runs to the quarter's last month, explanations are the confirmed monthly ones joined with their month, and version comparisons sum each version's months, unavailable if any month is. `GET /api/easel/pack/:id/preview` shows a draft's live numbers and whether they moved since generation; `pack-refresh` re-reads them after a late adjustment to a closed month, records the refresh and never touches explanations, which live with each variance line. `pack-publish` freezes the numbers into an immutable snapshot and refuses with 409 when the caller's reviewed `fingerprint` no longer matches; a published pack is never refreshed, so a new draft for the period shows later changes while the published snapshot, its PDF and its PowerPoint stay byte-identical. The snapshot renders as HTML, CSV, Excel (live subtotal, profit, variance and KPI-difference formulas), PDF and PowerPoint through one door that applies the same role, dimension-scope and Pay-detail rules as the existing downloads. The PDF is written deterministically (no timestamps) so its SHA-256 is stable. Chest, Google Drive and SharePoint are connected by finance from a signed-in session (`/api/easel/connections/pack-stores/:store/:op`): credentials are sealed, never archived or returned; Drive and SharePoint use fixed provider origins and Chest an owner-entered address under ct's EGRESS RULE; a finance save (`POST /api/easel/pack/:id/save`) uploads the published PDF once per pack and store, verifies the store's reported size (and digest where the store returns one) and records the SHA-256 and the store's receipt.

Before this capability ships, inherit REPORT-001, REPORT-008 saved-report source/version availability, live audience/Pay detail filtering and aggregate formula Excel on each new report door.



<a id="report-004"></a>

## REPORT-004 — Linked PowerPoint and Word reporting



PowerPoint and Word add-ins insert Easel tables, charts and single numbers into a deck or memo, and refresh them in place from a chosen version and period, under the person's role filtering.

Current doors: the installation's Word and PowerPoint manifests open the ordinary Reports page. A saved report supplies its chosen source version and through month; the operator selects a period, table/chart/number and aggregate value. Insertion is explicit, with a document-sharing reminder. Links persist selectors and stable shape/content-control identifiers only, never credentials or authority. Refresh reads every report under the current person's audience, Pay and source availability rules before any document changes; it refuses missing or duplicated targets, unavailable rows/periods, changed source/horizon and changed table dimensions. It preserves target identifiers and layout. Charts are labeled PNG snapshots with unavailable values distinguished from zero. Existing exported Office values cannot be recalled by later Easel revocation. The linked report Excel door carries the existing aggregate saved-report formulas.

Before this capability ships, inherit REPORT-001, REPORT-008 saved-report source/version availability, live audience/Pay detail filtering and aggregate formula Excel on each new report door.



<a id="report-005"></a>

## REPORT-005 — Department budget-owner reporting



Each department owner gets a monthly actual-against-budget statement for their department after close. It includes their top variances, the rows behind them, open tasks and explanations to confirm, by email and in the app, and never includes other departments' detail. Current owners are all active contributors assigned to that department (ct, 19 October); finance can inspect every statement, while a contributor must still belong to its department on every read/export. A close queues one persisted statement per department and one delivery record per then-active contributor, in the same fenced save. Preparation captures actual/budget values and every accepted source row after close; the app overlays current explanation and open-task states. The email captures that scoped content on its first attempt, lists up to five variances in descending absolute amount, and links to the authenticated app statement. Recipient membership and native account are rechecked before every attempt. A provider acceptance is labeled only as acceptance; local development suppresses email and says so. Refused/rate-limited or unconfigured mail stays pending for explicit finance retry with the same message and delivery key; accepted mail is never resent. An uncertain or interrupted attempt remains visibly unresolved and is never blindly retried. ACCESS-001 inherits future custom ownership/group grants and statement recipient/read filtering before it ships. Current open tasks include department metric tasks, outstanding department submissions and department-tagged published pack actions; CYCLE-001 inherits future generic department tasks. Pack decisions may carry an explicit department; finance can classify an older published action through separate metadata without changing its captured pack. Unclassified actions stay in the company pack with a finance reminder and never enter a department email; no department is inferred from free-text ownership.



<a id="report-006"></a>

## REPORT-006 — Scheduled cash alerts



Finance sets cash alerts: forecast lowest cash below the floor (`FIN-005`), actual or bank cash below plan by an amount or percent, and runway below N months. They are checked after every refresh and on a schedule. Each alert is sent once per breach by email and chat with the numbers, the cause and a link. It re-alerts only on worsening or after a set interval, and records when it was acknowledged.

Before this capability ships, REPORT-006 inherits US-001: schedules use the saved IANA company zone (America/New_York for new companies), including daylight saving time, with the zone visible and scheduled versus actual dispatch times recorded.

Current semantics (sx-easel-r31). Finance alone creates, revises, disables and reads cash alert rules and reads and acknowledges their alerts. Every rule checks the operating forecast in the reporting currency, in integer cents. *Forecast cash below the floor* uses the `FIN-005` agreed floor: it breaches when any month after the latest closed month closes strictly below the floor (equality meets it), and names that crossing month and the lowest forecast month and amount. *Actual cash below plan* compares the latest closed month's closing cash in the forecast, which is on accepted actuals (ledger figures, not bank balances), with the approved budget's closing cash for that month; it breaches when the shortfall is strictly more than the rule's amount, or strictly more than its percent of a positive plan (a nonpositive plan has no percentage and is reported as not assessed). *Runway below N months* uses `FIN-005`'s exact unrounded ratio at the earliest month after the latest closed month; non-burning positive cash never breaches. Rules are checked after every accepted or undone actuals file, every month close, every cash-floor or rule save and finance's explicit check, and once a day at 08:00 in the saved company zone (daylight saving included); each scheduled check is recorded with its zone and its scheduled and actual times, and the scheduled run acts as `scheduler:cash-alerts` for the still-active owner or admin who last saved an enabled rule. A breach opens one alert and sends it once to every active finance owner and admin by their `CYCLE-003` preference (immediate email by default, the daily digest, or chat only); the email carries the numbers, the cause (the person and event, or the scheduled check, that found it) and a link to the alert. An open alert sends again only when it worsens (an earlier crossing or breach month, lower lowest cash, a larger shortfall, or runway lower in hundredths of a month than at its last send) or when a check falls on a company-zone date at least the rule's interval (1 to 365 days, seven by default) after its last send's date. A check that finds no breach ends the alert without a message, and revising or disabling a rule ends its open alert, so the next breach opens a new one. Acknowledgment records the finance person and time against the latest send, once per send, and does not change when the alert sends again. No approved budget, no agreed floor, an import in progress, a reporting-currency change, incomplete cash, a budget without that month or no closed month is shown as the rule's reason it was not checked, never as zero. Under `MOBILE-001`, the Overview tab's Cash alerts card shows rules, alerts, sends, causes and acknowledgment at 1440 and 390 pixels without page overflow. Bank-balance rules now use CONNECT-009's fresh aggregate and its conservative finance audience pending ct approval. Shared chat follows `CYCLE-003`'s approved generic sign-in notice and retains its qualified Base egress gap. The AGENT-003 private Slack route now carries the numbers, crossing month, cause and authenticated alert link only to an explicitly mapped and consenting current native finance recipient, with live identity/authority checks and no fallback. Ct approval of that private identity/consent/custody default is pending; shared channels receive no financial detail. The shared Slack fake now proves once-per-breach, worsening and interval generic notices without financial detail. `tests/plaid-cash.test.mjs` proves the bank-fake amount and percentage acceptance, including the $60,000 shortfall, no-change and worsening refreshes and acknowledgment.



<a id="report-007"></a>

## REPORT-007, REPORT-009 — BI and warehouse feeds



Operational metrics flow in from Snowflake, BigQuery or Databricks as driver actuals (for example active users or shipments), by a read-only query that finance reviews. Easel's actuals, plans and versions flow out to Power BI, Looker and Tableau through a read-only, role-scoped dataset endpoint and scheduled CSV or Parquet drops.

Current semantics (sx-easel-c41). Warehouse inputs: finance connects Snowflake, BigQuery or Databricks from a signed-in session (credentials sealed, never archived or returned; BigQuery uses its fixed host with a bigquery.readonly grant, Snowflake and Databricks hosts are owner-entered but must be vendor-owned domains). Finance saves one query per metric (one SELECT returning `period` as YYYY-MM and `value`, at most two decimals), previews its result without changing anything and approves the exact query text with the result fingerprint it reviewed; editing the text withdraws approval. A refresh runs only the approved text and stores the monthly values; a usage revenue driver bound to the metric (`warehouseMetric`) uses the measured quantity for each month that has one and grows from it afterwards, with the trace naming the metric and the approved query. The local query policy parses the warehouse dialect and permits one SELECT with named tables, parsed subqueries and supported scalar or aggregate functions; writes, comments, INTO, unknown syntax, unknown functions and external table functions are refused before provider contact, including on previously saved queries. Databricks accepts the intersection of Spark SQL validation and the Hive SELECT grammar. Finance must supply a read-only role or grant; Easel does not yet verify that credential boundary. Responses are streamed with a 4 MB ceiling, at most 600 monthly rows, complete inline results and a 25-second deadline covering response-body consumption and, for BigQuery, both the grant and query calls. Refusal preserves prior metrics, approvals and plan values. BI dataset: `GET /api/easel/dataset/:dashboard?format=json|csv|parquet|xlsx` returns one row per saved-report row, month and series (actual, source version, comparison, saved versions) in integer minor units with unavailable values empty or null (the xlsx format is the saved report's own formula workbook), built through the saved report, so every REPORT-001, REPORT-008 rule applies to the reader's token or session: current audience and department grants, no individual compensation detail, read scope only. Drops: finance schedules (`bi-drop-save`) a nightly company-zone CSV and Parquet drop of one saved report to a connected Chest, Google Drive or SharePoint store for a named audience account whose current access is rechecked every run; files never carry Pay detail whatever that account's grant; a run records per-file receipts and SHA-256 digests, retries only unfinished files and stops after three attempts for the day. Stage-based and other pipeline metrics inherit onto REV-001.

Ct approval, 22 October 2026 at 18:31 UTC, remains subject to its riders: dialect-parsed single SELECT with prohibited forms refused; a read-only credential boundary and refusal of detectable write capability; timeout, row, byte and cost ceilings; HTTPS vendor hosts without redirects or private resolution, with connect-time address checks; the current named audience, never Pay detail; and no query results retained beyond the pack.

Local query and response proof: `tests/bi-feeds.test.mjs` — “REPORT-007, REPORT-009 a reviewed warehouse query drives a revenue line and a scoped BI token and the nightly CSV and Parquet drop carry the same pay-free dataset rows” asserts supported Snowflake, BigQuery and Databricks SELECTs, pre-contact policy refusals, the 600-row boundary, declared and streamed 4 MB overflow, a stalled response-body deadline, retained prior metrics and unchanged plans through query save, preview and refresh. `tests/bi-feeds-browser.mjs` asserts native query review and approval, streamed overflow and unsafe-function errors with retained metrics and plan at 1440; warehouse errors and BI dataset screens are captured at 1440 and 390.

### Access, audit and governance

Before this capability ships, inherit REPORT-001, REPORT-008 saved-report source/version availability, live audience/Pay detail filtering and aggregate formula Excel on each new report door.



<a id="access-001"></a>

## ACCESS-001 — Groups and per-dimension permissions



Finance creates groups (for example FP&A team, department heads, board) and grants read or edit by dimension member (department, entity, region), by scenario (`CYCLE-004`) and by capability: compensation (`PEOPLE-005`), connections, model structure, approvals and publishing. Every server route enforces the grants, and an access report shows who can see what. Before groups ship, ACCESS-001 inherits CYCLE-004: scenario read/edit group shares use current group membership on every read, comparison, export and write; membership removal ends access immediately. Before shipping, ACCESS-001 inherits REPORT-005: its ownership and group grants govern department-statement recipients, reads and exports, with recipient access rechecked before delivery.

Ct batch-8 ruling E, 22 October 2026: native owner/admin sessions administer groups; only the signed-in owner grants group Pay detail or changes membership of a pay-enabled group. Groups never elevate a person's planner/viewer role. Department grants union with existing assignments unless finance explicitly selects group-only authority; Each grant (a group grant or a direct assignment) is evaluated alone: its departments and every dimension it constrains intersect, including current descendants, and a source untagged in a constrained dimension is denied. Authority is the union of a person's grants, so combining grants never creates a pairing no single grant allows and never narrows another grant. Scenario shares use live memberships. Tokens intersect current authority with their issuance ceiling, including dimensions/members, capabilities, private shares and pay; later grants never expand a token. Global approvals and publishing require both the capability and visibility across every department and dimension member. Unsupported scoped cash/balance/headcount and unattributed discussions, tasks and explanations are unavailable rather than inferred. Gauge connection custody retains ct's 19 October native-finance session boundary; the connections capability confers nothing beyond the native-finance Gauge boundary. ACCESS-002 inherits these live group semantics for SCIM; ENTITY-001 inherits entity-member authority; REPORT-001, REPORT-008 inherits current author and recipient filtering.



<a id="access-002"></a>

## ACCESS-002 — SSO and SCIM



Easel is a SAML 2.0 and OIDC relying party for Okta, Microsoft Entra ID, Google Workspace and [Auth](https://github.com/just-every/run-auth), and a SCIM 2.0 server that provisions and deprovisions people and group membership. Deprovisioning ends the person's sessions at once and keeps their historical attribution.

Adopted conservative implementation default, pending ct approval: enterprise identity is off without explicit installation configuration. SAML uses a pinned IdP certificate/issuer, signed response and assertion, exact audience/destination/recipient, expiring one-use browser-bound request and server-owned subject-to-existing-account associations. OIDC uses Base's pinned presets, PKCE/state/nonce and the same explicit existing-account association. No JIT sign-in account creation or email-claim auto-linking occurs. A separately configured SCIM bearer acts only while its configured native owner remains active; it creates ordinary viewer/contributor members and groups without grants. Native finance assigns group grants. SCIM cannot create/promote owner/admin/finance roles, grant Pay detail or change membership of a pay-enabled group. Live native group grants, role/token ceilings and connection custody remain authoritative. Deprovisioning fences the native account, revokes its sessions, links and API credentials and keeps attribution. Enterprise configuration, machine associations and transaction custody are archive-excluded; identity erasure removes provider associations. Future AGENT-011 governance inherits this machine-authority boundary before managing enterprise provisioning.

Before SCIM groups ship, inherit ACCESS-001 live membership, department/dimension intersection, role and token ceilings, owner-only compensation administration and current connection custody.



<a id="audit-001"></a>

## AUDIT-001 — Model audit trail



Every change to setup, inputs, formulas, mappings, connections, permissions, submissions, approvals, closes and packs is recorded with actor (person or agent), time, record, scenario, revision before and after, and the changed values. Finance filters the trail by person, record, scenario and date, and exports it. The trail is append-only and survives `rer export` and restore.



<a id="erase-001"></a>

## ERASE-001 — Person erasure



Finance can erase a former member's personal data: their name, email and membership details, and, for an employee record from `PEOPLE-*`, their name and identifiers. Planning amounts stay, attributed to a stable pseudonym. Immutable snapshots keep their recorded digest, and every read and export of them shows the pseudonym in place of the erased name. The erasure returns a receipt with counts and time, and the audit trail records it without the erased data. Erasing the last finance member is refused. The member must first be deactivated, and the installation owner cannot be erased. The stable pseudonym is an HMAC of the installation-local person id under a dedicated installation erasure key, never the session secret; that key is excluded from archives. The durable map contains identity hashes and the pseudonym, with no plaintext erased identity, and is carried in archives. Erasure revokes the former member's native sessions, sign-in links and API credentials in the same revision-fenced save. Ct approved the native export policy on 20 October 09:40Z: `rer export` maps every row and snapshot payload at export time; stored snapshot bytes and hashes stay unchanged. The archive manifest names `easel-erasure-v1`, the erasure receipt ids, and original/exported snapshot digests; exported reference digests follow the transformed payloads so restore verifies them. The same map filters app/API/MCP reads, open exports and pack downloads. Current CSV and XLSX original text and encoded journals are transformed before export; a binary original containing a recoverable erased identity refuses export rather than publishing those bytes. Future employee/provider/import record kinds inherit the same identity-map obligation before shipping (PEOPLE-001 to PEOPLE-004, PEOPLE-008, PEOPLE-009, PEOPLE-007, MOVE-001 to MOVE-003, ACCESS-002).



<a id="api-001"></a>

## API-001 — Public API with scoped tokens



The HTTP API (`API.md`) is available to integrations through personal and service tokens with read or write scopes, the issuing person's role and an expiry. Requests are rate-limited, every write is fenced by revision as today, and token use enters the audit trail.



<a id="api-002"></a>

## API-002 — Webhooks and automation apps



Signed webhooks fire on approval, close, publish, refresh failure, alert and task events. Published apps for [Crank](https://github.com/just-every/run-crank), Zapier and Make expose those triggers and the proposal and comment actions.



<a id="api-003"></a>

## API-003 — MCP endpoint for outside agents



An MCP endpoint exposes Easel's reads (scenarios, comparisons, variances, metrics) and its proposal, comment and explanation commands to the person's own agent (for example Claude). It uses that person's authority and filtering, and it can never approve, close, publish or promote.

### Entities, currency and US defaults



<a id="entity-001"></a>

## ENTITY-001 — Multiple entities and management consolidation



A company plans several entities (for example a US C-corp and a services subsidiary), each with its own ledger connection (`CONNECT-001` to `CONNECT-004`, `CONNECT-011`), or several entities from one connection: a Sage Intacct multi-entity shared company (`CONNECT-011`) or NetSuite subsidiaries (`CONNECT-003`). Easel shows consolidated P&L, balance sheet and cash with intercompany balances and charges eliminated by rules finance sets. Entity-level access uses `ACCESS-001`.

Current native management-consolidation semantics: a native owner/admin session binds each entity to its own official working source plan and fixed local currency, and assigns the entities to an explicit reporting-currency group. Derived proposals, branches, approved budgets and kept forecasts retain their entity/currency boundary. A newly bound copied template receives its own entity member and keeps its entered local amounts, without changing its source; bind an inherited template before deriving further versions. Binding a source that contains compensation requires Pay detail. Entity is a stable custom dimension member; input entry cannot relabel an input into another entity, and ordinary scenario reads, comparisons and exports check the live entity grant. Whole-entity statements require every department in that entity; narrower grants use the scoped Plan view. A reader with only some entities sees only those entities, and full consolidated totals remain unavailable.

Each entity has its own budget/average/month-end rate table. Translation happens once per entity before summation; P&L uses average rates and balance sheets month-end rates with a visible translation adjustment. Local cash-flow statements retain local currency. The consolidated cash bridge uses prior month-end opening cash, average-rate receipts/payments and month-end closing cash with a separate cash translation effect. Missing rates, unbalanced or incomplete source statements, and stale/overlapping eliminations make the affected consolidated month unavailable. Finance explicitly reviews both input origins and local charge, receivable/payable and settlement amounts; each side must agree after translation and cannot exceed the selected source or aggregate outstanding balance. No matching or amounts are inferred. Workbook totals use the same authorized sum-less-elimination formulas.

Before entity consolidation ships, inherit ACCESS-001 entity-member grants and live department/dimension intersections on ordinary and consolidated reads and exports.



<a id="entity-002"></a>

## ENTITY-002 — Multi-currency planning



An entity plans in its local currency and reports in USD, using rate tables that finance keeps (budget rate, monthly average and month-end rates). Profit and loss converts at average rates, the balance sheet at month-end rates, and the translation difference is shown. Constant-currency comparisons are available.

Current semantics (sx-easel-r31). This installation's plan is the entity: its plan currency is the local currency, and finance names one reporting currency (USD by default; never the plan currency). Finance keeps one rate row per month with a budget, an average and a month-end rate, each the reporting-currency amount of one unit of plan currency, a decimal above zero with at most six places, stored as integer millionths. Rates are read when a view is built, so revising a rate changes every scenario view (working or frozen) but never rewrites a stored calculation, approved budget, kept forecast or published pack. Every amount is translated once from the plan's own integer cents, rounding half away from zero, and totals are sums of translated parts, so each statement foots. Profit and loss translates each month at that month's average rate. The balance sheet translates every line at the month-end rate; opening equity at the month-end rate of the month before the plan; retained earnings as the running sum of translated monthly profit; contributed equity as the running sum of each month's change at that month's average rate. The translation adjustment is translated assets minus liabilities minus equity, less the plan's own balance difference (which is translated and carried visibly, never absorbed), shown as a running balance and as the month's movement. A month lacking the rate it needs (average for profit, month-end for the balance sheet, the month-end before the plan for opening equity, or an earlier average for the running sums) is listed as unavailable with the missing rate and is never zero or guessed. Cash-flow statements are not translated. For a closed month the constant-currency variance translates the approved budget at the budget rate and actual at the average rate and again at the budget rate: variance = actual − budget, constant-currency variance = actual at the budget rate − budget, and currency effect = actual − actual at the budget rate, so variance = constant-currency variance + currency effect; totals are profit (revenue minus costs) from rounded rows. A reader sees translated amounts only from the same scenario and variance views their role already reads; only finance edits rates, and the rate table is in the open export. Plan-currency changes after rates are entered mark the table as for another currency until finance enters new rates. ENTITY-001 inherits a rate table per entity, and each entity's translated statements before consolidation ships.



<a id="us-001"></a>

## US-001 — US defaults



A new company defaults to USD with `$1,234.56` formatting, US English, MM/DD/YYYY dates, a January fiscal year with any other start month available, US time zones for schedules and reminders, and the US payroll and tax assumptions of `FIN-006` and `PEOPLE-004, PEOPLE-008, PEOPLE-009`. Files with US date and number formats import without extra choices.

Current capabilities complete US-001 under ct's 19 October ruling. Finance can change the reporting currency, fiscal start, English locale (US, UK or Australia), date display (MM/DD/YYYY, DD/MM/YYYY or ISO) and IANA company time zone. New companies use America/New_York, including daylight saving time when scheduled capabilities ship. Native date controls follow the browser/OS picker while transport dates remain ISO; app dates follow the saved display preference. Existing captured amounts and digests are unchanged. FIN-006 and PEOPLE-004, PEOPLE-008, PEOPLE-009 provide their inherited US statutory payroll and tax defaults, with effective-year assumptions and retained finance overrides. CONNECT-005, CYCLE-001, CYCLE-003, REPORT-001, REPORT-008 and REPORT-006 inherit using the saved company zone for scheduled refreshes, reminders, digests, reports and alerts before they ship; no delivery is claimed by setting a zone.

### Move in and out



<a id="move-001"></a>

## MOVE-001 — Move in from Adaptive Planning



Easel imports a Workday Adaptive Planning export (levels, accounts, dimensions and attributes, versions with their data, sheet exports, and the rows of modeled sheets), together with the buyer's mapping. The rows of the personnel or workforce modeled sheet, read through `exportConfigurableModelData`, become Easel positions under `EASEL-007` and `PEOPLE-004, PEOPLE-008, PEOPLE-009`: employees and to-be-hired rows alike, each with its level (mapped to a department), title, start and end dates, salary or hourly rate with hours, and the row's own bonus, benefits and merit assumptions where present. The account totals that the personnel sheet calculates (from `exportData`) are the check: the imported positions' monthly cost per payroll account must equal them for the same version, and any difference is shown before anything is accepted. Pay detail on imported positions is restricted under `EASEL-007` and `PEOPLE-005` from the moment of import, the preview included. Rows of other modeled sheets (for example a capital-asset sheet) are listed, and their account totals still arrive through `exportData`. The import previews what will be created, lists everything that did not map (formulas it cannot translate, modeled-sheet columns with no Easel equivalent, other modeled-sheet rows, access rules), and lands through the journal with undo.

Current move-in semantics: the native Actuals screen accepts original files plus an explicit buyer mapping through `POST /api/easel/import/incumbent/:op`. Adaptive metadata XML and completed CSV/CDATA exports, Planful segment/MTD/custom personnel-dimension exports, Anaplan lists/modules, Runway database/model CSV and Pigment flat list/view exports retain originals and source locations. Each exported version becomes a separate working scenario. Native positions, including salary/hourly pay, benefits, bonus and dated merit, supply payroll; every exported account/level/version/month reconciles in integer cents before acceptance, with no balancing schedule. Source-only attributes, formulas, modeled rows, custom columns and permissions remain listed as unmapped. A reviewed fingerprint binds the originals, buyer choices and current native structure; journal batches fence current session/Pay detail and reviewed target assumptions. Undo removes journal-owned structure and inputs, preserving later business edits/references; its own import status is administrative rather than a business dependency. Aggregate preview is available to current planning members without a fingerprint, personnel, salary fields, originals or raw diagnostics. Native finance with live Pay detail administers acceptance/resume/status/undo. Explicit employee-to-member mappings inherit ERASE-001 for current positions, retained originals, journals and portable restore; source names never establish identity and source permissions never confer native grants. The configured export profiles and primary provider documentation are in `docs/move-adaptive-format.md` and `docs/move-tabular-formats.md`. No live account is claimed or required by these fixture-only clauses.



<a id="move-002"></a>

## MOVE-002 — Move in from Planful



Planful exports of the chart of accounts, segments, scenarios and data load the same way as `MOVE-001`, with a report of unmapped items, totals reconciled and undo.



<a id="move-003"></a>

## MOVE-003 — Move in from Anaplan, Runway and Pigment



Anaplan list and module exports, and Runway and Pigment CSV or Excel exports, load the same way as `MOVE-001`, with a report of unmapped items, totals reconciled and undo.



<a id="move-004"></a>

## MOVE-004 — A parallel month against the old tool



For one closed month, Easel compares its actuals, budget and forecast with the buyer's old tool or spreadsheet for the same month, line by line. Each difference is classified (mapping, timing, formula or source data), and finance signs the comparison off before switching. Finance alone creates, reads, classifies and signs these comparison records (ct, 19 October). A normalized CSV uses existing planning line and department IDs and natural-sign decimal actual, budget and forecast amounts in the reporting currency; a blank department is allowed. Easel compares the union of line/department rows, treating an absent side as zero, to accepted actuals, the approved budget and the forecast kept before close. Finance supplies each classification and its explanation; Easel does not infer the cause. Preview writes nothing and save checks the reviewed content digest. Saved comparisons capture their values; signing checks the exact revision and SHA-256 and requires every difference to be classified, then freezes the values, classifications, original CSV and source digest with the signer and time. Later model edits do not alter the sign-off. The sign-off records finance's decision before an external switch; Easel does not switch tools.



<a id="port-001"></a>

## PORT-001 — An export a buyer can open without Easel



Besides the `rer export` archive (`EASEL-016`), finance can download the whole plan as open files: one CSV per table, an .xlsx per scenario with formulas (`SHEET-004`), the model definition as JSON, and every snapshot and original file, with a manifest of digests.

### Anywhere



<a id="mobile-001"></a>

## MOBILE-001 — Review and approve at phone width



Every review, approval, submission, comment, explanation, dashboard and alert works in the browser at 390 pixels without horizontal scrolling. That includes approving a budget and promoting a proposal. This applies to every capability that exists today; future review, approval, submission, comment, explanation, dashboard and alert capabilities (`CYCLE-001` to `CYCLE-007, CYCLE-009, CYCLE-010`, `REPORT-001, REPORT-008` to `REPORT-007, REPORT-009`, `AGENT-001` to `AGENT-011`) inherit the same 390-pixel obligation before they ship.



<a id="mobile-002"></a>

## MOBILE-002 — Native iOS and Android apps



Native iOS and Android apps sign in as the person and show dashboards, alerts, tasks, approvals and comments. Push notifications cover alerts (`REPORT-006`), tasks (`CYCLE-001`, `CYCLE-002, CYCLE-008`), approvals and mentions. The apps hold no data offline beyond what the person may read, and sign-out wipes it.



<a id="host-001"></a>

## HOST-001 — Hosted operation on the buyer's Cloudflare account



`rer deploy` puts Easel on the buyer's own Cloudflare account with D1, the scheduled refresh handler, encrypted connector secrets and real mail delivery. Hosted health, backups and restore are documented and exercised.

## Push further

Agents keep the plan feasible and honest, not just modeled. Each clause names what the agent does, on which data, and under what human control. Every agent action is governed by `AGENT-011`: it acts with a named person's authority and filtering, it is labeled and audited, and it never approves, closes, publishes, promotes, pays or hires on its own authority.

### Agents that keep the plan feasible



<a id="agent-001"></a>

## AGENT-001 — Constraint watch



*What the agent does:* after every refresh and every promoted change, it recalculates the official forecast and checks each constraint finance agreed: the cash floor, runway minimum, covenant tests (`FIN-003, FIN-010`) and department budget limits. When a constraint breaks, it opens a decision item. The item names the crossing month, the size of the gap, and the source changes that caused it: a slipped deal, a hire starting early, a late customer payment or an unplanned vendor. Each cause is traced to its rows.

*Data:* refreshed actuals and bank balances (`CONNECT-*`), pipeline (`REV-001`), roster and requisitions (`PEOPLE-*`), committed spend (`SPEND-001`) and the official scenarios.

*Human control:* finance defines constraints and who owns each one. The agent only opens items and notifies their owners, and it changes nothing in the plan.

Current native constraint semantics (sx-easel-c46-r1). After every accepted or undone actuals file, month close, promoted proposal, Plaid refresh, change to the agreed cash floor or runway minimum and explicit `constraint-check`, the official working forecast is recalculated and each breached agreed constraint opens one decision item (`GET /api/easel/constraints`, finance): the first crossing month, the gap (floor shortfall or runway) and, from a comparison with the last kept forecast or else the approved budget, the input rows added, removed or changed since then (by origin: a hire that now starts earlier, a contract that moved, a new vendor), without pay detail for readers who may not see it. The owner who agreed the constraint is notified once when the item opens; the item refreshes while the breach persists, clears when it ends and stays rejected until it clears if the owner rejected every response. The watch changes nothing in the plan. Native FIN-003, FIN-010 minimum cash, minimum liquidity and maximum leverage tests now open one item per financing source and test, with the first future crossing month, exact gap and native source trace. Finance saves monthly department spending limits through `department-limit-save`; cost of sales and operating expense cells, including aggregate payroll, are compared at integer cents, and the saving finance person owns the item. Equality passes. Removed rules clear existing items. These checks and limit saves never revise the forecast. Covenant and department items require ordinary human-reviewed proposals; automatic response search remains confined to cash and runway. Deal IDs and stage changes still need REV-001.



<a id="agent-002"></a>

## AGENT-002 — Feasible responses for the owner to choose



*What the agent does:* for an open decision item, it searches the levers finance has marked as adjustable, such as hire start dates by role, discretionary spend lines, collection terms, a credit-line draw and price changes. It returns three to five responses that restore the constraint, each with the least change it needs. Each response is a proposal bound to the forecast revision (`EASEL-012`), with its changed inputs, moved cells, the new lowest cash and runway, and what it costs (for example revenue forgone by a delayed sales hire).

*Data:* the model, the levers and bounds finance set, and the constraint.

*Human control:* the owner picks a response or rejects them all with a reason. Finance promotes the chosen proposal at its exact revision. Levers that are not marked adjustable are never touched.

Current semantics (sx-easel-c41). Finance (approvals permission) marks levers adjustable with a bound on the official working forecast: delay a not-yet-started hire by up to N months (needs Pay detail), cut a recurring or one-off expense by up to N percent, or collect a contract N days sooner. Only those inputs, found by origin and only while they have not started, are ever changed. `constraint-respond {item, revision}` searches single levers (smallest change that restores the constraint on a recalculation of the whole forecast), then combinations of the levers that cannot do it alone, keeps one response per set of levers, ranks by total change then revenue forgone and creates up to five draft proposals bound to the forecast revision; each states its changes, the new lowest cash and shortest runway, the revenue forgone and its moved cells. A response must restore the cash floor and the runway minimum in every forecast month. `constraint-reject {item, reason}` closes the drafts with the owner's reason; promotion of the chosen proposal is the ordinary `proposal-submit` and `proposal-promote` at its exact revision, after which the item clears. The agent calls no model and writes only draft proposals. Credit-line draw levers inherit onto FIN-003, FIN-010 and price levers onto REV-001.



<a id="agent-003"></a>

## AGENT-003 — Asking owners for uncertain assumptions



*What the agent does:* when a response or forecast depends on an uncertain input (a deal's close date, a hire's start, a large customer's payment date or a vendor renewal), it asks the input's owner a structured question by email, Slack or [Nook](https://github.com/just-every/run-nook), for example "Will Acme sign before 30 November? Yes, No or a new date". It records the answer as a sourced assumption with the person and time, and recalculates.

*Data:* the deal, position or invoice behind the input, and its owner from the CRM, HRIS or ledger.

*Human control:* the answer is the owner's. Finance can override it with a note, and unanswered questions escalate to finance after a set time and never default to an answer.

Current native-input semantics (sx-easel-c42, ct approved 22 October 2026 at 21:32 UTC). Finance with company-wide approval authority enables questions explicitly (off by default), binds an active permitted person to an explicit contract-start, hire-start or one-off vendor-payment date and records the reviewed ownership source, question and escalation instant. Shared chat keeps CYCLE-003's approved generic sign-in notice; email carries the structured question. Only the bound owner answers in a native session; Yes retains the date, No supplies no date, and a new date is validated against the forecast horizon and closed periods. The answer retains source, authenticated person and UTC time; finance overrides only with a note. A finance-requested recalculated draft proposal carries that evidence and the exact source and forecast revision. The official forecast changes only through ordinary submission and exact-revision finance promotion. A named scheduler escalates an unanswered question once at its saved deadline without answering it or changing an assumption. Finance can stop questions or cancel a stale question with a reason. Native source ownership is explicitly reviewed, never inferred from a historical deal name or email. REV-001, PEOPLE-001/002/003 and REV-002 inherit provider-derived owners and dated deal, hire and invoice questions before their adapters ship; AGENT-011 inherits the local switch, scheduler labels and audit trail into its global governance.

Current private Slack semantics (sx-easel-c42, ct approved 22 October 2026 at 21:32 UTC). A native finance owner or admin explicitly connects a sealed, archive-excluded workspace bot and maps an active native person to an exact Slack human profile with the same email and workspace. That person alone consents to their exact identity, connection and mapping revision. Only structured owner questions and cash alerts use this private route. Every send rechecks current native authority, bot and human identity and a single-person private conversation through Slack's fixed API host. A durable intent captures the exact identity; changed or revoked consent, missing custody and changed authority block rather than choosing another route. Unknown sends are never retried. A disconnect attempts key revocation and deletes local custody even when remote revocation is unconfirmed. Shared chat stays generic under the existing CYCLE-003 ruling.



<a id="agent-004"></a>

## AGENT-004 — Learning from the company's own forecast errors



*What the agent does:* it compares every kept forecast with actual results by driver and period. It separates timing differences from permanent ones and from driver error, measures how this company's assumptions miss (stage probabilities, close-date slippage, hire slippage, collection lags, churn), and suggests revised assumptions with a backtest. The backtest shows how the revision would have performed on the last six to twelve kept forecasts.

*Data:* kept forecasts (`EASEL-013`), actuals, deal history, roster history and confirmed variance explanations.

*Human control:* finance approves each assumption change as a versioned proposal after seeing the backtest. Kept forecasts and snapshots stay reproducible.

Current semantics (sx-easel-c41; Easel calls no model, every figure is integer arithmetic over reviewed rows). Deal history is a finance-only reviewed door (`deal-outcomes-save`, `GET /api/easel/deal-history`): each deal has an ID, name, expected and actual close dates and, optionally, a linked contract origin, invoice date, paid date and invoice amount; there is no CRM pull until REV-001. The agent reads a working forecast with a closed month through `GET /api/easel/forecast-learning/:scenario` (finance only; pay-detail readers see payroll rows and hire slippage, finance without pay detail see neither). Each kept forecast is compared with the months that closed after it, by line, department, driver sources and month, carrying confirmed explanations. The error (actual minus kept) is split exactly: timing is twice the amount that offsets itself across the closed months for one line and department; driver is the part of the remaining net error that the measured revisions below would have removed; permanent is the rest. Three assumptions are measured: close-date slippage (mean whole days, half away from zero, from deal history), hire slippage (mean days between planned and actual start in accepted roster history) and collection lag (observed days from invoice to payment less the linked contract's planned DSO). A measure needs at least three observations, a non-zero mean and at least six kept forecasts that still recalculate to their stored cells; a backtest uses the last up to twelve, revises only inputs that had not started when the forecast was kept, and compares summed absolute error against what actually closed (collection lag compares monthly collections of the linked invoices). A suggestion is made only when the revision lowers that error. `learning-propose` creates a draft proposal from the current forecast that cites the backtest and moves only inputs that have not started; the forecast, kept forecasts and snapshots change only when finance submits and promotes that exact proposal revision through the ordinary doors. Stage probabilities inherit onto REV-001 (stages and probabilities) and churn onto REV-002 (subscription churn): until those drivers exist there is nothing to measure, and the view says so.



<a id="agent-005"></a>

## AGENT-005 — Source-change guard



*What the agent does:* before a refresh completes, it detects new or renamed GL accounts, changed departments or classes, missing payroll rows, a CRM or billing feed that stopped updating, and sudden changes in a source's shape. It proposes mappings with its reasons and shows which reports, scenarios, packs and alerts would change.

*Data:* refresh previews, mapping rules (`CONNECT-006`) and freshness (`CONNECT-005`).

*Human control:* finance approves mappings and exclusions. Missing data blocks dependent conclusions and alerts rather than becoming zero.

Current source-door semantics (sx-easel-c42; pattern 1). Finance with company-wide source-review and Pay detail authority stages a named one-month ledger observation through `source-guard-stage`; ordinary actuals previews remain write-free. Staging derives the actual CSV preview, records the exact file fingerprint and complete observed account-name/type, department/class/tracking and column metadata, explicit source observation/next-update times, and finance-declared expected payroll dates and employee-row counts. New unresolved accounts propose matching planning-line names with an explicit reason and never apply themselves. Repeated observations surface renamed accounts, changed source dimensions and column shape; overdue observations are stale on reads and cash checks. Missing payroll requires accepted register evidence for that provider/date/count, or an explicit finance exclusion with person/time/reason. Mapping approvals use the existing mapping commands. Every decision is fenced on the reviewed source revision and fingerprint; changed files in a tracked period cannot bypass staging through ordinary CSV acceptance. An accepted file completes the matching source review in the fenced acceptance save.

The impact view lists currently permitted working scenarios, reports, packs and alert rules; another person's private report never becomes visible through a stored impact list. Unresolved or not-yet-accepted observations hold dependent working calculations and cash alerts, with no replacement amount or new alert send. Earlier sends are labeled historical, and accepted refreshes show resumed dependency states. Published packs and frozen calculations retain their captured values. Current GL and payroll sources are reviewed files, not live provider pulls. CONNECT-001/002/003/004/011, PEOPLE-001/002, REV-001/002 and CONNECT-005 inherit these change-preview, coverage, mapping, impact and stale-source guard obligations for their future live source adapters; their unfinished adapters are not claimed here.



<a id="agent-006"></a>

## AGENT-006 — Following decisions through to results



*What the agent does:* it links each published decision and action (`EASEL-014`) to its forecast effect, owner and due date. It chases updates before the due date, and after the period closes it compares the realized cash, revenue, headcount and capacity with the assumption that was approved.

*Data:* packs, decisions, actions, later actuals and the proposals that implemented them.

*Human control:* owners can revise or stop an action, with a reason. Finance approves any change to a decision, and salary detail stays role-restricted.

Current doors: a decision recorded in a draft review pack may cite one proposal promoted into that pack's forecast. Promotion captures, for every plan month whose payroll, revenue, headcount or capacity moved, the forecast just before promotion and as promoted, in integer cents and counts: payroll is payroll-line cells plus position costs on other lines; revenue is profit-and-loss revenue; cash is closing cash, unavailable when that month's cash is incomplete; headcount is planned positions; capacity is active positions in each services driver's department × its monthly available hours, in hundredths of an hour. Promotions made before this capture cannot be cited, and a cited promotion cannot be deleted. The scheduled run acts as `scheduler:actions` for the first still-active owner or admin who published a pack. It chases each open action whose owner is recorded as the email of a person who can still read the action's department: one CYCLE-003 notification ("Update due on your action", by that person's email, digest or chat preference) per due date, from 3 calendar days before the due date in the saved company zone until the day before it. Done or stopped actions are never chased; a revised due date is chased again; an owner recorded only as a name is never chased and only finance follows that action up. Only the action's owner or finance revises its due date or stops it, always with a reason. A proposed change to a decision's text or cited promotion, by its owner or finance, stays pending until finance approves or rejects it. Follow-up is recorded beside the published pack; the pack snapshot never changes. `GET /api/easel/decisions` reports, per effect month, the before, approved and realized values once the month closes: realized payroll, revenue and cash come from the forecast's closed months on accepted actuals (ledger figures, not bank balances); realized headcount comes only from reviewed roster files (`PEOPLE-006`) and realized capacity only from accepted Gauge available time on every services driver (`REV-003`), otherwise each is unavailable, never zero. The payroll saving is before minus approved (approved) and before minus realized (realized), summed over the months whose payroll moved, compared through the closed months and complete once all of them have closed. Every member reads decisions and these aggregate amounts as in the pack; position titles and salaries are never included. Easel calls no model for this follow-up. Under MOBILE-001, the Review tab's Decision follow-up card shows every published decision's chases, history, pending changes and before, approved and realized results, with the owner's revise, stop and change forms and finance's approve and reject, at 1440 and 390 pixels without page overflow.

### Agents that explain and model



<a id="agent-007"></a>

## AGENT-007 — Variance commentary grounded in sources



*What the agent does:* after close, it drafts an explanation for each material variance. Each draft cites ledger rows, deals, roster changes, vendor bills and committed spend, and labels each claim as evidence-backed or a hypothesis.

*Data:* the variance view (`EASEL-013`) and connected sources, under the department's filtering.

*Human control:* drafts are drafts. The department owner confirms or rewrites each one, and finance publishes. An unconfirmed draft never appears in a published pack. Structured `citationIds` on an explanation name accepted ledger rows in that same month, planning line and department, visible to the writer through the variance door. The server checks them on save, confirmation and publication; duplicate IDs are retained once. Human text can omit the list. These checks establish the cited rows, not the truth of a narrative claim. New published packs capture only confirmed non-pay explanations; later confirmation never changes an earlier pack.

Current model door (sx-easel-c42; ct approved 22 October 2026 at 21:32 UTC). Model drafting is off and stopped by default. Native finance configures an owner-chosen OpenAI model, declared input and output USD rates and a monthly UTC budget; native finance with Connections permission explicitly consents to sealing an owner-provided key. It is never returned or archived and must be re-entered after restore. The existing variance writer previews one visible non-pay variance and its accepted-row whitelist, then explicitly consents to that exact fingerprinted request. Dimension-scoped readers who cannot use the native variance door cannot bypass it through this door. No position data, pay row, other department, prior narrative or model tool reaches the request. The sole endpoint is OpenAI's fixed HTTPS Responses API, redirects refused, `store: false`, a strict claims schema and no tools; no provider retention or training claim is made.

Before the single call, a native-session-fenced intent and a conservative USD allowance are committed: complete UTF-8 request bytes plus envelope overhead bound input tokens, with the configured output cap and declared rates. Every attempt retains its reservation, including refused or unknown outcomes; an exact consumed request is never retried automatically. This is an allowance, not provider-reported cost. Current sources, settings/key revisions and the live person are rechecked before egress and draft acceptance. Each evidence claim needs permitted existing row IDs; hypotheses are labeled, and unknown/foreign citations refuse the draft. Only an ordinary unconfirmed explanation is saved, labeled with agent/model/run; existing human confirmation and finance publication remain mandatory. A local stop prevents accepting an in-flight response. AGENT-011 inherits this provider custody, per-agent stop, allowance and audit machinery into its full global governance; future CONNECT, REV and PEOPLE source adapters inherit their scoped evidence before reaching commentary.



<a id="agent-008"></a>

## AGENT-008 — Modeler agent



*What the agent does:* it turns a request in plain language ("add a second sales team in the Southeast ramping from April", "model a 5% price increase on annual plans from January") into a proposal. The proposal carries a structure and input diff, formulas (`MODEL-004`), the cells that move and a short test of expected values.

*Data:* the model and its scenarios, under the requester's authority.

*Human control:* the result is always a proposal. Finance promotes it at its exact revision (`EASEL-012`), and model-structure changes need a person with the model-structure permission (`ACCESS-001`).

Current reviewed-modeler semantics (sx-easel-c42, ct approved 22 October 2026 at 21:32 UTC). Native company-wide finance with Pay detail and model-structure permission explicitly enables and resumes this agent (off and stopped by default), consents to reusing the owner-chosen model/key/rates and sets a separate monthly conservative USD allowance. Review configures the shared sealed, archive-excluded key; Scenarios previews the exact model and natural-language request, including permitted pay assumptions, and needs explicit per-call consent. One fixed OpenAI Responses request uses a strict schema, no tools and no automatic retry. A durable intent reserves allowance before egress; every outcome retains it. Current person, key and settings, source revision and fingerprint and stop are checked before send and acceptance.

The safe output is limited to planned salary positions, volume revenue drivers and native formulas using existing permitted lines/departments. Ordinary native commands build a separate draft in an isolated context. The server recalculates its actual input/cell differences and requires exact decimal expected-value checks for every moved line and every formula; unsupported operations or failed checks save no partial proposal or inputs. The proof labels agent work, reused structure and added formula definitions, moved inputs/cells and actual checked values; a changed source or proposal is visibly stale. The official scenario stays unchanged until ordinary submission and exact-revision human promotion, which independently requires model-structure permission. No agent approves, closes, publishes, promotes, connects, pays or hires. AGENT-011 inherits the chosen-provider custody, local budget/stop, named authority and audit machinery into its global governance.



<a id="agent-009"></a>

## AGENT-009 — Analyst with cited answers



*What the agent does:* it answers questions about the plan and actuals ("why is Q3 burn higher than budget?", "what happens to runway if we lose our largest customer?"). Each answer cites cells, rows and deals, and a what-if becomes a private scenario (`CYCLE-004`).

*Data:* everything the asker may read, and nothing else.

*Human control:* the answer is read-only. What-ifs stay private until the asker shares or submits them, and a salary the asker cannot see never reaches the answer.

Current aggregate analyst semantics (sx-easel-c46-r1; ct approved 23 October 2026 at 11:18 UTC). A native member explicitly previews and consents to each request. The fixed chosen-model endpoint receives whitelisted visible monthly cells and available aggregate cash only, without positions, source traces, original rows or compensation inputs. The model selects citations; the server validates them against that exact request and renders native totals, discarding all provider prose. Requests reserve the shared monthly allowance before egress, never retry automatically, and recheck source, live authority, key and governance revisions before acceptance. Output is labeled agent work and remains read-only. An optional equally visible reference scenario supplies native integer-cent differences, with both cell citations; these explain the arithmetic without claiming a cause. The shared key grants no additional source authority. A planner explicitly chooses an expense amount or a customer revenue source to remove, then `/api/easel/analyst/what-if` creates a private CYCLE-004 sandbox and applies only that native edit under the requester’s live permissions. Viewers cannot edit, stale analyses refuse, the official source is unchanged and the result returns native cash citations. Ordinary sandbox sharing and submission remain deliberate human actions. Future REV-001 and REV-002 sources inherit the same visibility, exact consent and validated citation boundary.



<a id="agent-010"></a>

## AGENT-010 — Recurring missions



*What the agent does:* a validated analysis (for example a weekly cash brief, a month-end flux review or a pipeline coverage check) is saved as a mission that runs on a schedule and delivers its result to named people. The result carries the same citations and labels as `AGENT-009`.

*Data:* as `AGENT-009`, under the mission owner's authority.

*Human control:* finance approves each mission and its audience. A mission whose sources are stale (`CONNECT-005`) says so instead of reporting.

Current weekly semantics (sx-easel-c46-r1; ct approved 23 October 2026 at 11:18 UTC). Native company-wide finance approves a previously answered analysis and an exact audience of active native finance people. The saved scenario, analysis month and question run Monday at 08:00 in the saved company zone, under the still-active approving person's scheduler authority. Each occurrence and each mail intent is durable before egress, with no automatic retry of unknown outcomes. Current recipient authority, mission enablement and global stop are rechecked before sends. Existing Gauge, Gusto and Plaid connection observations are read without refreshing them; previously connected sources that are disconnected, lack their excluded key, have errors, no refresh, future observations or observations older than 24 hours produce a stale notice instead of a model report. This conservative observation cutoff does not implement CONNECT-005 scheduling. Agent and model labels and cell citations travel in the result.



<a id="agent-011"></a>

## AGENT-011 — Agent governance



*What the agent does:* every in-product agent runs under a named person's or service's authority and filtering. It uses the owner's chosen model provider and key, within a monthly USD budget, and every action and model call is recorded in the audit trail (`AUDIT-001`). Agent output is labeled as agent work.

*Data:* the audit trail and agent settings.

*Human control:* finance enables each agent, sets its budget and can stop all agents at once. Agents can never approve, close, publish, promote, connect, pay or hire.

AGENT-006's deterministic action chases ship before this clause: they call no model, act as `scheduler:actions` for a still-active owner or admin who published a pack, and are recorded in Activity. Before shipping, AGENT-011 inherits them: per-agent enablement, the stop switch and agent labels cover those chases as well.

Current global governance slice (sx-easel-c44; ct approved 23 October 2026 at 11:18 UTC). Native company-wide finance controls enablement for the current agent catalogue, a shared monthly USD ceiling in addition to existing individual model allowances, and one global stop. Existing agents retain their shipped native enabling rules until finance changes governance; new Analyst and Recurring missions start disabled. The model, fixed endpoint and sealed archive-excluded owner key remain the AGENT-007 provider configuration. A reservation is an audited conservative allowance rather than provider-reported cost, and attempts retain it on unknown or refused outcomes. Changing governance invalidates outstanding model previews and results, including a stop followed by resume. The stop covers current commentary, modeler, analyst, missions, MCP calls, constraint watch and responses, owner questions, learning, source staging and scheduled action chases; passive source safety holds remain enforced. Agents cannot exercise approval, publication or connection administration, and the closed MCP catalogue refuses approve, close, publish, promote, connect, pay and hire operations. Supporting work still checks the current grant and its original token ceiling: a service credential may edit a working forecast horizon, and a previously reviewed Sheets schedule may read its saved range and submit a proposal. Neither can approve or promote it, and the schedule cannot administer connection credentials. Later agent doors inherit these same checks before shipping.
