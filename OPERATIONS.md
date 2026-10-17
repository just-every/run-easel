# Easel operations

Run all first-party operations from the composed, runnable edition checkout
with the shared RER command path. To get a runnable checkout, run
`npx -y @runeditrun/rer install just-every/run-easel` (or start it directly with
`npx -y @runeditrun/rer dev just-every/run-easel`). The detailed flags and effects are in
`RUN-LOCALLY.md` and `SEED-COMMAND-CONTRACT.md`.

```sh
rer setup --owner-email you@example.com
rer dev
```

Use the setup prompt instead of the owner-email flag when entering the real
mailbox. For local outbox sign-in, start `rer dev --login`, then run
`rer outbox` and open its `RER_OPEN` link to `/__dev/key`. Follow the newest
ordinary sign-in message there; no external email is sent. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build or verification.

```sh
rer verify
rer reset --yes
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes
rer deploy
rer describe
```

Use `rer describe` to inspect the checkout's actual
capabilities. `rer check --profile first-party` validates the
declared command contract; it does not run application journeys or contact a
provider.

## Local data and recovery

Setup and development use explicit owner identity and real local migrations.
Dev and preview use the same owner and canonical `.wrangler/state`; the local
development outbox is available only on loopback. Any process with access to
the machine can read that outbox and sign in as the owner. Private settings are
kept in `.dev.vars` with mode 0600 and are not copied into build output.

Local export creates a private archive with an integrity receipt and explicit
exclusions. Easel archives its planning records, immutable snapshots, activity and import
journals through its product restore policy. Owner/auth, outbox, bookkeeping, private settings and
transient runtime state are excluded. Import validates and restores atomically
into an empty destination; confirmed reset preserves export archives. Run setup
after restore to establish a fresh owner. Each first-party seed verifies local
export/import/export equivalence across its supported resources. Remote transfer
is available only when the adapter declares complete resource coverage.

A pre-upgrade export restores only with the release that made it. Keep a private
export and that release before upgrading. To recover, restore into an empty
installation of that release, upgrade that installation in place with `rer install`
and `rer setup`, then export again with the upgraded release. Do not import a
pre-upgrade export directly into a newer release.

Preserve ambiguous state and applied migration history. Never place a remote
credential, owner secret or local resource ID in source. A schema change needs
a forward migration and verified transition/recovery.

## Deployment

`rer deploy --dry-run` validates the real owner-account
deployment declaration and builds locally without provider requests. Real
deployment requires privately supplied `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, the declared owner/session/setup secrets, and a real
verified mail sender in `deploy.json`. Follow the owner-account deploy-kit
instructions in `node_modules/@runeditrun/rer/modules/deploy-kit/README.md`; account scope,
resource ownership, migrations, receipt and health checks are defined there.
Local validation does not prove hosted acceptance, provider delivery or remote
health.
