Easel runs on your own computer with the `rer` command. One line gets it open in your browser, signed in as you, the owner.

Easel runs on macOS, Linux or Windows with WSL2. `rer` selects the exact Node version Easel declares and fetches a checksum-verified copy when your computer does not have it.

## Get Easel and start it

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-easel
```

That one line installs `rer`, clones Easel into `run-easel` and starts it. Git is required; rer brings Node and pnpm. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-easel` does the same. If the installer prints a line that puts `rer` on your PATH, run that line too. To start Easel again later, run the same line from the same folder, or `cd run-easel && rer dev`. `rer dev` installs everything, makes you the owner and prints two lines when Easel is ready:

- `RER_READY` with the local address, and
- `RER_OPEN`, a link that opens Easel signed in as the owner.

Open the `RER_OPEN` link on this computer. It carries this checkout's private key, so treat it like a password: do not paste it into chats or tickets.

The first time, Easel asks you to **Finish setup**: check the owner's name and email, confirm, and press **Finish setup**. Then [set up your plan](/docs/first-plan).

## Use your own email

To make a specific mailbox the owner, run `npx -y @runeditrun/rer install just-every/run-easel`, then setup from the checkout before the first `rer dev`:

```sh
rer setup --owner-email you@example.com
rer dev
```

Local dev opens signed in with one click; mail is silently suppressed.

## Try it as other people

Easel has local test people for each role. Start as one of them with `--as`:

```sh
rer dev --as sales
```

`finance` plans everything. `sales` and `engineering` are contributors and `board` is a viewer once finance adds them under **Settings → People** (see [People and access](/docs/people-and-access)).

## Stop it

```sh
rer dev --stop
```

Your plan stays in the checkout and is there again the next time you run `rer dev`. `rer describe` lists every command and what it does.
