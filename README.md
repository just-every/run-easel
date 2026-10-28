# Easel

Easel is MIT financial planning for one company: a twelve-month plan, a locked budget, a downside scenario and a monthly actual-versus-plan review.
Source: [just-every/run-easel](https://github.com/just-every/run-easel). The site is at https://run-easel.com.

## Run it locally

Start with one line, as on [Run Easel](https://run-easel.com/run) and the [getting-started guide](https://run-easel.com/docs/getting-started):

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-easel
```

macOS, Linux or Windows with WSL2. git is required; rer brings Node and pnpm.

Already have Node 22 or later? Use this alternative:

```sh
npx -y @runeditrun/rer dev just-every/run-easel
```

To start it again later, run `cd ./run-easel && rer dev`. To choose the owner mailbox yourself before the first start, use the installed command:

```sh
rer install just-every/run-easel
cd ./run-easel
rer setup --owner-email you@example.com
rer dev
```

`dev` prints `RER_OPEN URL`: open it on this computer and Easel opens signed in as the owner (finance). `dev --as sales`, `--as engineering`, `--as board` or `--as finance` start as a dev persona instead. Local dev and demo use one-click sign-in and silently suppress mail. Stop with `rer dev --stop` or Ctrl-C. No email leaves the computer and no provider account is needed.

```sh
rer verify                       # build, typecheck, flow tests, emitted Worker checks
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes   # into an empty installation
rer reset --yes                  # removes local data and settings
rer deploy --dry-run             # builds and validates; deploys nothing
rer describe                     # every command, flag and effect
```

A pre-upgrade export restores only with the release that made it. Keep a private export and that release before upgrading. To recover, restore into an empty installation of that release, upgrade that installation in place with `rer install` and `rer setup`, then export again with the upgraded release. Do not import a pre-upgrade export directly into a newer release.

Pins: Node 22.20.0, pnpm 10.12.4. `RUN-LOCALLY.md` and `SEED-COMMAND-CONTRACT.md` describe every flag; `OPERATIONS.md` the effects.

## What Easel is

Easel is owned financial planning for one company: an agreed next twelve months of revenue, expenses, hiring and cash, a locked budget, a downside scenario and a traceable monthly actual-versus-plan review. Posted accounting stays in your accounting system; Easel keeps the assumptions, alternatives, approvals and the decision record. It is MIT source you run yourself.

What a person can do in phase 1:

- **Set up** the company, reporting currency (USD by default), fiscal year, departments (including a shared one), planning lines and people as finance, contributor (per department) or viewer.
- **Move in actuals** from a general-ledger CSV: preview months, signs, repeats and malformed rows, map accounts and departments, accept through a journal, reconcile every month, undo an import.
- **Move in an Excel planning workbook** (.xlsx) as its own scenario. Supported formulas become live calculations; unsupported formulas retain their cached values and are listed in the preview. Every cell keeps its source address and formula. Compare the scenario, adopt it into the budget or undo it.
- **Plan** revenue (volume × rate, or customers with churn and ramped sales hires), positions with your own on-cost assumption, recurring and one-off expenses, shared-cost allocation and opening cash with collection and payment timing. Every number shows its arithmetic.
- **Run the budget cycle**: request department submissions, let contributors revise, comment and submit only their own department, return or approve; approval freezes exactly what was approved and by whom.
- **Branch and compare** scenarios, and work through **proposals** bound to a plan's exact revision that finance promotes or declines.
- **Close months** with actuals while keeping the prior forecast, see variances with the rows behind them, confirm explanations, and **publish a review pack** with decisions and actions, downloadable as HTML or CSV.
- **Export and restore** the complete installation.

The owner guides live in `docs/` and are published with the run site at run-easel.com/docs (`rer build --site` writes the site to `dist/site`). `CONTRACT.md` lists the guarantees (EASEL-001 to EASEL-017), `ACCEPTANCE.md` the proof, `IMPORTING.md` the move-in kits, `API.md` the HTTP surface agents use, and `AGENTS.md` how to change Easel.

Easel does not post journals, calculate payroll, tax or statutory statements, consolidate entities or convert currencies. Workbook formula translation supports arithmetic, SUM, IF, cell references and exact lookups; see `IMPORTING.md` for its limits. Forecast tax and on-cost assumptions are your inputs, labelled as such.

## Licence

MIT; see `LICENSE`. IBM Plex Sans is under the SIL Open Font License 1.1 (`public/fonts/ibm-plex-sans/LICENSE.txt`).
