# Excel live-data bridge

The native session API and streaming function module are available for the Excel add-in. This is a partial implementation of SHEET-001: an installable Excel add-in and a recorded Excel on the web qualification have not shipped. The browser workbook importer remains available.

## Read a cell

A signed-in person can read `GET /api/easel/excel/<scenario-id>/value` with `line`, `department` and `month` query parameters. Line and department selectors accept a stable ID or one unambiguous exact name. The scenario selector is a stable ID, so a renamed or similarly named version never silently changes a workbook's source. The response contains the integer-cent amount, currency, selectors and current scenario revision. Missing or inaccessible cells refuse the read; they never become a successful zero.

Every read uses the same server-filtered scenario view as Plan. It returns aggregate amounts without input records, employee names, compensation terms, source rows or traces. Current membership and dimension grants apply on every request. There is no offline authority or persisted session in a workbook.

`./public/excel/functions.mjs` exports `excelFunctions` and `readExcelValue`. The former registers a streaming `VALUE` function with an injected Office host. It publishes decimal currency amounts, refreshes active function invocations and asks Excel for a full dependency recalculation. The caller invokes `refresh` for an explicit refresh and `open` when the workbook opens. Cancelled invocations stop receiving results. A superseded read cannot overwrite a newer refresh. Failed refreshes replace successful values with unavailable errors. The module does not yet provide the installable manifest, Office sign-in lifecycle, selection command, report-range function or command wiring.

## Write an input

A native signed-in person posts `scenario`, `revision`, `schedule`, `month` and a decimal-string `value` to `POST /api/easel/command/excel-write`. API tokens refuse this command. It accepts an existing editable schedule input and preserves grid validation, Pay authority, dimension authority, closed-actual protection and the atomic session and model revision fences. It does not overwrite driver-calculated cells.

A contributor's own requested or returned budget submission receives a direct grid entry at the next revision, attributed to that person. Their subsequent submission captures that revision. After submission, the write creates and submits a separate proposal bound to the current target revision; the target remains unchanged. Contributor writes to other working plans likewise require proposal review. Finance uses its existing browser editing authority. A viewer, another department, an approved budget, a kept forecast or a stale revision receives a refusal. Proposal promotion retains the existing exact-revision finance review.

No provider credentials, Microsoft tokens or new connection records are stored by this bridge. CONNECT-010 qualification for the eventual installed add-in remains unproved; this module makes no provider-revocation claim. Values already exported into a user's workbook remain under that document's sharing controls.
