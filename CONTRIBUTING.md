# Contributing

Thanks for your interest in improving **react-native-fabric-rich-text**.

## Repo layout

```
packages/rich-text-editor/   # the library (JS core + native iOS/Android)
example/                     # RN app for manual testing / demos
docs/                        # architecture + testing checklist
```

This is a Yarn (v1) workspaces monorepo.

## Getting started

```sh
yarn install
yarn test        # Jest unit tests for the JS core
yarn typecheck   # tsc --noEmit
yarn lint        # eslint
```

## Where changes go

The most important rule of this project's architecture:

> **Adding or changing support for an HTML tag should be a JavaScript-only change.**

Tag → primitive translation lives in `packages/rich-text-editor/src/registry/`. The native
code only understands `StyleRun`, `BlockNode`, and `EmbedPlaceholder` (see
`src/types/nativeTypes.ts`). If you find yourself editing Swift/Kotlin to support a new
*tag*, stop — that belongs in the registry instead. Native changes are only for new
*primitive* capabilities (a new style property, a new embed drawing mode, etc.).

## Tests

- JS core (parser, registry, native bridge, serializer) is covered by Jest. Add a test for
  any parsing/serialization change; round-trip stability (`HTML → doc → HTML`) matters.
- Native span-application logic (`SpanApplier.swift` / `SpanApplier.kt`) is factored to be
  unit-testable without a live view.
- Anything involving real typing / IME / cursor / scrolling must be verified by hand via
  the example app — see [`docs/testing-checklist.md`](./docs/testing-checklist.md).

## Commit style

Small, focused commits with descriptive messages. Keep JS and native changes separable
where possible so the phased roadmap stays reviewable.
