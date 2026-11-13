#!/bin/zsh
# Standalone Kumi (NEAR) for the iOS Simulator (not Expo Go): its own icon, splash and embedded JS bundle.
#   mobile/scripts/build-ios-sim.sh   -> mobile/build-out/Kumi-NEAR-iOS-Simulator.zip (+ .sha256)
# Release build for Apple-silicon simulators (arm64), ad-hoc signed ("-") so the keychain works for the on-device key
# (expo-secure-store fails with "A required entitlement isn't present" when unsigned). Everything it writes (Pods,
# DerivedData, the zip) stays inside mobile/. One Xcode build at a time on this Mac: grokbot/orchestration/.xcode-lock.
set -euo pipefail
export LANG=en_US.UTF-8
HERE=${0:A:h}
MOBILE=${HERE:h}
LOCK="$MOBILE/../../../orchestration/.xcode-lock"
OUT="$MOBILE/build-out"
FREE=$(df -g / | tail -1 | awk '{print $4}')
(( FREE >= 5 )) || { echo "BLOCKED: only ${FREE} GB free on the system disk (need 5)"; exit 1; }
if [[ -d "${LOCK:h}" && "${KUMI_HAVE_LOCK:-}" != 1 ]]; then
  until mkdir "$LOCK" 2>/dev/null; do echo "waiting for the Xcode lock ($(cat "$LOCK/owner" 2>/dev/null))"; sleep 30; done
  echo "kumi-near $(date -u +%FT%TZ)" > "$LOCK/owner"
  trap 'rm -rf "$LOCK"' EXIT
fi
cd "$MOBILE"
[[ -d ios ]] || npx expo prebuild --platform ios --no-install
(cd ios && pod install)
(cd ios && xcodebuild -workspace Kumi.xcworkspace -scheme Kumi -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= | tail -3)
APP="$MOBILE/ios/build/Build/Products/Release-iphonesimulator/Kumi.app"
mkdir -p "$OUT"; rm -f "$OUT/Kumi-NEAR-iOS-Simulator.zip"
(cd "${APP:h}" && ditto -c -k --norsrc --keepParent Kumi.app "$OUT/Kumi-NEAR-iOS-Simulator.zip")
SHA=$(shasum -a 256 "$OUT/Kumi-NEAR-iOS-Simulator.zip" | cut -d' ' -f1)
echo "$SHA  Kumi-NEAR-iOS-Simulator.zip" > "$OUT/Kumi-NEAR-iOS-Simulator.zip.sha256"
echo "Kumi-NEAR-iOS-Simulator.zip sha256 $SHA"
echo "Install: unzip it, then: xcrun simctl install booted Kumi.app && xcrun simctl launch booted xyz.kumi.near"
