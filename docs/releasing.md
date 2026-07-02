# Releasing

`react-native-fabric-rich-text` is published from `packages/rich-text-editor`. v1 uses a
manual release; changesets/CI automation can come later.

## Pre-flight

```sh
yarn                       # install
yarn test                  # Jest — must be green
yarn typecheck             # tsc --noEmit
yarn lint
```

Also run the native checks where you can:
- iOS: `SpanApplierTests`, `StyleEngineTests`, `EmbedTests` (XCTest).
- Android: `SpanApplierTest`, `StyleEngineTest`, `EmbedSpanTest` (Robolectric).
- Build the example app (or trigger the **Android APK** workflow) and run
  [`docs/testing-checklist.md`](./testing-checklist.md) on a device.

## Build & publish

```sh
cd packages/rich-text-editor
yarn prepare               # react-native-builder-bob → lib/ (commonjs, module, typescript)
npm version <patch|minor|major>
npm publish --access public
```

The published tarball ships `src`, `lib`, `android`, `ios`, `*.podspec`, and
`react-native.config.js` (see the `files` field). The `exports` field is intentionally
omitted for now — it conflicts with New-Architecture codegen resolution.

## After publishing

- Move the `[Unreleased]` section of [`CHANGELOG.md`](../CHANGELOG.md) under the new version
  with the release date.
- Tag the release: `git tag vX.Y.Z && git push --tags`.
