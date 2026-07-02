# Changelog

All notable changes to `react-native-fabric-rich-text` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **JS core**: HTML parser (htmlparser2), tag registry with built-in tags, AST → native
  `RichTextDocument` bridge with run coalescing, and document → HTML serializer. Fully
  unit-tested (Jest).
- **Extensible tags**: `TagRegistry` lets consumers register custom inline/block/embed tags
  (e.g. `<mention>`) with no native code changes.
- **Public API**: `RichTextEditor` component + imperative ref, and a JS `Toolbar` with inline
  (bold/italic/underline/strikethrough) and block-type (P/H1/H2/quote/code) controls.
- **iOS native view** (Fabric): inline style engine (toggle + typing attributes), native
  chip/image embeds via `NSTextAttachment`, tap-to-`onEmbedPress`.
- **Android native view** (Fabric): parity inline style engine (Spannable, with span
  splitting + pending-style typing), native chip embeds via `ReplacementSpan`.
- **CI**: JS lint/typecheck/test workflow, and an Android workflow that builds a sideloadable
  release APK artifact.

### Known limitations
- Multi-block editing (Enter → new block, per-paragraph block types, visible list markers) is
  in progress; see the roadmap in the README.
- `<table>` is out of scope (no native reflowable in-text grid primitive).
- Native views require React Native ≥ 0.76 (New Architecture only).
