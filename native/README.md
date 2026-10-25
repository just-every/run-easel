# Easel native apps

The Android app uses framework Java views. It signs in through the installation's existing one-use email link, read its role-filtered HTTP views, and approve through its ordinary exact-revision proposal command. It keeps no local database or financial cache on disk. Backgrounding removes financial records and reviewed comparisons from memory; returning fetches current authority and values. Sign-out clears local records and notifications, revokes the native session, and deletes its sealed push custody on the server. If the installation is unreachable, local erasure still happens and the app says that server revocation could not be confirmed.

Enter the installation's HTTPS origin, request a sign-in email, and paste its confirmation link. Loopback HTTP is supported for local simulator journeys. The native build can be used without a push account; real push delivery requires the buyer's Apple or Firebase setup. The contract's provider-fake journeys do not claim live account delivery or App Store distribution.

## Push setup and consent

Push starts off. Each signed-in person explicitly enables generic notifications from native Settings and grants the operating-system permission. The server stores the platform token and exact native session in the existing sealed connection-secret table; portable exports omit that custody. The public device read returns only the current session's metadata and delivery outcomes. Personal API credentials, service credentials and scheduled agents cannot register a person's device or consent for them.

Set these deployment secrets for Apple: `EASEL_APNS_PRIVATE_KEY` (PKCS8 P8 key), `EASEL_APNS_TEAM_ID`, `EASEL_APNS_KEY_ID`, and `EASEL_APNS_TOPIC` (the app bundle identifier). `EASEL_APNS_SANDBOX=true` selects Apple's fixed sandbox endpoint; the default is Apple's production endpoint. The server signs and renews its short-lived ES256 provider assertion.

For Android, set `EASEL_FCM_SERVICE_ACCOUNT` to the service-account JSON containing `private_key`, `client_email`, and `project_id`, and configure the Android client for that same Firebase project. The server signs an RS256 assertion and exchanges it at Google's fixed OAuth token endpoint. A fresh access token is obtained before delivery. Keys and access tokens never enter the model, activity or client response.

Only the generic “Easel notification” is sent to either provider. Push carries no financial amount, title, department, person, comment or destination URL. Android uses data-only FCM so the app controls display and suppresses it when signed out. Opening any notice fetches current authorized data. Provider expiry is zero to avoid storing notices while a device is offline. An already accepted generic Apple notice can race sign-out; it contains no private detail, and opening it still requires sign-in.

Alerts, metric tasks, calendar assignments and reminders, pending department reviews, pending budget or proposal approvals, and mentions use the opted-in route. The native task-assignment and proposal hooks create no extra email or chat sends. Existing notification preferences keep their established delivery behavior. Each event and device receives one durable intent; live session, current role, record visibility and consent are checked again after provider authorization and immediately before egress. Accepted means provider acceptance. Refused, unknown or interrupted sends are retained honestly and are never blindly retried.

The adopted default is explicit audited consent for generic notices, exact-session binding, existing role authority, no financial data on a provider, zero offline delivery retention, sealed archive-excluded token custody, and local erasure even when disconnected. MOBILE-002 remains partial until ct approves this new mobile consent and custody policy.

## Native proof

`./tests/native-mobile-journey.mjs` runs the committed Android app against a real local Easel Worker and D1. Each run creates a realistic plan, shared dashboard, calendar task, comment and submitted proposal. Only mail, APNS and FCM network boundaries are faked. The mail boundary supplies a genuine one-use sign-in token; the cash-alert command supplies the captured push envelope. The Android app reads the real dashboard and tasks, receives the cash-alert push, reviews the real comparison, approves its exact revision, and signs out. It also posts a comment and asserts background erasure and absence of persistent financial storage.

Run these through the shared heavy-work slot, with only the named emulator booted. Use fresh fixtures for each width:

```sh
node ./tests/native-mobile-journey.mjs --platform=android --width=390 --device=<emulator-serial>
```

Android's test is `NativeJourney.journey` in `./native/android/app/src/androidTest/java/com/runeditrun/easel/NativeJourney.java`. Native screenshots cover each tab, Settings, review, approval and sign-out. The server lifecycle test in `./tests/notifications.test.mjs`, “Native push consent binds the exact session, delivers generic Apple and Firebase events once and suppresses stale authority, revoked sessions and devices”, also proves real provider signatures, every event class, consent refusal, bearer refusal, session revocation, role removal during authorization, deduplication, unknown outcomes, and export exclusions.

The Apple provider adapter is implemented and covered through the server lifecycle test. The iOS client is held outside this candidate pending its required 1440-point native proof. Its previous 390-point journey passed, but the single resumed wide run stopped at an iPadOS floating-window width assertion. The prepared fullscreen correction has not been exercised in another simulator run.
