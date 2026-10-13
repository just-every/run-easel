# Easel acceptance

## The first-release outcome

A finance lead at one company can set up the plan, move in a month of
general-ledger actuals and an existing Excel budget, build a driver-based
budget with department contributors, approve and freeze it, branch a downside,
take a contributor's proposal through exact-revision approval, close months
with actuals while keeping each prior forecast, explain variances from the
rows behind them, publish a review pack with decisions, and export the whole
installation and restore it elsewhere. All of it runs locally with uploaded
files and no provider account.

This file separates implemented source from executed proof. Owner inputs that
fixtures cannot stand in for are listed at the end.

## Proof

| Clauses | Proof | What it runs |
|---|---|---|
| EASEL-001 to EASEL-015 | `pnpm test:easel` (`tests/easel.test.mjs`): one flow test per clause | The deployed request path (auth then the Hono API) on real workerd and D1 with every migration, a real owner claim and real email-link sign-in for each contributor and viewer. No application fake. |
| EASEL-001 to EASEL-015 (as a person) | `node tests/browser.mjs`: planning journey at 1440 px, review journey at 390 px | Real `rer dev` with dev identity (owner, finance, sales, engineering, board), clicking only what a person can: setup, July CSV move-in with mapping and rejected rows, budget, submissions, approval, month close, cell traces, August move-in, variance explanations, pack publish and download, downside branch and comparison, a contributor proposal promoted by finance, the workbook move-in. Every tab at both widths is checked for horizontal overflow and screenshotted. |
| EASEL-016 | `node tests/browser.mjs` | `rer export`, refused import into a non-empty installation (exit 4), a second fresh clone set up with a different owner, refused corrupt archive, restore, then the restored owner sees the same state, every scenario's calculation, every snapshot and the reconciliation, the pack downloads, and the re-export has identical rows. |
| EASEL-017 | `node tests/browser.mjs`, `rer verify`, GitHub Verify | install, setup, check, describe, dev, setup rerun, build, preview (health 200, signed-out API 401), deploy --dry-run, export, import, reset, from a fresh clone of committed HEAD; `verify` runs build, typecheck, the flow tests, the emitted Worker's HTTP checks and the outbox email-link sign-in. |

GitHub **Verify** runs `rer install`, `rer verify` and `tests/browser.mjs` on
every push and keeps the journey screenshots, the downloaded pack and the
archives as an artifact of that run.

A source edit to the ramp rule (`src/easel/ramp.ts`) was demonstrated on a
running installation: the working forecast's January subscription revenue
changed while the approved budget snapshot kept the same SHA-256 and cells.
That is evidence, not a permanent test.

## Not applicable or not yet proven

- **Prior-data upgrade:** the boundary is the installed database of the earlier
  Easel application to package mode on `rer` 0.2.0.
  Applied migrations `0001` through `0007` remain byte-identical. The executed
  in-place upgrade retained all 495 original rows across 67 tables; five role
  models, four snapshots and the published HTML/CSV outputs stayed identical.
  Workbook undo, new writes and two setup reruns passed. Base's origin-scoped
  local cookies require people to sign in again; native session rows remain.
- **Old backups:** A pre-upgrade export restores only with the release that made it.
  Keep a private export and that release before upgrading. To recover, restore into
  an empty installation of that release, upgrade that installation in place with
  `rer install` and `rer setup`, then export again with the upgraded release. Do not
  import a pre-upgrade export directly into a newer release. The starting version
  writes v1 archives; the upgraded release requires v2. The in-place upgrade proof
  above does not establish direct cross-release archive restore.
- **Owner data:** no owner export, anonymised company or parallel month was
  supplied. The fixtures in `fixtures/` are synthetic files in the documented
  shapes; they prove Easel's behaviour, not compatibility with any real
  accounting or planning product's export.
- **Hosted operation:** `deploy --dry-run` only. No Cloudflare account,
  deployment, hosted health or real mail delivery is claimed.
- **Connectors and hosted AI:** none in phase 1. Agents work through `API.md`
  as a signed-in person; no model is called by Easel.
- **Economics:** no current-process baseline was supplied, so no saving in
  cost or attention is claimed.

## Limits

CSV actuals: 2 MB and 5,000 rows per file. Workbooks: 5 MB. Import batches
apply 100 rows at a time, two batches per request, continued explicitly. The
plan year is twelve months from the first plan month. One reporting currency.
