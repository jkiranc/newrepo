# Running & building locally

This repo has **no committed native `android/` (or `ios/`) project**. The example app is
JS-only; a runnable native host app is **generated on demand** — that's what CI does
(`.github/workflows/android-apk.yml`) and what `scripts/local-android.sh` does on your machine.

---

## 1. JS-only checks (no Android/iOS toolchain needed)

From the library package:

```bash
cd packages/rich-text-editor
npm install          # or: yarn (from repo root)
npx tsc --noEmit     # type-check
npx jest             # unit tests (HTML round-trips, parser, registry, segments)
```

This validates all the JS/TS logic (parsing, serialization, the document model). It does **not**
exercise the native rendering.

---

## 2. Prerequisites for Android

- **Node.js 20+**
- **JDK 17** (Temurin recommended)
- **Android Studio** + SDK. Then set env vars (add to `~/.zshrc` / `~/.bashrc`):
  ```bash
  export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS; Linux: ~/Android/Sdk
  export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
  ```
- A target to run on:
  - a **physical device** with USB debugging on (`adb devices` shows it), or
  - an **emulator** (create an AVD in Android Studio and start it).

---

## 3. Generate the host app + run (live development)

From the repo root:

```bash
scripts/local-android.sh          # first run: generates ./host, links the library, installs deps
cd host && npx react-native run-android
```

- The first run downloads the RN template + Gradle deps, so it takes a while.
- `react-native run-android` starts Metro and installs a debug build with **Fast Refresh** —
  edit files under `packages/rich-text-editor/src` and the app reloads.
- The generated `host/` folder is git-ignored; regenerate anytime with `--clean`.

> ABIs: the script builds `arm64-v8a,x86_64` by default (covers real devices and most
> emulators). Override with `RTE_ARCHS=arm64-v8a scripts/local-android.sh --clean` if you only
> target a device and want faster builds.

---

## 4. Build a sideloadable release APK (same as CI)

```bash
scripts/local-android.sh --apk
```

Output: `host/android/app/build/outputs/apk/release/app-release.apk` (self-signed with the debug
keystore, so it installs without release-signing setup).

```bash
adb install -r host/android/app/build/outputs/apk/release/app-release.apk
```

---

## 5. Important: rebuild after **native** changes

- Editing **JS/TS** (`src/**`) → Fast Refresh picks it up; just save.
- Editing **native** code (`android/**/*.kt`, `ios/**`) or the **codegen spec**
  (`src/RichTextEditorNativeComponent.ts`, which changes commands/events/props) → you must
  **rebuild the native app**: re-run `npx react-native run-android`, or for a clean slate
  `scripts/local-android.sh --clean` then run again. Fabric codegen re-runs during the native
  Gradle build.

---

## 6. iOS (macOS only)

iOS needs a Mac with **Xcode** + **CocoaPods**. There's no local iOS script yet; the flow mirrors
Android — generate a host app, `pod install`, open the workspace in Xcode (or
`npx react-native run-ios`). CI currently only builds Android APKs. If you want an iOS local
script, ask and I'll add one.

---

## 7. Common issues

- **`ANDROID_HOME is not set`** — export it (section 2) and restart the shell.
- **Metro can't resolve `react-native-fabric-rich-text` / `htmlparser2`** — re-run
  `scripts/local-android.sh --clean`; it wires Metro's `watchFolders` / `extraNodeModules` to the
  monorepo and installs the library's runtime deps.
- **Emulator shows a blank/old screen after native changes** — rebuild (`run-android` again); JS
  Fast Refresh does not apply native changes.
- **Gradle daemon / memory errors** — first build is heavy; ensure JDK 17 and enough RAM, retry.
```
