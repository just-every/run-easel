# Excel live-data bridge

The Excel manifest, production shared runtime, native session API and streaming functions are available. SHEET-001 remains partial: Microsoft 365 host access is not held, so real host installation, sign-in, dependency recalculation, reopen behavior, CONNECT-010 qualification and the recorded Excel on the web run remain unproved. The browser workbook importer remains available.

## Install and refresh

Download `GET /api/office/manifest/Excel` from the trusted HTTPS installation and sideload that XML using your organization’s Office add-in process. The manifest uses the installation origin for the shared-runtime page, function metadata and script assets. No account identity or credential enters the manifest. Supported hosts require CustomFunctionsRuntime 1.1 and SharedRuntime 1.1. Unsupported hosts refuse startup. This is installable metadata, not a receipt of Microsoft host installation.

Open the task pane and follow **Sign in to Easel** using the native account. Refresh requires that Excel’s runtime has a valid native session for this origin; an external browser’s sign-in does not itself prove that the embedded host shares that session. No Microsoft token, bearer token or session is transferred into the workbook. Real host sign-in lifecycle remains an explicit qualification gap.

Use `=EASEL.VALUE("Revenue","Sales","2026-01","<scenario-id>")`. Use `=EASEL.REPORT("<report-id>","2026-01","budget")` for a spilled two-column report range. Report amounts are formatted currency strings; unavailable report amounts remain labeled unavailable. The report uses the existing saved-report audience, current source authority and aggregate filtering; it never includes compensation inputs or traces. A removed audience or expired session replaces prior results with an unavailable error. API tokens are refused for both read functions.

**Refresh workbook** refreshes all active Easel functions; **Refresh selection** refreshes anchors within the selected worksheet rectangle. A report spill is selected by its anchor. Both commands request a full dependency recalculation, including after refused reads. Reopening starts the shared runtime and each function invocation reads fresh data. Cancelled functions are removed from the active set; late responses cannot replace a newer result.

## Read a cell

A signed-in person can read `GET /api/easel/excel/<scenario-id>/value` with `line`, `department` and `month` query parameters. Line and department selectors accept a stable ID or one unambiguous exact name. The scenario selector is a stable ID, so a renamed or similarly named version never silently changes a workbook's source. The response contains the integer-cent amount, currency, selectors and current scenario revision. Missing or inaccessible cells refuse the read; they never become a successful zero.

Every read uses the same server-filtered scenario view as Plan. It returns aggregate amounts without input records, employee names, compensation terms, source rows or traces. Current membership and dimension grants apply on every request. There is no offline authority or persisted session in a workbook.

`./public/excel/functions.mjs` exports `excelFunctions` and `readExcelValue`. The former registers a streaming `VALUE` function with an injected Office host. It publishes decimal currency amounts, refreshes active function invocations and asks Excel for a full dependency recalculation. The caller invokes `refresh` for an explicit refresh and `open` when the workbook opens. Cancelled invocations stop receiving results. A superseded read cannot overwrite a newer refresh. Failed refreshes replace successful values with unavailable errors. The production bootstrap registers ribbon and task-pane commands for workbook refresh and selection refresh, enables shared-runtime startup on workbook open, and registers the report-range function. Selection refresh reads only active function anchors inside the selected range; a workbook refresh reads every active invocation. A failed authority check clears all active values, including report ranges. Real Excel dependency and reopen behavior still require host qualification.

## Write an input

A native signed-in person posts `scenario`, `revision`, `schedule`, `month` and a decimal-string `value` to `POST /api/easel/command/excel-write`. API tokens refuse this command. It accepts an existing editable schedule input and preserves grid validation, Pay authority, dimension authority, closed-actual protection and the atomic session and model revision fences. It does not overwrite driver-calculated cells.

A contributor's own requested or returned budget submission receives a direct grid entry at the next revision, attributed to that person. Their subsequent submission captures that revision. After submission, the write creates and submits a separate proposal bound to the current target revision; the target remains unchanged. Contributor writes to other working plans likewise require proposal review. Finance uses its existing browser editing authority. A viewer, another department, an approved budget, a kept forecast or a stale revision receives a refusal. Proposal promotion retains the existing exact-revision finance review.

No provider credentials, Microsoft tokens or new connection records are stored by this bridge. CONNECT-010 qualification for the eventual installed add-in remains unproved; this module makes no provider-revocation claim. Values already exported into a user's workbook remain under that document's sharing controls.

## Qualification boundary

`./tests/excel-browser.mjs` loads the production manifest URL, task pane, metadata and bootstrap against the built Easel Worker with native sessions. Its injected Office boundary proves action wiring, selection versus workbook reads, report matrices, fresh reopen reads and expired-session clearing. The independent SUM in that boundary is a simulation; it does not qualify Excel’s calculation engine. `./tests/grid.test.mjs` proves native role and audience filtering, token refusals, revoked reads, direct entry, proposal revisions and immutable-version refusals. Neither journey replaces the required recorded Excel on the web run or Windows and Mac host qualification.
