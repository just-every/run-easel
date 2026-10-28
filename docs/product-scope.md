# Easel buyer and scope

| | |
| --- | --- |
| Category | FP&A (financial planning and analysis) software |
| Incumbents a buyer switches from | Workday Adaptive Planning, Planful, Anaplan, Runway, Pigment, Aleph |
| First buyer | A US finance lead or fractional CFO at a business with 25 to 250 employees, closing its books in QuickBooks Online, Xero, NetSuite or Sage Intacct, paying people through Gusto, Rippling or a PEO such as Justworks or TriNet, budgeting with department heads who enter their own numbers each autumn, selling through HubSpot or Salesforce, and planning in USD |

For that buyer, switching means that their ledger (with its history), payroll roster, pipeline and subscription data arrive through live connectors or mapped files; their budget owners enter numbers in a planning grid as they did in the incumbent's sheets; their Excel or Google Sheets model arrives with its formulas; every planning job they ran in the incumbent (budget, rolling forecast, headcount, scenarios, department submissions, board pack, cash alerts) has an Easel equivalent; and their old tool's versions are imported with a list of what did not map.

A buyer replacing an incumbent needs the whole job, so the target is the whole job:

- **Connected actuals.** QuickBooks Online, Xero, NetSuite, Sage Intacct and [Pantry](https://github.com/just-every/run-pantry) actuals backfill up to 36 months of history on first connection and refresh on a schedule, with reusable account, department and class mapping, balance-sheet balances, freshness and drill-through to the ledger transaction (`CONNECT-*`, `EASEL-002` to `EASEL-004`).
- **A flexible model.** A planning grid with paste, spreading, copy forward, split sub-rows and cell notes; plans built from prior-year actuals; user-defined formulas, dimensions and hierarchies, a configurable rolling horizon, multi-year plans and starter models for subscription, services and project businesses (`MODEL-*`, `EASEL-006`, `EASEL-008`).
- **Three statements and cash.** A linked P&L, balance sheet and cash-flow forecast with receivables and payables timing, deferred revenue, debt, capex and depreciation, runway, a 13-week cash view and US tax estimates (`FIN-*`, `EASEL-005`).
- **Headcount and compensation.** A roster from Gusto, Rippling or [Willow](https://github.com/just-every/run-willow), or a mapped roster and payroll-register file from any PEO or payroll provider, open roles from [Lodge](https://github.com/just-every/run-lodge) or Greenhouse, and US compensation assumptions (W-2 and 1099, employer payroll taxes with wage bases, benefits, bonus, commission), with salary visible only to those allowed (`PEOPLE-*`, `EASEL-007`).
- **Revenue and pipeline.** Pipeline from [Orbit](https://github.com/just-every/run-orbit), HubSpot and Salesforce with explicit probability and timing assumptions, and subscription metrics (ARR, churn, cohorts) from Stripe Billing or [Nectar](https://github.com/just-every/run-nectar) (`REV-*`).
- **Spreadsheets kept live.** Two-way Excel and Google Sheets add-ins whose formulas stay live, model import that keeps formulas, and Excel exports with formulas (`SHEET-*`, `EASEL-015`).
- **Planning cycles.** Budget calendars, tasks, reminders and escalations, metric-triggered tasks, quarterly reforecasts, long-range plans, private and shared scenarios, per-department ordered approval chains, groups and per-dimension permissions (`CYCLE-*`, `EASEL-009` to `EASEL-012`).
- **Reporting.** A report builder, dashboards, board packs in PDF, PowerPoint and Excel, scheduled cash alerts, and BI and warehouse feeds (`REPORT-*`, `EASEL-013`, `EASEL-014`).
- **Move in and out.** Imports from Adaptive Planning, Planful, Anaplan, Runway and Pigment exports, a parallel month against the old tool, and complete exports and restores (`MOVE-*`, `PORT-*`, `EASEL-016`).
- **Anywhere and governed.** Phone-width review and approvals, native iOS and Android apps with push, SSO and SCIM, an audit trail, person erasure, multi-entity and multi-currency plans, a public API, webhooks and an MCP endpoint (`MOBILE-*`, `ACCESS-*`, `AUDIT-*`, `ERASE-*`, `ENTITY-*`, `API-*`).
- **Agents that keep the plan feasible.** They watch actuals, pipeline and hiring, flag when a change breaks an agreed cash or runway constraint, compute feasible responses for the owner to choose, chase uncertain assumptions, and learn from the company's own forecast errors (`AGENT-*`).

### Neighboring products stay separate

Easel is one product. Where the market sells a neighboring product separately, Easel connects to it and does not rebuild it. When the neighbor is a Run Edit Run sibling, Easel connects to that sibling first and to the US incumbent second.

| Job | Owned by | How Easel meets it |
| --- | --- | --- |
| General ledger, bookkeeping and the close | [Pantry](https://github.com/just-every/run-pantry) (or QuickBooks Online, Xero, NetSuite, Sage Intacct) | Read-only actuals connectors and drill-through (`CONNECT-001` to `CONNECT-004`, `CONNECT-011`, `CONNECT-008`); Easel never posts a journal |
| Sales CRM and pipeline | [Orbit](https://github.com/just-every/run-orbit) (or HubSpot, Salesforce) | Pipeline drivers with finance-owned probabilities (`REV-001`) |
| Subscription billing | [Nectar](https://github.com/just-every/run-nectar) (or Stripe Billing, Chargebee) | Subscription metrics and cohorts as actuals and drivers (`REV-002`) |
| Core HR and the employee record | [Willow](https://github.com/just-every/run-willow) (or Rippling, BambooHR) | Roster and compensation sync (`PEOPLE-002`) |
| Recruiting | [Lodge](https://github.com/just-every/run-lodge) (or Greenhouse) | Open roles become planned positions (`PEOPLE-003`) |
| Payroll runs and tax filing | [Envelope](https://github.com/just-every/run-envelope) (or Gusto, Rippling, ADP RUN, and PEOs such as Justworks, TriNet and Insperity) | Roster and payroll-cost actuals by connector or file (`PEOPLE-001`, `PEOPLE-007`); Easel estimates employer cost and never pays anyone |
| Expenses, cards and purchasing | [Coaster](https://github.com/just-every/run-coaster) and [Purse](https://github.com/just-every/run-purse) (or Ramp, Brex, Bill.com) | Committed and card spend in the forecast (`SPEND-001`) |
| Professional-services delivery | [Gauge](https://github.com/just-every/run-gauge) (or Harvest, Kantata) | Utilization and project revenue drivers (`REV-003`) |
| Team chat | [Nook](https://github.com/just-every/run-nook) (or Slack, Microsoft Teams) | Notifications, reminders and agent questions (`CYCLE-003`, `AGENT-003`) |
| Workflow automation | [Crank](https://github.com/just-every/run-crank) (or Zapier, Make) | Webhooks, API and published apps (`API-001`, `API-002`) |
| Identity provider | [Auth](https://github.com/just-every/run-auth) (or Okta, Microsoft Entra ID) | SAML SSO and SCIM (`ACCESS-002`) |
| Files and board decks storage | [Chest](https://github.com/just-every/run-chest) (or Google Drive, SharePoint) | Board packs saved to a chosen folder (`REPORT-003`) |

## Scope coverage

How the owner-approved scope for Easel (16 October 2026) maps to clauses.

| Scope item | Clauses |
| --- | --- |
| Live actuals connectors for QuickBooks Online, Xero and NetSuite with account/department mapping and automatic monthly refresh | `CONNECT-001`, `CONNECT-002`, `CONNECT-003`, `CONNECT-005`, `CONNECT-006`, `CONNECT-011` |
| A flexible model: user-defined formulas, dimensions, configurable rolling horizon and multi-year plans | `MODEL-001, MODEL-010`, `MODEL-002`, `MODEL-003, MODEL-011`, `MODEL-004`, `MODEL-008, MODEL-013`, `MODEL-009`, `CYCLE-006` |
| Linked P&L, balance sheet and cash-flow forecast covering AR/AP timing, debt, capex and runway | `FIN-001`, `FIN-002, FIN-008, FIN-009`, `FIN-003, FIN-010`, `FIN-004`, `FIN-005`, `FIN-007` |
| Headcount and compensation planning fed from Gusto/Rippling with restricted salary visibility | `PEOPLE-001`, `PEOPLE-002`, `PEOPLE-004, PEOPLE-008, PEOPLE-009`, `PEOPLE-005`, `PEOPLE-007`, `EASEL-007` |
| Revenue and pipeline drivers from HubSpot/Salesforce (and Orbit) plus subscription metrics (ARR, churn, cohorts) from Stripe or Nectar | `REV-001`, `REV-002`, `REV-003`, `REV-004` |
| Two-way Excel and Google Sheets sync that keeps formulas live, plus board-pack dashboards and scheduled cash alerts | `SHEET-001`, `SHEET-002`, `SHEET-003`, `REPORT-002`, `REPORT-003`, `REPORT-006` |
| Push further: a planning agent that watches actuals, pipeline and hiring, flags broken cash or runway constraints, computes feasible responses and learns from past forecast errors | `AGENT-001`, `AGENT-002`, `AGENT-003`, `AGENT-004` |
