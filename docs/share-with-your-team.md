On your own computer, Easel is yours alone. To plan with other people, put it on your own Cloudflare account, where it runs as the same app with your data.

## Check it first

```sh
rer deploy --dry-run
```

This builds Easel and checks the deployment settings in `deploy.json` without contacting anyone.

## Deploy

```sh
rer deploy
```

A real deployment needs your Cloudflare account ID and an API token, supplied privately, and a verified sender address for sign-in email in `deploy.json`. The deployed Easel opens with its own **Finish setup** for the owner, then everyone signs in with an emailed link.

To move your existing plan, [export it](/docs/backup-and-restore) first and restore it into the new installation.
