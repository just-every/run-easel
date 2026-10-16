# Easel demo

`rer demo` opens signed in with Harbour Analytics’ existing plan, accepted
actuals, approved budget, forecast and published review pack. Stop it with
`rer demo --stop`; its throwaway `.rer/demo/` data is deleted while the saved
owner's `.wrangler/state` stays untouched. `rer dev` uses the saved local state.

The product name and title read Easel Demo or Easel Dev. Local sign-in is one
click and mail is silently suppressed. There is no injected bar or outbox.

Base's demo guard runs public internet reads and checks for real and returns
mocked success for third-party writes. POST-based public reads use
`fetchDemoRead`; non-HTTP or provider-specific sends use `demoEffect` from
`src/modules/demo/index.mjs`. Base mail and operator-auth provide the accepted demo success envelope
without sending; no seed-side mail wrapper is needed. Production
uses the configured provider, and Base refuses production RER_DEMO builds.

The package and the recorded Base copies adopt Base `rer-v0.2.30`.
`.github/workflows/run-demo.yml` is Base's `export/run-demo.yml`: it deploys
demo.run-easel.com from the run-demo environment on RunEditRun as a native
Worker Loader host. Each visitor gets an isolated copy (SQLite storage for the
D1 database) that ends after 60 minutes or 15 idle minutes. Easel makes no
public internet reads; invitations and mail are mocked by Base's demo guard.
The demo owner is Jordan Ellis at Harbour Analytics. The homepage demo CTA is
retained.
