# Connected HRIS rosters

In Settings → HRIS roster connections, choose Rippling, Willow, BambooHR or ADP Workforce Now. A native finance session with company-wide Pay detail connects and checks the source, reviews its employee and contractor roster, and explicitly accepts matches. API tokens, agents, schedulers, contributors, viewers and finance without Pay detail cannot administer or import this source.

These are manual observations, not a standing refresh schedule. The source is never changed. Accepting a roster records the observation and matching decision; it does not edit planned positions, salaries or frozen calculations.

## Credentials and provider fields

| Provider | Credentials and source | Mapped fields |
| --- | --- | --- |
| Rippling | An employer-authorized read-only API token or OAuth bearer grant, company ID and explicit dated API version. `GET https://rest.ripplingapis.com/workers/` expands `user,employment_type,compensation,department,custom_fields,legal_entity`. The company ID must match each worker's legal entity. | Worker ID, expanded user's formatted name, title, department name, employment type, start/end dates, salary effective date, annual compensation for salaried workers or hourly wage for hourly workers, with explicit currency. Rippling's derived annual equivalent is never substituted for an hourly wage. |
| Willow | Employer-issued read-only bearer key or OAuth access token and the installation's public HTTPS origin. `GET /api/willow/v1/employees?fields=name,employment,customFields&asOf=…` follows opaque cursors to a completed sync. | Person ID/name, latest dated employment, its in-force job title/department and exact compensation cents, currency and basis. Willow employment end dates are inclusive; the next day is Easel's first inactive date. |
| BambooHR | Company subdomain and a roster/compensation API key using HTTP Basic authentication. Read field definitions with `GET /v1/meta/fields`, then request the complete custom report with `POST /v1/reports/custom?format=JSON`, at BambooHR's fixed gateway host. This POST only reads a report. No active-only filter is applied. | Employee ID, first/last name, department, job title, employment-history status, hire/termination dates, pay rate, currency and pay period. Custom field aliases from metadata are requested and listed. Missing requested columns refuse the observation. |
| ADP Workforce Now | Read-only client ID/secret and the installation's ADP mutual-TLS certificate binding. Obtain a short-lived bearer token at `https://accounts.adp.com/auth/oauth/v2/token` with `client_credentials`, then read `/hr/v2/workers` at `https://api.adp.com`. | Associate OID, legal formatted name, primary work assignment's job title, department, worker type and annual/hourly USD remuneration, and worker current rehire/original hire and termination dates. Multiple primary assignments or missing department/compensation refuse the observation. The client ID provides the stable source namespace. |

ADP requires an owner-provisioned Cloudflare mutual-TLS certificate binding named `HRIS_ADP_MTLS` for both token and resource requests. Configure it in deployment's `mtls_certificates` with `binding: "HRIS_ADP_MTLS"` and the managed `certificate_id`. Private certificate bytes never enter Easel records, setup answers or portable archives. A missing binding blocks connection with a specific configuration message. Real provider account permissions, OAuth grant issuance and certificate provisioning are external prerequisites; expired imported bearer grants must be reconnected. Easel does not impersonate the owner or send native session cookies to any provider.

All requests refuse redirects, use a 15-second timeout and have no automatic retries. Traversals are bounded to 50 pages/5,000 employees; BambooHR reports at the limit refuse rather than claiming complete coverage. Missing pagination metadata, duplicate identities, withheld fields, unsafe next links, changed totals and incomplete pay fields fail the complete preview. Non-USD or unknown compensation units refuse instead of guessing. Provider error bodies and raw responses are discarded. Status and health checks retain only sanitized HTTP/error/rate-limit metadata.

Unmapped fields, including each custom field, are listed by name in the review and retained completeness metadata. Their potentially private values are excluded from stored originals and planning inputs. The reviewed digest binds the entire returned employee record, so changing an unmapped value also invalidates acceptance. Additional values require explicit product mapping; they never silently become financial assumptions.

## Review and acceptance

`GET /api/easel/connections/hris/{rippling|willow|bamboohr|adp}` returns masked status, scopes, owner, manual schedule, last successful read, employee count, last acceptance, error and rate-limit state. `POST` to the same path plus `/connect`, `/check` or `/disconnect` uses the native session and normal revision fence.

Connection bodies use `{tenant, credential, consent:true}` for Willow/BambooHR; Rippling adds `apiVersion`. ADP uses `{clientId, clientSecret, consent:true}`.

`POST /api/easel/import/{provider}/preview` takes:

```json
{
  "scenario": "editable-scenario-id",
  "asOf": "today's UTC YYYY-MM-DD",
  "employeeMap": {
    "source-employee-id": {
      "department": "department-id",
      "positionOrigin": "planned-position-origin-id",
      "employmentType": "W-2",
      "memberEmail": "associated-person@example.com"
    }
  }
}
```

For an unplanned hire, use `positionOrigin:""` and `unplanned:true`. Employment type is explicitly reviewed as `W-2` or `1099`; arbitrary provider labels are not treated as tax classifications. Member association is optional but should be supplied whenever this employee is an Easel member, so person erasure follows their source identity. Names and department labels never establish identity or position matches. Each position belongs to the mapped scenario/department and can match only one employee per roster.

Preview writes no records or Activity. It lists complete source rows, unmapped employee IDs/fields, and the matched, unplanned-hire, planned-but-not-hired and changed-salary buckets. `commit` takes the same body plus the reviewed `fingerprint`, reads the provider again and refuses changed source, mapping or plan. Every employee needs a complete mapping. The payroll import journal owns the observations and their normalized original CSV; `status`, `resume` and `undo` take `{id}`. Accepted mappings are reused for later dated pulls. One provider/scenario/date cannot be accepted twice without undoing its existing observation.

`GET /api/easel/payroll/:scenario` and `/headcount/:scenario` share existing live Pay, department and scenario filtering. Viewers receive headcount and cost aggregates without names, source identifiers or individual compensation. Exact planned dates retained on acceptance give day slippage; month-only positions have unavailable day slippage. Later plan changes do not rewrite captured dates. Complete observations stay dated; missing months are unavailable and never carried forward. Backfill links and attrition use the existing planning rules.

These HRIS roster endpoints do not provide payroll-run totals. Payroll cost stays unavailable until finance reviews provider payroll-register files through the existing PEOPLE-007 door, with `provider` equal to the accepted import's source namespace. Those actual wages, employer taxes, benefits and fees reconcile to accepted ledger payroll lines. Roster salary is never passed off as actual payroll expense.

## Custody, disconnect and erasure

Credentials are domain-separated AES-GCM ciphertext in the existing archive-excluded `e_connection_secrets` table, under `hris:{provider}`. Status shows only a suffix. No credentials or sealed ciphertext enter model records, Activity, journals or retained CSV. Restores require reconnection.

Disconnect deletes local custody and retains accepted history. These imported key/client grants have no usable credential-authenticated self-revocation endpoint in this door: status and the UI state the exact remaining owner action in Rippling App management, Willow API credentials, BambooHR API Keys or ADP API Central. Easel never claims provider revocation. Connect, health check, disconnect and journal acceptance/undo are audited.

Explicit employee/member associations reuse ERASE-001. Erasure pseudonymizes the provider employee identity in current reads, retained observations, mapping history, journal originals and exports without changing planning amounts. Future pulls apply the same erasure scope before review, while opaque observation identities prevent replay. Undo and disconnect do not discard the erasure receipt or rewrite unrelated history.
