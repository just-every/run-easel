# Gusto connected roster and payroll observations

Settings → Payroll connection → Gusto accepts an already authorized company access token and its company ID. A native finance session with company-wide access and current pay permission must connect, preview, accept, continue or undo a pull. Personal tokens, agents, schedulers, contributors, viewers and finance without current pay permission cannot use this door.

This manual partner-managed source does not require an owner Gusto browser login. The owner consent step was explicitly dropped on 20 October 2026 because the partner-managed demo company has no browser account. It is separate from a future customer OAuth redirect flow. Easel neither creates a Gusto account nor implements a refresh-token exchange here. When the supplied token expires, reconnect with a valid company token.

## API integration

The adapter exports:

| Module | Entry point | Route |
| --- | --- | --- |
| `src/easel/gusto-connection.ts` | `gustoStatus(c)` | `GET /api/easel/connections/gusto` |
| `src/easel/gusto-connection.ts` | `gustoConnection(c, env, op, body)` returning fenced extra D1 statements | `POST /api/easel/connections/gusto/connect` and `/disconnect` |
| `src/easel/gusto-import.ts` | `gustoImport(c, env, op, body)` returning the existing `KitStep` | `POST /api/easel/import/gusto/{preview,commit,resume,undo,status}` |
| `src/ui/gusto.tsx` | `GustoConnection()` | Existing Settings card conventions |

Connection input is `{environment: "demo" | "production", companyId, accessToken, consent: true}`. The company read must confirm the supplied ID before custody is saved. Credentials are domain-separated AES-GCM ciphertext in the same archive-excluded `e_connection_secrets` table as Plaid, under `id='gusto'`. No token or ciphertext is written to model records, Activity, import journals or retained source CSV. Restored installations must reconnect. Disconnect deletes the local credential and retains accepted history; it does not claim to revoke the Gusto grant. Revoke provider access separately in Gusto.

Preview input is:

```json
{
  "scenario": "<editable scenario ID>",
  "line": "<payroll-classified line ID>",
  "asOf": "<today's UTC YYYY-MM-DD>",
  "windowStart": "<YYYY-MM-DD>",
  "windowEnd": "<YYYY-MM-DD>",
  "payrollHistoryStart": "<explicit earliest provider pay-period boundary YYYY-MM-DD>",
  "employeeMap": {
    "<provider employee UUID>": {
      "department": "<department ID>",
      "positionOrigin": "<planned position origin ID>",
      "memberEmail": "<associated Easel person, if applicable>"
    }
  }
}
```

For a deliberately unplanned employee, explicitly choose `{department, positionOrigin: "", unplanned: true}`. Neither a matching employee name nor a provider department label establishes a mapping. Every employee in the roster or newly retrieved payroll must be reviewed. Position links must belong to the selected department and scenario, and one roster cannot assign two employees to the same planned position. Accepted mappings can be reused for later dates. Explicit member associations make the provider employee subject to that person's existing erasure flow.

Finance must explicitly enter `payrollHistoryStart`, on or before the requested cost-window start and every provider employee job's earliest hire date. There is no inferred history default. This boundary is reviewed source scope, retained in completeness and the fingerprint. Payroll history before it remains unavailable; the adapter does not certify that a finance-selected boundary covers the company's entire lifetime.

Preview reads the network without writing records or Activity. It returns normalized roster and payroll rows, unmapped employee IDs, mapping choices, provider completeness metadata, reconciliation and a reviewed fingerprint. Commit requires the same body plus that fingerprint, refetches Gusto and compares source, mapping and plan again. A changed salary, cost, date, history boundary, mapping or planned position invalidates the review. Unmapped employees prevent acceptance. Resume, undo and status take `{id: "<payroll import ID>"}` and reuse the payroll import's existing journal operations.

## Actual provider boundary

The only origins are `https://api.gusto-demo.com` and `https://api.gusto.com`, selected by the environment enum. Every provider request is GET with bearer authentication, `X-Gusto-API-Version: 2026-06-15`, no redirect following and no automatic retries. Provider error bodies are discarded; public errors contain only safe HTTP status and recovery text. Each request has a 15-second timeout.

The endpoints are:

- `GET /v1/companies/{company_id}` to validate the company grant.
- `GET /v1/companies/{company_id}/employees?include=all_compensations&page=N&per=100`, with no active-only filter, so scheduled hires and departed employees retain their dates.
- `GET /v1/companies/{company_id}/payrolls?processing_statuses=processed&payroll_types=regular,off_cycle,external&start_date=...&end_date=...&page=N&per=100`, over contiguous explicit pay-period slices from the reviewed history boundary through the observation date.
- `GET /v1/companies/{company_id}/payrolls/{payroll_id}?include=taxes,benefits&page=N&per=100` for all employee compensation pages.

Gusto's list documentation limits `date_filter_by=check_date` to regular processed payrolls, and omitted dates default to a recent window. Easel uses neither behavior. It scans explicit pay-period slices, each at most 365 days, from the finance-reviewed boundary through `asOf`, requesting regular, off-cycle and external processed payrolls. Identical payroll IDs appearing across slice boundaries are deduplicated; changed snapshots refuse the pull. Each distinct payroll's complete employee detail is fetched once. Exact check dates are then selected locally within `windowStart` and `windowEnd`. A delayed/off-cycle check can therefore enter the chosen cost window even when its pay period is much older. Regular checks outside that cost window are excluded. Retained metadata includes the history boundary, slice/page counts, source-scan fingerprint, distinct scanned payroll count, overlapping-ID count and exact accepted payroll IDs. Department costs are sums of accepted observations within this explicit coverage, not certification of company expenses before the reviewed boundary.

