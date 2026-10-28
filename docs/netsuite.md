# NetSuite actuals

Finance uses Settings → NetSuite connection to connect an existing token-based
integration. Create the integration and token in NetSuite for a read-only role:
REST Web Services and SuiteAnalytics Workbook access, with View permissions for
the accounts, accounting periods, primary book, posted accounting lines and
subsidiaries to import. Confirm the role's permissions in NetSuite; Easel cannot
inspect or reduce a token's other permissions. No OAuth app is needed for this
TBA path. Use the account ID (for example `1234567_SB1`), not a URL.

Easel signs each request with OAuth 1.0 HMAC-SHA256, a fresh nonce and timestamp.
Only fixed SuiteQL SELECT queries are sent to the account-specific SuiteTalk
origin. Query requests use HTTP POST because that is SuiteQL's read protocol;
Easel never writes accounting records. Redirects and automatic retries are
refused. Reads are bounded by bytes, pages and rows. Provider error bodies are
never retained or displayed.

Create an entity for each subsidiary and map them in the connection. Each mapping
requires matching local currency and a separate official source plan. An accepted
subsidiary cannot be reassigned. Department, class and location metadata feed the
ordinary reusable mappings; subsidiary IDs map to the stable Entity dimension.
An entity's closes, accepted actual cells, ledger openings, schedule allocations
and statement exports consume only that subsidiary's journal rows. Source account
and dimension metadata remains visible in each monthly review.

Actuals → NetSuite actuals offers 12–36 history months, defaulting to 24. Finance
reviews and accepts each month and subsidiary separately, oldest first. The first
month includes the preceding posted-ledger opening once. The source trial balance
is computed independently from primary-book accounting lines, by posting period;
its opening plus the detailed movement must equal its closing for every account.
Both source trials must sum to zero. No fiscal report closing transfer or balancing
plug is invented. Ordinary monthly periods are required; posted adjustment periods within the
selected month are included. Selection uses the accounting period, independently
of the transaction date. The source transaction
date is retained; a transaction dated outside its posting month is assigned to
that reviewed posting month's boundary for actuals classification.

A re-pull computes deltas against accepted source transaction/line/account IDs.
An unchanged month creates no duplicate rows; an amount change records the paired
posting differences, and a removed line records a reversal. A change to an account,
date, type or dimension reverses the old posting shape and imports the reviewed
new shape; accepted evidence is never silently relabeled. The ordinary journal supports explicit
continuation and undo; undoing an early month blocks later dependent balances
until history is restored. Closed periods require reviewed corrections.

Preview is a read with no saved observation or journal write. **Check for source
changes** explicitly retains an observation, mapping issues and an impact list.
A changed, incomplete or failed observation holds working conclusions that consume
that entity and period, including dependent cash alerts, until finance accepts a
complete refreshed month. Earlier complete periods and captured budgets, kept
forecasts and published packs retain their arithmetic. There is no scheduled pull
or standing consent; CONNECT-005 owns scheduled refresh and its propagation.

Credentials use installation- and provider-bound authenticated encryption in the
archive-excluded connection-secret table. Native company-wide finance alone can
administer them; API tokens and scoped readers cannot. Status shows only the token
suffix, role, owner, manual schedule, last accepted pull, row count, sanitized error
and rate-limit state. Connect, mapping, source checks, access checks and disconnect
are audited. Disconnect always deletes local credentials. NetSuite TBA has no
remote self-revocation endpoint: revoke the token in **Setup → Users/Roles → Access
Tokens**. The UI retains that required owner action and never reports remote
revocation as confirmed.

The recorded synthetic SuiteQL responses in `fixtures/netsuite/suiteql.json` feed
`tests/netsuite.test.mjs` through real HTTP routes, workerd and D1. That one journey
also invokes the shared ledger-opening journey. `tests/netsuite-browser.mjs` runs
the built native UI, follows a fake-provider source transaction link and proves
viewer filtering; it records changed screens at 1440 and 390 pixels. The only
provider qualification excluded from this build round is a recorded run against
a live NetSuite sandbox. No live-provider behavior is claimed by these fakes.
