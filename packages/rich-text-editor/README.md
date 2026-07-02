# react-native-fabric-rich-text

Extensible, native (Fabric) rich-text editor for React Native. Register custom HTML tags
without touching native code.

See the [repo README](../../README.md) for the full pitch and the
[architecture doc](../../docs/architecture.md) for the design.

## Install

```sh
yarn add react-native-fabric-rich-text
```

Requires React Native **>= 0.76** (New Architecture only).

## Usage

```tsx
import { RichTextEditor, Toolbar, type RichTextEditorRef } from 'react-native-fabric-rich-text';
import { useRef } from 'react';

function Editor() {
  const ref = useRef<RichTextEditorRef>(null);
  return (
    <>
      <Toolbar editorRef={ref} />
      <RichTextEditor
        ref={ref}
        initialHtml="<p>Hello <b>world</b></p>"
        onChangeHtml={setHtml}
        style={{ flex: 1 }}
      />
    </>
  );
}
```

### Component props (`RichTextEditorProps`)

| Prop | Type | Notes |
|------|------|-------|
| `initialHtml` | `string` | Applied once on mount. |
| `editable` | `boolean` | Defaults to `true`. |
| `placeholder` | `string` | |
| `registry` | `TagRegistry` | Defaults to `defaultTagRegistry`. |
| `onChangeHtml` | `(html: string) => void` | Debounced. |
| `onSelectionChange` | `(s: SelectionChange) => void` | Active styles for toolbar state. |
| `onEmbedPress` | `(tag, data) => void` | |

### Imperative ref (`RichTextEditorRef`)

`focus` · `blur` · `getHTML` · `setHTML` · `toggleBold` · `toggleItalic` ·
`toggleUnderline` · `toggleStrikethrough` · `toggleInlineStyle` (adds
`superscript`/`subscript`) · `setBlockType` · `setAlignment` · `setTextColor` ·
`setLink` · `adjustIndent` · `toggleList` (`bullet`/`ordered`/`check`) ·
`insertText` · `insertImage` · `insertTable` · `insertEmbed` · `undo` · `redo`.

## Registering a custom tag

```ts
import { defaultTagRegistry } from 'react-native-fabric-rich-text';

defaultTagRegistry.register({
  tag: 'mention',
  category: 'embed',
  toEmbed: (attrs) => ({
    kind: 'chip',
    label: '@' + attrs['data-label'],
    data: { mentionId: attrs['data-id'] ?? '' },
  }),
  fromEmbed: (embed) => ({
    tag: 'mention',
    attrs: { 'data-id': embed.data.mentionId },
    selfClosing: true,
  }),
});
```

`category` is `'inline'` (→ `StyleRun`), `'block'` (→ `BlockNode`), or `'embed'`
(→ `EmbedPlaceholder`). Provide `to*` hooks for parsing HTML and `from*` hooks for
serialization. See `src/registry/builtInTags.ts` for the built-in definitions.

## Built-in tags

`b`/`strong`, `i`/`em`, `u`, `s`/`strike`/`del`, `sup`, `sub`, `code`, `a`,
`span[style]`, `p`/`div`, `h1`–`h6`, `blockquote`, `pre`, `li`, `ul`/`ol`
(including `<li data-checked>` checklists), `img`, `br`, and read-only `table`
(rows/cells flattened to text; the first `th` row renders as a header).

## Development

```sh
yarn        # from repo root
yarn test   # Jest unit tests for the JS core
```
