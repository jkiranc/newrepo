# react-native-fabric-rich-text

An **extensible**, **native** rich-text (WYSIWYG) editor for React Native, built on the
New Architecture (Fabric).

Most existing RN rich-text editors either wrap a WebView (heavy, non-native feel) or
support only a small, fixed whitelist of HTML tags that you cannot extend. This package
takes a different approach:

- **Native rendering** — real `UITextView`/TextKit on iOS and `EditText`/`Spannable` on
  Android, exposed as a Fabric native component. No WebView.
- **Truly extensible tags** — the tag → visual mapping lives entirely in JavaScript. The
  native side only understands a small, fixed set of primitives (style runs, blocks, and
  embed placeholders). Registering a brand-new HTML tag (e.g. `<mention>`, `<callout>`,
  `<embed>`) **never requires touching native code**. This is the core differentiator.

> Status: early / phased development. The JavaScript core (HTML parsing, tag registry,
> serialization) is implemented and unit-tested. The native Fabric views are being built
> out per platform. See [Roadmap](#roadmap).

## Why the native side never sees HTML

```
        ┌─────────────────────── JavaScript / TypeScript ───────────────────────┐
HTML ──▶ parser ──▶ AST ──▶ TagRegistry ──▶ RichTextDocument ──▶ (JSON over Fabric)
                              ▲                    │
                     register your own             ▼
                       custom tags here      ┌──────────── Native ────────────┐
HTML ◀── serializer ◀── TagRegistry ◀── RichTextDocument ◀── NSAttributedString / Spannable
```

A `RichTextDocument` is a flat, native-friendly structure of **blocks**, **style runs**,
and **embed placeholders** — no notion of "a tag" at all. The `TagRegistry` is the single
place where any tag (built-in or custom) is translated to/from those primitives, so the
native layer stays generic and the tag vocabulary is fully open.

## Install

```sh
yarn add react-native-fabric-rich-text
```

Requires React Native **>= 0.76** (New Architecture only — there is no legacy-bridge
fallback for the custom native text views).

## Quick start

```tsx
import { RichTextEditor, Toolbar, type RichTextEditorRef } from 'react-native-fabric-rich-text';
import { useRef } from 'react';

export function MyEditor() {
  const ref = useRef<RichTextEditorRef>(null);
  return (
    <>
      <Toolbar editorRef={ref} />
      <RichTextEditor
        ref={ref}
        initialHtml="<p>Hello <b>world</b></p>"
        onChangeHtml={(html) => console.log(html)}
        style={{ flex: 1 }}
      />
    </>
  );
}
```

## Registering a custom tag

```ts
import { defaultTagRegistry } from 'react-native-fabric-rich-text';

defaultTagRegistry.register({
  tag: 'mention',
  category: 'embed',
  toEmbed: (attrs) => ({
    kind: 'chip',
    label: '@' + (attrs['data-label'] ?? attrs['data-id']),
    backgroundColor: '#DCEEFF',
    textColor: '#1A73E8',
    cornerRadius: 8,
    data: { mentionId: attrs['data-id'] ?? '' },
  }),
  fromEmbed: (embed) => ({
    tag: 'mention',
    attrs: { 'data-id': embed.data.mentionId, 'data-label': embed.label ?? '' },
    selfClosing: true,
  }),
});
```

`<mention data-id="123" data-label="alice">` now round-trips through the editor as a
highlighted chip — with **zero** native changes.

## Packages

- [`packages/rich-text-editor`](./packages/rich-text-editor) — the library.
- [`example`](./example) — demo app exercising built-in tags and a custom `<mention>` tag.

## Roadmap

| Phase | Scope | State |
|------:|-------|-------|
| 0 | Monorepo scaffold, CI, tooling | ✅ |
| 1 | JS core: parser, tag registry, native bridge, serializer, tests | ✅ |
| 2 | iOS native view — inline style runs (bold/italic/underline/strike, toggle + typing attributes) | ✅ code / ⏳ on-device QA |
| 3 | Android native view — parity (toggle engine + pending-style typing) | ✅ code / ⏳ on-device QA |
| 4 | Blocks (lists/quote/code) + embeds (image/chip) | ⬜ |
| 5 | Toolbar polish, docs, first publish | ⬜ |

See [`docs/architecture.md`](./docs/architecture.md) for the full design and
[`docs/testing-checklist.md`](./docs/testing-checklist.md) for the manual native QA pass.

## License

MIT — see [LICENSE](./LICENSE).
