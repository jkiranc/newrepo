#!/usr/bin/env bash
#
# Build / run the example app locally by generating a fresh React Native host app and linking
# this library into it — the same thing .github/workflows/android-apk.yml does in CI, but on
# your machine.
#
# Usage:
#   scripts/local-android.sh            # generate the host app (first run), then print next steps
#   scripts/local-android.sh --apk      # generate if needed, then build a sideloadable release APK
#   scripts/local-android.sh --clean    # delete and regenerate the host app from scratch
#
# After generating, for live development run:  (cd host && npx react-native run-android)
#
# Env overrides:
#   RTE_ARCHS=arm64-v8a,x86_64   # ABIs to build (default covers real devices + emulators)
set -euo pipefail

RN_VERSION="0.76.0"
CLI_VERSION="15.0.1"       # @react-native-community/cli 15.x targets RN 0.76
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_DIR="$ROOT/host"
ARCHS="${RTE_ARCHS:-arm64-v8a,x86_64}"
MODE="${1:-}"

cd "$ROOT"

# --- prerequisites --------------------------------------------------------------------------
command -v node >/dev/null || { echo "❌ Node.js 20+ is required."; exit 1; }
command -v java >/dev/null || { echo "❌ JDK 17 is required (temurin recommended)."; exit 1; }
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  echo "❌ ANDROID_HOME / ANDROID_SDK_ROOT is not set."
  echo "   Install Android Studio, then export ANDROID_HOME and add platform-tools to PATH."
  exit 1
fi

# --- generate the host app (once, or on --clean) --------------------------------------------
if [ ! -d "$HOST_DIR" ] || [ "$MODE" = "--clean" ]; then
  echo "▶ Generating React Native $RN_VERSION host app in ./host ..."
  rm -rf "$HOST_DIR"

  # Temporarily drop the root "workspaces" field so npm treats host/ as a standalone project.
  cp package.json .package.json.bak
  trap 'mv -f "$ROOT/.package.json.bak" "$ROOT/package.json" 2>/dev/null || true' EXIT
  npm pkg delete workspaces

  npx --yes "@react-native-community/cli@${CLI_VERSION}" init RTEHost \
    --version "$RN_VERSION" --directory host --skip-install --skip-git-init --pm npm

  mv -f .package.json.bak package.json
  trap - EXIT

  echo "▶ Overlaying example JS and linking the library ..."
  cp example/App.tsx host/App.tsx
  rm -rf host/src && cp -R example/src host/src
  ( cd host && npm pkg set dependencies.react-native-fabric-rich-text="file:../packages/rich-text-editor" )
  # The host consumes the library from source, so drop its bob `prepare` build step.
  ( cd packages/rich-text-editor && npm pkg delete scripts.prepare )

  echo "newArchEnabled=true" >> host/android/gradle.properties
  echo "reactNativeArchitectures=${ARCHS}" >> host/android/gradle.properties

  # Metro must resolve the library from its TS source in the monorepo.
  cat > host/metro.config.js <<'METRO'
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const root = path.resolve(__dirname, '..');
const libRoot = path.resolve(root, 'packages/rich-text-editor');
const config = {
  watchFolders: [root],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(root, 'node_modules'),
      path.resolve(libRoot, 'node_modules'),
    ],
    extraNodeModules: { 'react-native-fabric-rich-text': libRoot },
  },
};
module.exports = mergeConfig(getDefaultConfig(__dirname), config);
METRO

  # Self-sign the release build with the bundled debug keystore so the APK installs on a device.
  cat >> host/android/app/build.gradle <<'GRADLE'

android {
    signingConfigs {
        release {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
GRADLE

  echo "▶ Installing dependencies ..."
  ( cd host && npm install --ignore-scripts --no-audit --no-fund )
  # The library's runtime deps (htmlparser2) must be resolvable by Metro from source.
  ( cd packages/rich-text-editor && npm install --omit=dev --ignore-scripts --no-audit --no-fund )
  echo "✅ Host app ready in ./host"
fi

# --- build or print next steps --------------------------------------------------------------
if [ "$MODE" = "--apk" ]; then
  echo "▶ Building release APK ..."
  ( cd host/android && ./gradlew assembleRelease )
  echo "✅ APK: host/android/app/build/outputs/apk/release/app-release.apk"
  echo "   Install with: adb install -r host/android/app/build/outputs/apk/release/app-release.apk"
else
  cat <<'NEXT'

Next steps:
  • Live development (Fast Refresh) on a connected device / running emulator:
      (cd host && npx react-native run-android)
  • Build a sideloadable release APK:
      scripts/local-android.sh --apk
  • Start fresh (after big native changes):
      scripts/local-android.sh --clean
NEXT
fi
