On your own computer, Easel is yours alone. To plan with other people, put it on your own Cloudflare account, where it runs as the same app with your data.

## Check it first

```sh
rer deploy --dry-run
```

This builds Easel and validates the deployment settings in `deploy.json`. With Cloudflare credentials, it also checks the target's existing secret bindings; it uploads nothing.

## Deploy

```sh
rer deploy
```

A real deployment needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, with Workers Scripts edit and D1 edit permissions on your account. Supply these privately in the command's environment, together with `MAIL_PROVIDER` (`sendgrid` or `resend`), `MAIL_FROM` (your verified sender) and `MAIL_API_KEY` (that provider's key). An owned, private `--env-file` is also supported. Keep credentials out of source control.

The command creates the Worker and D1 database, applies migrations, claims the setup owner and retires the one-time setup token. Keep its private `.rer/deploy` records with the checkout. Use `rer signin` from that checkout for a one-time owner link, complete **Finish setup**, then invite people from **Settings → People**. Each person accepts their delivered email through the native confirmation page.

## Health and refresh

Open `/health` at the deployed origin to check reachability. Planning routes require a native signed-in session. Deployment also checks the active Worker and its database binding.

The hosted Worker registers the same fifteen-minute trigger as local development. For Gauge observations, supply the installation-owned `GAUGE_ORIGIN` binding, connect a scoped utilization key in **Settings → Connections**, and explicitly enable the observation cadence and month. The scheduled read records its source, scheduled time, actual refresh time and scheduler authority. It updates the observation without changing approved budgets or published packs. Unknown outcomes are retained for inspection rather than automatically retried. A newly registered Cloudflare trigger can take about two hours to begin dispatching; verify an actual successful refresh in Connections before relying on it.

Connector keys are sealed with the installation's session secret and excluded from archives. Disconnect revokes the scoped provider key and removes local custody. After a restore, reconnect sources using fresh provider approval.

To move your existing plan, [export it](/docs/backup-and-restore) first and restore it into the new installation.
