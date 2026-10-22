Easel moves in two kinds of file. Both preview without saving anything, keep the original file, and can be undone.

## Actuals from your general ledger

On the **Actuals** tab, under **Upload actuals (CSV)**, choose a general-ledger detail export: one row per posted line, with a heading row.

| Column | Needed | Notes |
|---|---|---|
| Date or Period | yes | Dates as DD/MM/YYYY, YYYY-MM-DD or MM/DD/YYYY, or a YYYY-MM period |
| Account code | yes | Mapped to a planning line, the cash balance, or excluded |
| Account name | no | Shown beside the code |
| Department | no | Mapped to an Easel department or "No department" |
| Debit and Credit, or Amount | yes | Separate columns, or one column with debits or credits positive |
| Description, Reference | no | Kept, and cited in variance explanations |

Press **Preview**. Easel shows how many rows it read, how many can be accepted and which are rejected, with their line numbers and why: a malformed date or amount, no account, an exact repeat of an earlier line, or a row already accepted in another import. Map every account and department, preview again, confirm that the rejected rows stay out, and press **Accept 14 rows**, named for the rows that can be accepted.

**Reconciliation** then shows every month: imported net = mapped + excluded + cash + unmapped, and whether it balances. **Undo import** removes every row an import added, unless a closed month already uses it; then import a correcting file instead.

A file can hold up to 5,000 rows and 2 MB; split larger exports by month.

## Your Excel planning workbook

Under **Move in a planning workbook (.xlsx)**, choose a workbook with one sheet laid out as one row per line and department and one column per month, with headings `Line` and `Department`. Months can be headed `Jul-26`, `Jul 2026`, `2026-07` or an Excel date.

- Easel translates arithmetic, SUM, IF, cross-sheet/month references and exact lookups into a live model. Unsupported cells are listed with sheet, address and reason and retain their cached values. Supported formula totals and plan-cell caches must reconcile before import; recalculate the source workbook if they differ. In Plan, Workbook drivers changes numeric assumptions; the planning grid changes constant plan cells. Formula cells stay calculated from their sources.
- Rows that start with "Total" are skipped, because Easel calculates totals.
- Names that do not match an Easel line or department are matched in the preview.

Press **Import as a new scenario**. Each row becomes a monthly schedule that keeps its file, sheet, row and every month's cell address, such as `Budget!D7`. [Compare it](/docs/scenarios) with your budget, adopt it with **Use as …**, or press **Undo workbook import**. Undo keeps anything someone has edited since.

## Adaptive Planning, Planful, Anaplan, Runway and Pigment

On Actuals, **Move in an existing planning model** accepts original exports plus a buyer mapping JSON. Select the provider, all original files and the mapping, then choose **Preview planning model**. The preview writes nothing. It lists created departments, accounts, dimensions, members, versions and positions, unmapped attributes/formulas/access rules/custom columns, and every version/account/department/month reconciliation. Each source version becomes a separate working scenario. Original access rules never confer Easel permissions.

The mapping JSON contains `files` (original filename and export context), `options` (the exported table layout) and `mapping`. Mapping keys use source IDs: `levels` chooses an existing department ID, `"create"`, or `"exclude"`; `accounts` chooses an existing line ID or `{ "name": "Payroll", "type": "operating-expense", "payroll": true }`; `dimensions` and `members` choose existing IDs or `"create"`. Every referenced account and department must map. `personnelColumns` maps native position fields to the exact exported headings: holder/title, salary or hourly pay and expected hours, start/end, benefits, on-costs, bonus percentage and payment period, merit percentage and ISO date. `memberMap` optionally associates a source employee ID with an existing Easel member email for erasure; names never establish identity. Fixtures include complete mapping recipes, with synthetic source data.

- [Adaptive export shape and recipe](/docs/move-adaptive-format): original metadata XML, CSV inside completed data responses, personnel modeled-sheet rows and Excel sheet evidence.
- [Other provider export shapes and recipes](/docs/move-tabular-formats): Planful segments/MTD/custom personnel dimension, Anaplan lists/modules, Runway model/database blocks and Pigment flat views/lists.

Native positions calculate payroll. Their monthly payroll-account costs must equal the exported account totals to the cent, including the row's entered bonus, benefits and merit. Missing totals or differences block acceptance; Easel creates no balancing schedule. Native compensation uses the documented PEOPLE-004 planning conventions, so a source with different date, tax, rounding or component-account rules must be reconciled or explicitly remapped first. Unsupported modeled sheets remain listed; their account values still arrive through the data export. No connector account or provider API key is needed.

After checking the preview, **Accept reviewed planning model** commits only that fingerprint through the import journal. A changed mapping or target assumptions requires another preview. **Continue model import** resumes unfinished batches. **Undo model import** removes journal-owned records and preserves independent edits or references as visible conflicts. Original files and explicit personnel identity associations follow the existing erasure/export rules.

A viewer may post the same source bundle to `POST /api/easel/import/incumbent/preview` to read permitted aggregate headcount, payroll and account totals. The response omits personnel, salary fields, source diagnostics, mappings, fingerprints and originals. Finance with live Pay detail administers acceptance, continuation, status and undo through the same route with `commit`, `resume`, `status` or `undo`.
