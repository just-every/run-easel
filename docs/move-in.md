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
