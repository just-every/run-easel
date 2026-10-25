#!/usr/bin/env bash
set -euo pipefail
android_root="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export EASEL_ANDROID_ROOT="$android_root"
python3 - <<'PY'
import os, pathlib, shlex, subprocess, sys

root = pathlib.Path(os.environ['EASEL_ANDROID_ROOT'])
adb = pathlib.Path(os.environ['ANDROID_HOME']) / './platform-tools/adb'
prefix = [str(adb)]
if os.environ.get('ANDROID_SERIAL'):
    prefix += ['-s', os.environ['ANDROID_SERIAL']]

def run(*args, capture=False):
    return subprocess.run(prefix + list(args), check=True, text=True, capture_output=capture)

required = ['EASEL_ORIGIN', 'EASEL_TOKEN', 'EASEL_PROPOSAL', 'EASEL_EDGE_ORIGIN']
missing = [key for key in required if not os.environ.get(key)]
if missing:
    raise SystemExit('Missing environment variables: ' + ', '.join(missing))
width = int(os.environ.get('EASEL_WIDTH', '390'))
height = 844 if width == 390 else 1000
destination = root / 'evidence' / str(width)
destination.mkdir(parents=True, exist_ok=True)
for previous in destination.glob(f"{width}-*.png"):
    previous.unlink()
run('install', '-r', str(root / 'app/build/outputs/apk/debug/app-debug.apk'))
run('install', '-r', str(root / 'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
run('shell', 'pm', 'grant', 'com.runeditrun.easel', 'android.permission.POST_NOTIFICATIONS')
run('shell', 'rm', '-rf', '/sdcard/Android/data/com.runeditrun.easel/files/evidence')
previous_size = run('shell', 'wm', 'size', capture=True).stdout
previous_density = run('shell', 'wm', 'density', capture=True).stdout
try:
    run('shell', 'wm', 'size', f'{width}x{height}')
    run('shell', 'wm', 'density', '160')
    args = ['am', 'instrument', '-w', '-r']
    values = {'origin': os.environ['EASEL_ORIGIN'], 'token': os.environ['EASEL_TOKEN'],
              'proposal': os.environ['EASEL_PROPOSAL'], 'edgeOrigin': os.environ['EASEL_EDGE_ORIGIN'],
              'width': str(width), 'fakeDeviceToken': os.environ.get('EASEL_FAKE_DEVICE_TOKEN', 'synthetic-easel-2')}
    if os.environ.get('EASEL_DEPARTMENT'):
        values['department'] = os.environ['EASEL_DEPARTMENT']
    if os.environ.get('EASEL_VIEWER_TOKEN'):
        values['viewerToken'] = os.environ['EASEL_VIEWER_TOKEN']
    for key, value in values.items():
        args += ['-e', key, value]
    args += ['com.runeditrun.easel.test/com.runeditrun.easel.NativeJourney']
    # Quote the remote shell command once; never print credential-bearing arguments.
    proof = run('shell', shlex.join(args), capture=True)
    print(proof.stdout)
    if 'Native Android journey passed.' not in proof.stdout:
        raise SystemExit('Android native journey failed')
    run('pull', '/sdcard/Android/data/com.runeditrun.easel/files/evidence/.', str(destination))
finally:
    def override(text):
        return next((line.split(':', 1)[1].strip() for line in text.splitlines() if line.startswith('Override')), 'reset')
    run('shell', 'wm', 'size', override(previous_size))
    run('shell', 'wm', 'density', override(previous_density))
PY
