#!/usr/bin/env bash
set -euo pipefail
android_root="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
gradle_bin="${GRADLE_BIN:-gradle}"
if ! command -v "$gradle_bin" >/dev/null 2>&1; then
  printf '%s\n' 'Set GRADLE_BIN to Gradle 9.3.1 and JAVA_HOME to JDK 17 or newer.' >&2
  exit 1
fi
"$gradle_bin" --no-daemon --max-workers=2 --console=plain -p "$android_root" :app:assembleDebug :app:assembleDebugAndroidTest
