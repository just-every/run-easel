# Working on Easel

## Launch for review

When asked to launch, run or review Easel, run only `rer dev` from this checkout's root. It installs and sets up a fresh checkout automatically and prints progress. Give the shell tool at least 10 minutes; if the tool times out, run the same `rer dev` again to resume.

Do not run install, setup, reset or deploy for a review, and do not ask for an email, port, password or answers file. Give the owner the `RER_READY` address and `RER_OPEN` link without another question. The latter is a credential: share it only with the owner in this chat, never in logs or published evidence.

Stop with `rer dev --stop`. If the command refuses, follow the next command its message names. If `rer` is missing, install it with `npx -y @runeditrun/rer cli install`.

## Real owner installation

```sh
rer install
rer setup --owner-email you@example.com
rer dev            # prints RER_OPEN: opens signed in as the owner
rer dev --as sales # or engineering, board, finance
```

Use the setup prompt or the documented `--owner-email` flag for the real owner mailbox. `rer dev` prints `RER_OPEN`, which opens Easel signed in as the owner. Local dev and demo use one-click sign-in and silently suppress mail. Stop with `rer dev --stop` (or Ctrl-C when attached), and stop preview with `rer preview --stop`, before `rer build` or `rer verify`. Personas are real local operators at `<as>@dev.localhost`: `finance` is a Base admin and plans as finance; `sales`, `engineering` and `board` need an Easel membership, which finance adds under Settings → People (sales and engineering as contributors for their departments, board as a viewer). `fixtures/` holds synthetic files to try the move-in kits.

## Where things are

- `src/easel/` is the product. `engine.ts` is the deterministic calculation (cells, traces, profit, cash); `ramp.ts` the hiring ramp rule; `model.ts` input validation and edit scope; `setup.ts`, `plan.ts`, `cycle.ts`, `review.ts` the commands; `actuals.ts`, `workbook.ts`, `xlsx.ts`, `csv.ts` and `kit.ts` the move-in kits on Base import-kit; `views.ts` the role-filtered read models; `store.ts` the fenced D1 load/save; `api.ts` the Hono routes.
- `src/ui/` is the React app at `/app`; `src/routes/` the TanStack Start routes.
- `migrations/core/0007_easel.sql` is Easel's schema. Snapshots and activity are append-only in the database. Never rewrite an applied migration; add a new numbered one.
- `src/modules/` holds Base source adopted at the pin in `SOURCE.md` (operator-auth, mail, import-kit). `@runeditrun/rer` supplies the published CLI and installer; `scripts/installer` holds Easel's adapters and restore validation.

## Rules that keep the product honest

- Every private route resolves the native session (`store.actor`) and checks the person's role inside the command or view; route guards alone are not enough. Pay detail is filtered in `views.ts` on the server.
- Saves go through `store.save`: one D1 batch fenced by the model revision and the actor's live session. A conflict returns 409; never retry blindly.
- Money is integer cents, counts hundredths, rates basis points; use `units.ts`. No float arithmetic, no model-supplied numbers.
- Approved budgets, kept forecasts and published packs are read from their snapshots, never recomputed. Changing `ramp.ts` or `engine.ts` changes working scenarios only.
- Imports always preview without writing, commit only the reviewed fingerprint, and undo through the journal.

## Agents doing planning work

Agents act as a signed-in person through `API.md`, with that person's authority. For "Delay the two sales hires until July": create a proposal from the forecast (`proposal-create`), change the positions in it, read `GET /api/easel/compare` for the changed cells, submit it, and leave promotion of that exact revision to finance. For "Explain the cloud-spend variance": read `GET /api/easel/variance/:month` (accepted rows and budget sources per line, hypotheses marked), write the explanation with citations, and leave confirmation to the department and publication to finance.

## Tests

`pnpm test:easel` runs one flow test per `CONTRACT.md` clause through the HTTP API on real workerd and D1. `node tests/browser.mjs` is the full proof from a fresh clone: journeys at 1440 and 390, setup rerun, build, preview, deploy dry run, export and restore. Run the tests of what you touch plus `pnpm typecheck`; CI runs the full wall. Keep tests to flows a person would notice breaking.

## Contract projections and source integrity

Lander-Regenerate: node scripts/contract-docs.mjs write

`CONTRACT.md` is the acceptance and Status source. Lander-Regenerate for a touched clause is `node scripts/contract-docs.mjs write --clauses SPEND-001`, followed by `node scripts/contract-docs.mjs check --clauses SPEND-001`; use a comma-separated clause list when needed. This updates the selected acceptance rows, summary counts and the generated claims index. Legacy acceptance prose outside those rows is preserved. With no clause argument, the command selects previously generated acceptance rows.

Resolve the contract source first after a merge, keeping newer main judgments, then regenerate its views. Stage all intended files before `node node_modules/@runeditrun/rer/edition-authoring/cli.mjs lock`; run `node node_modules/@runeditrun/rer/edition-authoring/cli.mjs check` afterward. Generate the source lock last, and commit it with the source and generated views.
