Everything Easel knows about your plan lives in its checkout on your computer. Export it to one file to keep a copy or move to another computer.

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

## Before you upgrade

An export restores only with the release of Easel that made it. Before upgrading, keep a private export and that release. To recover, restore into an empty installation of that release, upgrade it in place with `rer install` and `rer setup`, then export again with the upgraded release. Do not import an export from before an upgrade straight into a newer release.

## Start over

```sh
rer reset --yes
```

Reset removes the local data, the owner and the private settings of this checkout. It keeps the source, your exports and deployment receipts. Export first if you want to keep anything.
