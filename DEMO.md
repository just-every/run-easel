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

The package and demo/auth/mail source modules adopt Base `rer-v0.2.24`.
`.github/workflows/run-demo.yml` deploys via the run-demo environment on
RunEditRun. Test-only instrumentation checks real example.com reads and mocked
message writes from a signed-in visitor. The demo uses basic containers and Jordan Ellis’s Harbour Analytics owner
address. The homepage demo CTA is retained.
