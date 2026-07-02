# Architecture

## Goal

A native (non-WebView) React Native rich-text editor whose **tag vocabulary is fully
extensible from JavaScript**. Existing RN editors hard-code a small tag whitelist; here,
registering a new tag is a pure JS operation.

## The key idea: native never sees HTML

The tag → visual mapping (HTML parsing, the tag registry, style resolution) lives entirely
on the JS/TS side. Native code understands only a small, fixed set of **primitives**:

- **Style runs** — bold, italic, underline, strikethrough, color, background color, font
  size/family, link href, and arbitrary `data` key/values, applied over a `[start, length)`
  range of a block's text.
- **Blocks** — paragraph/heading/list-item/blockquote/code with spacing, indent, and list
  metadata.
- **Embed placeholders** — an inline slot (`U+FFFC` object-replacement char) drawn natively
  as an image or a chip (via `NSTextAttachment` on iOS, `ReplacementSpan` on Android).

The JS `TagRegistry` converts any tag — built-in or consumer-registered — into these
primitives, and back. Adding a custom tag therefore **never** requires native changes.

## Data contract

Defined in [`packages/rich-text-editor/src/types/nativeTypes.ts`](../packages/rich-text-editor/src/types/nativeTypes.ts):
`StyleRun`, `BlockNode`, `EmbedPlaceholder`, `RichTextDocument`.

The document crosses the Fabric bridge as a **JSON string** (`initialDocumentJson` prop,
`setDocument` command; `onDocumentChange` event). This deliberately sidesteps Fabric
codegen's immature support for dynamic-keyed / deeply-nested prop structs, which we need for
custom-tag `data` maps.

## Controlled-ish, but native owns the buffer

Re-sending the whole document to native on every keystroke would reproduce RN `TextInput`'s
classic controlled-`value` cursor jank. Instead:

- `initialDocumentJson` seeds the native buffer once on mount.
- The `setDocument` command replaces it wholesale only for explicit programmatic ops
  (`setHTML`, paste cleanup, undo-to-snapshot).
- Live typing stays inside native; it emits `onDocumentChange` (debounced) with the current
  `RichTextDocument`.
- JS caches the latest document, so `getHTML()` is synchronous (no round trip).
- Toolbar actions are fire-and-forget commands (`toggleInlineStyle`, `setBlockType`, …);
  native mutates its buffer and re-emits `onDocumentChange`.

## Round-trip fidelity

Native-side run **coalescing** (merging adjacent ranges with identical attributes) must match
JS expectations, or repeated edits fragment the HTML (`<b>ab</b>` → `<b>a</b><b>b</b>`).
`SpanApplier.swift` / `SpanApplier.kt` and the JS `nativeBridge` share the same coalescing
contract, verified by parity tests.

## Known risks / limitations

1. Fabric codegen dynamic-keyed props → mitigated by the JSON-string escape hatch.
2. `package.json#exports` conflicts with new-arch codegen resolution → omitted for v1.
3. Swift/Fabric interop needs a thin ObjC++ (`.mm`) shim.
4. Minimum RN 0.76 (new-arch only) — no legacy-bridge path.
5. IME/composition (CJK, predictive text) with custom attributed-string mutation is
   genuinely hard; budgeted for explicit device testing.
6. `<table>` is intentionally out of scope — neither TextKit nor Spannable has a native
   reflowable in-text grid; it could only ever be a rasterized embed.
7. Live interactive RN-subview embeds (vs. native-drawn chips/images) are a stretch goal.

See [`packages/rich-text-editor`](../packages/rich-text-editor) for the implementation and
the roadmap in the root [README](../README.md).