Required production scopes include company, employee, compensation, payroll and employee-benefits read access. Benefits involving PHI may require Gusto's additional PHI read scope. Demo does not enforce scopes in the same way as production. Easel rejects missing arrays, missing compensation history, incomplete totals or totals that cannot reconcile, instead of treating scope-hidden data as zero.

Pagination requires consistent `X-Page`, `X-Per-Page`, `X-Total-Count`, `X-Total-Pages`, exact cardinality and unique source IDs. It reads every advertised employee page, payroll-list page and payroll-employee page within the reviewed boundary. A complete empty roster is a dated zero; an unavailable or truncated source is an error. Manual limits are 5,000 employees, 5,000 distinct scanned payrolls, 5,000 normalized pay observations, 20 history slices and 180 provider page reads per pull. Exceeding any limit refuses the whole source instead of accepting a partial scan. The selected payroll check-date window is at most one year ending no later than today. Unprocessed payroll never becomes accepted cost.

Roster comparison uses the unique primary job, its hire date, effective-dated compensation and explicit termination effective date. Hour, Year, Month and Week rates are supported; monthly and weekly salary rates annualize by 12 and 52. Paycheck-based rates are refused because pay-period annualization would require an additional explicit schedule. Currency must be USD; no exchange rate is inferred. SSNs, addresses, bank details, dates of birth, personal provider emails and payroll memos never leave normalization or enter retained artifacts.

Payroll cost is exact integer cents: gross wages plus employer taxes plus employer benefit contributions. Employee tax withholding and employee benefit deductions are excluded from employer cost. Provider service fees are not exposed by these endpoints and are explicitly excluded; the normalized `feesCents: 0` means no fee observations are imported. Per-payroll gross wages, employer taxes and benefits must each reconcile to the provider's complete payroll totals. Hidden benefits or company-level tax charges that cannot be assigned to employees prevent acceptance; no department allocation is guessed.

## Retention and authority

Each pull becomes an existing `payroll-import` with `kind: 'roster'`, `source: 'gusto'` and immutable source completeness metadata. The existing `easel-payroll-files` journal writes its mapping, `roster-actual` and `payroll-run` records; existing payroll and headcount read models consume them after the whole job completes. There is no parallel headcount path. Planned positions, backfill links, attrition assumptions, scenario revision and approved snapshots are unchanged.

Each roster observation retains date and an opaque stable source observation ID; each pay row also retains the provider payroll ID, provider pay-period start/end and pay date. IDs are hashes of source identity and observation date/payroll, with employee UUIDs retained only in their dedicated identity fields. Overlapping date windows skip previously accepted pay observations. Changed previously accepted cost, period or department mapping refuses the pull until the original import is undone. Replacing a roster on the same date also requires undo. Different dates remain in hiring history, including late starts and departures. Missing months remain unavailable.

Retained artifacts are minimal normalized CSV, not the raw provider response. The mapping retains the explicit provider employee-to-member association and mapped identity columns. Existing archive transforms erase scoped employee ID/name in records, retained CSV, mappings, journals and historical views while preserving monetary values. Source observation IDs remain stable through erasure, so a later pull cannot replay old pay runs or resurrect erased identity. Existing payroll journal live-session and pay-authority fences apply to writes and continuation; existing server views filter individual pay detail while retaining permitted aggregate department totals.

## Proof

`tests/headcount.test.mjs` uses the public HTTP API, real Workers/D1 and a Gusto network-edge fake. Its three flows cover reviewed explicit mapping; source/plan fingerprint changes; January/February history, late hire and departure, backfill and attrition; departmental payroll cost and overlapping-window deduplication; complete empty roster and exact undo; complete multi-page reads and malformed/failed/scoped data refusal; reviewed period-history scanning, an old-period/off-cycle current check, exact local exclusion of old regular checks, overlapping slice deduplication and changed-source refusal; native authority and pay revocation during a provider read; sealed archive-excluded custody; explicit identity erasure and future pulls.

`tests/gusto-roster-browser.mjs` uses the built production Worker/assets, real D1, native owner bootstrap and the same Gusto-only network fake. It drives the actual Settings connect/mapping/payroll review/accept/undo/disconnect controls and the existing Overview headcount/history at 1440 and 390 pixels, with page-overflow assertions and screenshot artifacts. The test dates at the provider edge move into the current month so the product truthfully observes today's roster. Run after the parent has built the integrated app; no browser execution is required for the adapter itself.

These network-edge checks do not assert a new held-key sandbox receipt. The partner-managed demo token/company/payroll read was previously proven on 18 October; the parent performs any new held-key proof separately through the credential injector. No owner browser login is required for this manual slice.

## Provider references

- [Get employees of a company](https://docs.gusto.com/embedded-payroll/reference/get-v1-companies-company_id-employees)
- [Get all payrolls for a company](https://docs.gusto.com/embedded-payroll/reference/get-v1-companies-company_id-payrolls)
- [Get a single payroll](https://docs.gusto.com/embedded-payroll/reference/get-v1-companies-company_id-payrolls-payroll_id)
- [Gusto API fundamentals: pagination, scopes and demo enforcement](https://docs.gusto.com/embedded-payroll/docs/api-fundamentals)
- [Official Gusto SDK employee schema](https://github.com/Gusto/gusto-python-client/blob/main/gusto_embedded_v_2026_06_15/docs/models/employee.md)
- [Official Gusto SDK employee payroll compensation schema](https://github.com/Gusto/gusto-python-client/blob/main/gusto_embedded_v_2026_06_15/docs/models/employeecompensations.md)
- [Official Gusto SDK payroll totals schema](https://github.com/Gusto/gusto-python-client/blob/main/gusto_embedded_v_2026_06_15/docs/models/payrolltotalstype.md)
