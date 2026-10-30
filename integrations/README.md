# Easel automation apps

The versioned app sources in this directory expose approval, close, publish,
refresh-failure, alert and task events, and create-proposal and comment actions.
Install them in your own developer account or Crank installation. Publishing to
platform directories requires those accounts and their review. These source
packages are not claims of directory publication.

Create an expiring personal or service API token in Easel, using a native session
and the ordinary emailed identity confirmation. Finance with company-wide scope
can receive event metadata. A write token also creates proposals and comments;
contributors can use those actions only within their existing authority. Service
tokens cannot approve, close, publish or promote. Revocation takes effect on the
next read or write. Never paste API tokens into workflow graphs or exported app
sources: use each platform's connection custody.

A proposal action takes the **working** scenario ID, its reviewed integer revision,
a name and a request. The action refuses a stale revision and only creates a draft.
An approval event names the frozen budget; select its working forecast separately.
A comment takes a scenario, department and text and uses the same native permissions.
Unknown write outcomes must be reviewed in Easel before another attempt; these
adapters do not invent idempotency or automatically retry a proposal creation.

## Crank

`crank/index.mjs` is the Easel app manifest and inert graph-template factory.
All six triggers use Crank's signed-webhook door with timestamp verification and
30-day ID deduplication. The graph filters the chosen event before running actions.
Create native Crank connections: an HTTP bearer bound to the exact Easel hostname,
and a Webhook signing-secret connection containing a random 32-byte shared secret.
Call `workflow` with those connection IDs, the Easel HTTPS origin and reviewed
proposal/comment inputs. Save the returned graph through `POST /api/crank/workflows`,
review its native estimate and publish it as the owner. Create its hook through
`POST /api/crank/workflows/:id/hooks`. Register that URL and the shared secret in
Easel (see `API.md`). Crank owns workflow review, publication, credential custody,
replay and downstream delivery; Easel owns its own live authority and exact revisions.

`crank/prove.mjs` runs the app in an independently obtained, running Crank Worker
with real D1 through Crank's public HTTP test tooling. It changes no Crank source.
To include this part of the developer journey, set `EASEL_CRANK_SOURCE` to an
installed Crank source tree before running the Zapier CLI command below. Only
transport at the network edge is forwarded to the two real local Workers.

## Zapier

```sh
npm ci --prefix integrations/zapier
cd integrations/zapier
./node_modules/.bin/zapier-platform validate
./node_modules/.bin/zapier-platform test
```

The developer journey launches a real Easel Worker and D1, authenticates through a
native session, issues a scoped service token, approves a budget, runs the actual
trigger and actions through Zapier Platform Core and refuses stale and revoked
requests. No Zapier account is needed for this local CLI proof. Registering,
pushing and publishing the integration to Zapier requires your developer account.

## Make

Create an Easel custom app in your Make test organization. `make/app.json` indexes
the app source: install `base.iml.json` as Base, `connection.iml.json` as the native
connection definition and the three module definitions as Watch Planning Events,
Create Revision-bound Proposal and Create Planning Comment. Bind the modules to
the `easel` connection. Use your HTTPS Easel origin and scoped token. Run the
approval trigger, map a working forecast and its reviewed revision into Create
Proposal, and verify `branchedFrom.revision` in Easel before sharing the app.

Make's hosted IML engine and organization install require a Make account. The local
developer journey exercises the shipped action request declarations against Easel;
it does not establish hosted IML execution or platform approval.

Zapier and Make poll the latest 100 matching events, newest first, deduplicated by
stable event ID. They must poll often enough for that window. For lossless catch-up,
use the ascending cursor API or signed webhooks; do not treat an empty poll as
proof that every older event was consumed. Crank uses signed push delivery.
