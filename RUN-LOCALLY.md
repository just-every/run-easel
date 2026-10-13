# Run it locally

Use Node 22.20.0 and pnpm 10.12.4 for maintained first-party checkouts. From a
runnable edition's root, install locked dependencies, prepare its local owner,
then start development:

```sh
rer install
rer setup --owner-email you@example.com
rer dev
```

Commands that run project work select the exact Node version declared by the
project. They use an exact matching installed runtime or a checksum-verified
copy cached at `~/.rer/node/node-vVERSION-PLATFORM-ARCH/`; when needed on
supported platforms, the runner retrieves the official Node release and checks
its SHA-256 against `SHASUMS256.txt`. It does not change global Node installations.
Set `RER_NODE_AUTO=0` to disable automatic selection. If selection is disabled
or acquisition fails, the command reports a repair invocation in this form:
`npm exec --yes --package=node@VERSION -- node SCRIPT VERB --cwd PROJECT`.
Help, check, describe, doctor and stop do not select or acquire Node.

After `RER_READY`, a seed with dev identity prints `RER_SIGNED_IN EMAIL` and
`RER_OPEN URL`: open that URL on this computer and the app opens signed in as
the owner, at `/setup` until first-run is finished. For local outbox sign-in,
start `rer dev --login`, then run `rer outbox`
and open its `RER_OPEN` link to `/__dev/key`. Follow the newest ordinary
sign-in message and finish first-run setup at `/setup`. Until
first-run completion is stored durably, app routes send the signed-in owner to
`/setup`; signed-out visitors sign in and return there. Once complete,
`/setup` opens the app or settings. The local outbox sends no external email.

The saved local port is used, otherwise 8787. Explicit ports are decimal
integers from 1 through 65535 and must be free; a busy requested port fails
instead of silently moving. Only `127.0.0.1`, `localhost` and `::1` are allowed.
Dev applies the selected host and port to both the listener and runtime bindings;
readiness is bounded and failure stops the owned processes.

Missing non-interactive setup answers exit 3 and name the manifest fields.
Read `rer-setup.json` and pass a private, mode-0600 JSON object keyed by those
names using `rer setup --answers PATH --non-interactive`,
for example `{"OWNER_EMAIL":"owner@example.com"}`. Secret values stay in
private inputs and never go in command arguments. A setup rerun with the saved
owner and origin preserves existing owner/data and exact private settings.
Conflicting saved identity or origin reports an actionable recovery path.
Review reset's exact removal inventory before confirmation; export domain data
first if it should be restored, and import only into an empty destination.

Queue waits report immediately with a reason and numeric one-based position,
then refresh about every 15 seconds while waiting. Wait for the running command
to report admission or completion.

For the real owner mailbox, `setup` can prompt instead of receiving
`--owner-email` on the command line. Setup builds the app, applies local
migrations, prepares the first owner, requests an ordinary sign-in message and
stops its temporary app before it exits. Existing owner data and private
settings are preserved on a repeated setup.

Dev starts the real local app with assets and HMR and prints `RER_READY URL`
after the application health check. With dev identity it then prints
`RER_SIGNED_IN EMAIL` and `RER_OPEN URL`. The `RER_OPEN` URL carries this
checkout's dev key in its fragment: opening it signs the browser in through a
real dev session, and the key is removed from the address bar and kept only as a
host-only cookie. Treat that line as a credential and open it only on this
computer. A dev-only badge switches between the owner, signed out and the
seed's personas (`admin@dev.localhost` and so on). `dev --as PERSONA` starts as
another persona or `signed-out`. `rer dev --login` turns dev identity off and
requests an ordinary sign-in message. With pinned rer 0.2.0, its printed entry link cannot unlock Easel's
outbox. Run `rer outbox` and open that command's `RER_OPEN` link to
`/__dev/key` instead, until a rer release fixes `--login`. The key entry unlocks
the outbox; choose the newest ordinary sign-in message and follow its link.
No external email is sent. A successful sign-in consumes the link once.

Dev detaches by default; use `rer dev --foreground` to keep it attached.
Preview stays in the foreground while serving. Use `rer dev --stop` or
`rer preview --stop` to stop them; `--idle-timeout SECONDS`
sets inactivity cleanup. Compatible repeated starts reuse the registered
server, print readiness and exit. Preview serves fixed production output; dev
serves live source edits.
Both retain the same owner and `.wrangler/state`. Use `rer describe` for the current idle-timeout and server limits.

Use the following operations as needed. Reset is destructive local cleanup;
export any data you need to keep before resetting. Export saves under
`exports/` (or any `.rer` name), which the dev server never serves; it refuses
other paths in the checkout. Import requires an empty destination and `--yes`
confirms the restore.

```sh
rer verify
rer reset --yes
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes
rer deploy
rer describe
```

Stop dev or preview with `--stop` or Ctrl-C before build or verification, and
before reset and data transfer. Reset removes only the
declared local inventory: local database/storage state, owner and sessions,
outbox, CLI and installer bookkeeping, and generated private settings. It
keeps source, dependencies, exports and deployment receipts. It refuses active
operations and ambiguous or linked state.

Local export creates a private archive with an integrity receipt and explicit
exclusions. Import validates the archive and restores into an empty destination.
After import, run setup to establish the owner and local configuration. Auth,
outbox, private settings and transient runtime state are excluded. Remote
transfer is unsupported by the maintained references and fails visibly.

A pre-upgrade export restores only with the release that made it. Keep a private
export and that release before upgrading. To recover, restore into an empty
installation of that release, upgrade that installation in place with `rer install`
and `rer setup`, then export again with the upgraded release. Do not import a
pre-upgrade export directly into a newer release.

Real deployment uses the owner-account procedure and its private credentials.
`rer deploy --dry-run` validates and builds locally without a
provider request. The default environment is `production`; select another with
`--environment NAME`. Local validation does not establish provider acceptance,
hosted health or mail delivery.

`rer describe` reads the current checkout's actual verbs,
flags, aliases, pins, effects and local state without installing or running
project commands. New verbs accept `--help`, `--cwd PATH`, `--non-interactive`
and `--json`. Setup also accepts `--owner-name`, `--port`, `--host` and a
private JSON `--answers FILE`. Dev and preview accept `--port`, `--host`,
`--idle-timeout`, and `--stop`. Deploy accepts `--environment` and `--dry-run`;
export/import accept their target, file and restore options. `check` accepts
`--profile first-party`. Heavy commands accept `--no-queue` only when the
original caller has `CI=true`. Release retains its own compatibility flags.

Use the installed command directly from this checkout: `rer install`,
`rer setup`, `rer dev`, and `rer deploy --dry-run`. Pass flags directly to the
verb; `rer describe` lists the available commands and their effects.

Local durable state is `.wrangler/state`; CLI bookkeeping is `.rer/local`,
installer state is `.seed/installer`, and the default private settings file is
`.dev.vars` with mode 0600. Setup writes this checkout's dev key to
`.rer/local/dev-key.env` (mode 0600); a repeat setup keeps it and reset removes
it, which also ends every browser's earlier dev cookie. Dev sign-in, personas
and the development outbox answer only a request holding that key's cookie, so
a tunnel or local proxy to the app cannot reach them; anything else returns 404.
Any local user or process that can read the checkout can read the key and sign
in as the owner. `rer deploy` refuses the key, and `rer build` refuses output
that contains the dev layer.

The first-party command profile is optional for independently authored
projects. They may keep their own runtime, tools, installer, commands and
provider choices. RER executes only their declared operations and does not
impose Base pins, aliases, outbox or state layout.
