Easel keeps your plan in the installation you run, locally or on your Cloudflare account. Export it to one file to keep a copy or move to another installation.

## Export

Stop Easel first, then export:

```sh
rer dev --stop
rer export --output exports/installation.rer
```

The archive holds every planning record, approved snapshot, published pack, activity entry and import journal, with an integrity receipt. It leaves out sign-in sessions, the local outbox and private settings. Exports are kept under `exports/`, which the app never serves.

## Restore on another computer

Restore into a fresh installation that has no plan yet:

```sh
npx -y @runeditrun/rer install just-every/run-easel --dir easel
cd easel
rer setup --owner-email you@example.com
rer import --input exports/installation.rer --yes
rer dev
```

Copy the archive into the new checkout's `exports/` folder first. `rer import` checks the archive before it writes anything and refuses a damaged file or an installation that already holds a plan.

## Hosted installations

Run these commands from the checkout that holds the deployment receipt. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the command's environment using your existing private credential custody. Never put the token on the command line. The account must match the receipt. The token needs Workers read access and D1 write access: exporting also creates and removes private snapshot tables in D1.

```sh
rer export --target remote --origin https://your-installation.example --output exports/hosted.rer
rer import --target remote --origin https://your-empty-installation.example --input exports/hosted.rer --yes
```

Replace each example origin with the exact HTTPS origin recorded for that installation. The origin must select exactly one `.rer/deploy/<environment>.json` receipt in the checkout. The command checks the recorded account, live Worker version, deployment fingerprint, database identity and live `DB` binding before accessing installation data. Missing receipts, ambiguous origins and unsettled deployments refuse the transfer. Keep deployment receipts privately with the deploying checkout. Hosted commands use the Cloudflare control plane; they do not accept an application session file.

The destination must have no plan. Hosted restore uses the same complete archive verification, Easel validation, migration replay and atomic publication as local restore. It retains the same exclusions for sessions, credentials, outbox data and private configuration, and exports apply the same erasure transformations. Use the release whose migration files match the deployed installation; hosted transfer does not apply migrations. Normal v2 archives can move between local and hosted installations. Legacy v1 recovery and a separate later journal remain local operations.

## Before you upgrade

An export restores only with the release of Easel that made it. Before upgrading, keep a private export and that release. To recover, restore into an empty installation of that release, upgrade it in place with `rer install` and `rer setup`, then export again with the upgraded release. Do not import an export from before an upgrade straight into a newer release.

## Start over

```sh
rer reset --yes
```

Reset removes the local data, the owner and the private settings of this checkout. It keeps the source, your exports and deployment receipts. Export first if you want to keep anything.
