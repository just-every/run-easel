# Easel Android

Framework-native Java screens, a real Firebase Cloud Messaging service, and an instrumentation APK. Financial read models, cookies and installation identity stay in process memory. Backgrounding discards rendered financial records and reviewed proposal comparisons. Sign-out revokes the device and Base session, deletes the FCM installation identity, clears native memory and removes notifications. Backup and automatic view state are disabled; secure windows prevent financial overview thumbnails.

The named tabs read the existing role-filtered Easel HTTP APIs. Dashboard includes saved dashboards and scenario cash summaries. Tasks includes metric tasks and the planning calendar. Approval shows the actual changed inputs, cells and cash comparison, then explicitly promotes the exact reviewed revision. A conflict requires another review. Comments uses the ordinary command endpoint. Native networking never follows an authentication redirect or persists a cookie.

## Build

Use JDK 17 or newer, Gradle 9.3.1 and the Android SDK with platform 34 and build tools 36. The supplied build uses Android Gradle Plugin 9.1.1. Run this command through the parent's shared heavy-work slot:

```sh
JAVA_HOME=./toolchain/jdk GRADLE_BIN=./toolchain/gradle-9.3.1/bin/gradle ./native/android/build.sh
```

The artifacts are `./native/android/app/build/outputs/apk/debug/app-debug.apk` and `./native/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`. The build does not need Firebase account credentials. It downloads the actual Firebase Android SDK from Google's Maven repository.

For live FCM delivery, supply the installation's Firebase Android client configuration as `./native/android/app/google-services.json` (ignored by git), registered for package `com.runeditrun.easel`. Alternatively pass Gradle properties `easelFirebaseAppId`, `easelFirebaseApiKey`, `easelFirebaseProjectId` and `easelFirebaseSenderId`. These public client options are compiled into the app; service-account secrets belong only on the Easel server. Enable notifications explicitly in Settings. The app requests Android permission, acquires a real FCM token and registers it against the current Easel session. Send data-only FCM messages; received payload fields are never shown or trusted. A notification opens a fresh authenticated Alerts request. Configure the server's Firebase project to match the client.

## Native journey

The parent harness starts the real Easel server, creates a fresh finance confirmation token and pending proposal for each viewport, and exposes its test-only provider edge through `adb reverse`. It supplies:

```sh
export EASEL_ORIGIN=http://localhost:PORT
export EASEL_TOKEN                 # one-use native email confirmation token
export EASEL_PROPOSAL              # real submitted proposal id
export EASEL_EDGE_ORIGIN=http://localhost:EDGE_PORT
export EASEL_WIDTH=390             # repeat with 1440 and fresh fixtures
./native/android/instrument.sh
```

Optional environment variables: `ANDROID_SERIAL`, `EASEL_DEPARTMENT`, `EASEL_FAKE_DEVICE_TOKEN` (synthetic fixture only). The app requires HTTPS in installations; cleartext is accepted only for emulator loopback and emulator host `10.0.2.2`.

`NativeJourney` signs in through native fields; opens every tab; verifies the existing fixture workspace, saved dashboard, calendar task and comment; registers a synthetic FCM token using the production registration method; then requests `GET /push?platform=android` on the parent's test-only edge. That request triggers the real cash alert and returns its captured FCM `message.data` map (or enclosing `message` envelope). The runner calls the actual `EaselMessagingService.onMessageReceived(RemoteMessage)` with that captured data and taps the produced notification. There is no exported fake receiver or fake branch in the app. The runner reviews and promotes the proposal, posts a comment, checks background erasure, signs out, and checks memory, notifications and persistent app storage. The fixture names it checks are supplied by the shared native journey: “Larch Labs”, “Board operating outlook”, “Review October outlook”, and “Please review the hiring plan.”

The test temporarily clears the secure-window flag to capture evidence, without changing the production Activity. Each run captures every screen in `./native/android/evidence/<width>/`, and restores the emulator's previous display size and density. It leaves the app signed out and finishes its Activity. APK signing here is debug signing; Play distribution requires the installation owner's release signing and developer account.
