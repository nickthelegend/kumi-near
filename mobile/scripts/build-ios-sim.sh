#!/bin/zsh
# Standalone Kumi for the iOS Simulator (not Expo Go): its own icon, splash and embedded JS bundle.
#   mobile/scripts/build-ios-sim.sh            -> web/public/download/Kumi-iOS-Simulator.zip (+ .sha256, manifest.json)
# Release build for Apple-silicon simulators (arm64), ad-hoc signed ("-") so the keychain works for the
# on-device wallet (expo-secure-store fails with "A required entitlement isn't present" when unsigned).
# On this Mac only one Xcode build runs at a time: it takes grokbot/orchestration/.xcode-lock and frees it after.
set -euo pipefail
export LANG=en_US.UTF-8
HERE=${0:A:h}
MOBILE=${HERE:h}
REPO=${MOBILE:h}
LOCK="$REPO/../../orchestration/.xcode-lock"
OUT="$REPO/web/public/download"

if [[ "${KUMI_HAVE_LOCK:-}" != 1 ]]; then
  until mkdir "$LOCK" 2>/dev/null; do echo "waiting for the Xcode lock ($(cat "$LOCK/owner" 2>/dev/null))"; sleep 30; done
  echo "kumi-avax $(date -u +%FT%TZ)" > "$LOCK/owner"
  trap 'rm -rf "$LOCK"' EXIT
fi

cd "$MOBILE"
[[ -d ios ]] || npx expo prebuild --platform ios --no-install
(cd ios && pod install)
(cd ios && xcodebuild -workspace Kumi.xcworkspace -scheme Kumi -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= | tail -3)

APP="$MOBILE/ios/build/Build/Products/Release-iphonesimulator/Kumi.app"
mkdir -p "$OUT"
rm -f "$OUT/Kumi-iOS-Simulator.zip"
(cd "${APP:h}" && ditto -c -k --norsrc --keepParent Kumi.app "$OUT/Kumi-iOS-Simulator.zip")
SHA=$(shasum -a 256 "$OUT/Kumi-iOS-Simulator.zip" | cut -d' ' -f1)
BYTES=$(stat -f %z "$OUT/Kumi-iOS-Simulator.zip")
VERSION=$(node -p "require('$MOBILE/app.json').expo.version")
echo "$SHA  Kumi-iOS-Simulator.zip" > "$OUT/Kumi-iOS-Simulator.zip.sha256"
node -e "
const fs = require('fs'); const p = '$OUT/manifest.json';
const m = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { expo: { url: null } };
m.ios = { file: 'Kumi-iOS-Simulator.zip', bytes: $BYTES, sha256: '$SHA', version: '$VERSION', built: new Date().toISOString().slice(0, 10),
  bundleId: 'xyz.kumi.avax', build: 'Release, iphonesimulator arm64 (Apple silicon Macs), ad-hoc signed' };
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');"
echo "Kumi-iOS-Simulator.zip $BYTES bytes, sha256 $SHA"
echo "Install: unzip it, then: xcrun simctl install booted Kumi.app && xcrun simctl launch booted xyz.kumi.avax"
[[ "${KEEP_BUILD:-}" == 1 ]] || rm -rf "$MOBILE/ios/build"
