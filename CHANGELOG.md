# Changelog

## 0.2.1 — 2026-11-26

- **Hosted demo deploys from the release.** Easel now pins rer 0.2.140. On 0.2.134 the hosted demo build refused Easel's switchable `MAIL_PROVIDER` setting ("Secret declared as an image variable"), so demo.run-easel.com could not be deployed from 0.2.0.

### Upgrading

No migrations are added since 0.2.0.

## 0.2.0 — 2026-11-26

Easel is financial planning for one company: a twelve-month plan, a locked budget, a downside scenario and a monthly actual-versus-plan review. It runs in your own Cloudflare account.

### What changed since 0.1.0

- **Owner sign-in.** The first owner claims Easel through a signed owner-claim ledger and signs in with their own account.
- **Reforecasts and approvals.** Named immutable reforecasts with version reports, and versioned department approval chains with live reviewer authority.
- **People and access.** Group grants on planning, private scenarios, statements and credentials; separate compensation grants; pseudonymous erasure on request; enterprise identity.
- **Actuals from your systems.** Reviewed QuickBooks, Xero and NetSuite actuals, Gauge utilization, a CRM pipeline, and linked Office reporting.
- **Integrations and agents.** Scoped integration tokens, signed planning webhooks and automation actions, and native planning through the company agent door.
- **Background calculations.** Long recalculations run as durable background operations.

### Upgrading

Migrations `0011_owner_claim` through `0034_business_retired` under `migrations/core` are added since 0.1.0 and listed in RELEASE.json; shipped migrations are unchanged. Back up before upgrading (docs/backup-and-restore.md).
