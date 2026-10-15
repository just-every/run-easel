# Source origins

Easel is maintained at [just-every/run-easel](https://github.com/just-every/run-easel).
The public release is a clean source snapshot; its earlier authoring history is not included.

This runnable checkout is authoritative. Easel adopts Base runtime and modules
at commit `10e569948863b7050e6645b7219b56007953b232`.
`base-copies.json` records their source paths, revision, SHA-256 digests and modes.
`src/modules/operator-auth`, `src/modules/mail`, `src/modules/import-kit`, the
operator-auth dependency closure (`dependencies`, `owner-claim`) are copied from
that revision without Base test sources. Unchanged runtime files under `src/base`
and other unchanged Base files are recorded individually. Every inventory entry
claims byte equality with its Base source and uses its Git file mode.

Two files under `src/base` are seed-owned adaptations of `foundation/runtime`
at that same revision, outside the exact-copy inventory: `font-head.ts` preserves
Easel's reviewed IBM Plex Sans preload, and `hydration/README.md` documents the
published package using bare `rer` verbs. They are not byte-equal Base copies.
Dependency linking is not enabled. Signed owner claims use the existing module when trusted claim bindings are provisioned.

The CLI and onboarding implementation come from the published `@runeditrun/rer`
package, pinned exactly to `0.2.20` in `package.json` and `pnpm-lock.yaml`. The Base
`--to-package` converter removed the vendored CLI and onboarding implementation
and rewrote their callers to package exports. `rer check` verifies the command
contract and operator-auth copy. `scripts/installer` contains only Easel adapters,
branding and executable restore validation; its product validator is retained
across the package boundary.
The export adapter uses the published `policyModule` interface to retain its executable policy. The import adapter invokes the published portability file helpers in a native
worker owned by the CLI's cancellation signal. The worker imports
`validateEaselStaged` as executable code and supplies Base's replay of the applied
migration ledger for older archives. Backup-only v1 recovery uses the package's
`internal/modules/portability/legacy-files.mjs` export, retaining Base's explicit
acknowledgement, empty-target checks, audit, migration refusal and v2 re-export.

Applied migrations `0001` through `0007` retain their original bytes. New numbered
migrations add refreshed module schema without rewriting installed data.

Easel owns `src/easel`, `src/ui`, `src/routes`, `src/site`, `src/identity.ts`,
`docs/`, migration `0007_easel.sql`, the fixtures, tests, theme and fonts. The
installed `/` uses Base's shared Lobby and the existing `oa_first_run` owner
confirmation record. `rer build --site` builds the run site (run-easel.com) from
`src/site/pages.tsx`: Easel's own landing, Base's shared Run page from
`src/base/run-site.ts`, and the docs rendered from `docs/site.json` and
`docs/*.md`. Base and Easel are MIT; see `LICENSE`.

Demo mode adopts `modules/demo`, `modules/operator-auth`, `modules/mail`, and the auth closure (`dependencies`, `owner-claim`) from Base tag `rer-v0.2.20` (`38aa7efdb3cceec585d2344ed54dd559295b9059`). The demo module is copied without path adaptations; its label helper uses operator-auth’s CSP helper. `base-copies.json` records the refreshed auth and mail modules. `edition.json`, `sources.lock.json` and retained comparison snapshots track the demo adoption. Other adopted runtime sources retain their recorded origins.
