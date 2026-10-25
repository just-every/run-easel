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

A real deployment needs your Cloudflare account ID and API token, supplied privately. Required application secrets are `OWNER_EMAIL`, `SESSION_SECRET`, `SETUP_TOKEN` and `MAIL_API_KEY`. Choose Resend, SendGrid, Cloudflare Email Sending or RER managed mail. Edit and commit the public `MAIL_PROVIDER` and verified `MAIL_FROM` sender in `deploy.json` before deploying; for RER also set `MAIL_RELAY_URL`, and for Cloudflare set `MAIL_ACCOUNT_ID`. Keep the mail key private. The setup form collects these provider settings for Assisted hosting; Managed hosting supplies its relay settings. The deployed Easel opens with its own **Finish setup** for the owner, then everyone signs in with an emailed link.

To move your existing plan, [export it](/docs/backup-and-restore) first and restore it into the new installation.
