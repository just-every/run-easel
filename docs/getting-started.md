Start Easel on your own computer with one line, signed in as its owner:

```sh
{{run.start}}
```

macOS, Linux or Windows with WSL2. {{run.requirements}}

Already have Node 22 or later? Use this alternative:

```sh
{{run.clone}}
```

## Get Easel and start it

The line clones Easel into `./run-easel`, installs everything and makes you the owner. To start Easel again later, run `cd ./run-easel && rer dev`. When Easel is ready, it prints two lines:

- `RER_READY` with the local address, and
- `RER_OPEN`, a link that opens Easel signed in as the owner.

Open the `RER_OPEN` link on this computer. It carries this checkout's private key, so treat it like a password: do not paste it into chats or tickets.

The first time, Easel asks you to **Finish setup**: check the owner's name and email, confirm, and press **Finish setup**. Then [set up your plan](/docs/first-plan). To put Easel online for your team, follow the [hosting guide](https://run-easel.com/docs/hosting).

## Use your own email

After installing `rer`, use these commands to make a specific mailbox the owner before the first `rer dev`:

```sh
rer install just-every/run-easel
cd ./run-easel
rer setup --owner-email you@example.com
rer dev
```

Local dev opens signed in with one click; mail is silently suppressed.

## Try it as other people

Easel has local test people for each role. Start as one of them with `--as`:

```sh
rer dev --as sales
```

Open the new `RER_OPEN` link in a separate browser session for that person. `finance` plans everything. `sales` and `engineering` are contributors and `board` is a viewer once finance adds them under **Settings → People**. Contributors also need the owner's **Grant pay detail** permission to see and edit their department's positions (see [People and access](/docs/people-and-access)).

## Stop it

```sh
rer dev --stop
```

Your plan stays in the checkout and is there again the next time you run `rer dev`. `rer describe` lists every command and what it does.
