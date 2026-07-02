# Example app

Demonstrates `react-native-fabric-rich-text`: a built-in-tags screen and a custom `<mention>`
tag rendered as a native chip.

The JS/TS of this app (`App.tsx`, `src/screens/*`) is complete and committed. The **native
host projects** (`ios/`, `android/`) are generated on your machine because they must be built
with Xcode / the Android toolchain — which don't run in the cloud dev container where this was
authored.

## Prerequisites

- Node ≥ 18, Yarn
- **iOS:** macOS + Xcode 15+, CocoaPods, Ruby
- **Android:** JDK 17, Android SDK/emulator
- React Native New Architecture is required (RN 0.76+, enabled by default).

## One-time setup

From the repo root:

```sh
yarn install
```

### Generate the native host projects

The library targets RN 0.76.0. Generate a matching host app and move its native folders in:

```sh
# from a scratch location, NOT inside this repo
npx @react-native-community/cli@0.76.0 init RichTextEditorExample --version 0.76.0 --skip-install

# copy the generated native projects into this example
cp -R RichTextEditorExample/ios    <repo>/example/ios
cp -R RichTextEditorExample/android <repo>/example/android
```

Then set the app entry to this repo's `index.js` / `App.tsx` (already provided) and confirm
`app.json`'s name (`RichTextEditorExample`) matches the generated project.

> The library is auto-linked: `react-native.config.js` in `packages/rich-text-editor`
> registers the iOS pod and the Android `RichTextEditorPackage`. Metro is already configured
> (`metro.config.js`) to resolve the library from source, and Babel aliases the package name
> to `packages/rich-text-editor/src` for hot-reload of library edits.

## iOS

```sh
cd example/ios && pod install && cd ..
yarn ios
```

If Swift/Fabric linking needs it, ensure the pod is picked up:

```ruby
# example/ios/Podfile — inside the target
pod 'RichTextEditor', :path => '../../packages/rich-text-editor'
```

## Android

```sh
yarn android
```

## What to try

Follow [`docs/testing-checklist.md`](../docs/testing-checklist.md). Phase 2 covers the iOS
inline styles: type text, select a range, tap **B / I / U / S**, and confirm the serialized
HTML box updates with correctly merged tags.
